/** Phase 4 targeted P1 corrections (P1-01 … P1-05). Deterministic: async gates, injected clock. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proposalStudio as P } from "@/data/proposal-studio";
import { QUARANTINE_KEY, STORAGE_KEY, memoryBackend, store } from "@/data/store";
import { AccessDeniedError } from "@/domain/permissions";
import {
  priceUseProblems,
  proposalClock,
  validityEnd,
  versionIntegrityProblems,
  type ProposalVersionRecord,
} from "@/domain/proposal";
import { MOCK_PRICE_BOOK, pricingStudio } from "@/integrations/adapters/pricing-studio";
import {
  ADMIN,
  issuedProposal,
  readyProposal,
  resetProposalTestState,
  REVIEWER,
} from "./proposal-fixtures";
import { MGR, PRO } from "./solution-fixtures";

const realBook = pricingStudio.getPriceBook;
const realNow = proposalClock.now;
const AFTER_PRICE_EXPIRY = "2027-04-01T00:00:00.000Z"; // mock prices are valid until 2027-03-31
beforeEach(resetProposalTestState);
afterEach(() => {
  pricingStudio.getPriceBook = realBook;
  proposalClock.now = realNow;
});
const at = (iso: string) => (proposalClock.now = () => iso);

/** Holds the next Pricing Studio call open until released (no timers). */
function holdPricing() {
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const reached = new Promise<void>((r) => (entered = r));
  pricingStudio.getPriceBook = async () => {
    pricingStudio.getPriceBook = realBook;
    entered();
    await gate;
    return realBook();
  };
  return { reached, release };
}
const ackOf = (v: ProposalVersionRecord) => [
  ...v.document.deliverables.filter((d) => d.info.needsQualification).map((d) => d.id),
  ...v.document.risks.filter((x) => x.resolution === "accepted").map((x) => x.id),
];
async function approvedProposal() {
  const r = await readyProposal();
  const ver = await P.submitForReview(PRO, r.p.id);
  await P.approve(REVIEWER, r.p.id, ver.id, { acknowledged: ackOf(ver) });
  return { ...r, ver };
}
const versionRow = (id: string) => store.table("proposalVersions").find((v) => v.id === id)!;
const status = (id: string) => store.table("proposals").find((x) => x.id === id)!.status;

describe("P1-01 stale issuance, submission and approval", () => {
  it("rejects issuance when the proposal is edited while pricing is pending", async () => {
    const { p, ver } = await approvedProposal();
    const hold = holdPricing();
    const issuing = P.issue(MGR, p.id, ver.id);
    await hold.reached;
    await P.saveSection(PRO, p.id, "next_steps", { body: "Changed during issuance" });
    hold.release();
    await expect(issuing).rejects.toThrow(/changed while/);
    expect(versionRow(ver.id).issue).toBeUndefined();
    expect(status(p.id)).toBe("draft");
  });
  it("rejects issuance when approval is invalidated while pricing is pending", async () => {
    const { p, ver, view } = await approvedProposal();
    const d = view.workspace.deliverables[0]!;
    const hold = holdPricing();
    const issuing = P.issue(MGR, p.id, ver.id);
    await hold.reached;
    await P.upsertChild(PRO, p.id, "deliverables", {
      id: d.id,
      recommendationId: d.recommendationId,
      description: d.description,
      inclusion: "included",
      acceptanceCriterion: "A different acceptance criterion",
      responsibleParty: "aurumi",
      qualification: "Depends on validating the Tally connector for this edition",
    });
    expect(versionRow(ver.id).supersededAt).toBeTruthy();
    hold.release();
    await expect(issuing).rejects.toThrow(/changed while/);
    expect(versionRow(ver.id).issue).toBeUndefined();
  });
  it("only one of two concurrent issuance attempts succeeds", async () => {
    const { p, ver } = await approvedProposal();
    const r = await Promise.allSettled([P.issue(MGR, p.id, ver.id), P.issue(MGR, p.id, ver.id)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect(status(p.id)).toBe("shared");
    const ws = store.table("proposalWorkspaces").find((w) => w.proposalId === p.id)!;
    expect(ws.comments.filter((c) => c.kind === "issued")).toHaveLength(1);
  });
  it("rejects issuance when the version is superseded mid-operation", async () => {
    const { p, ver } = await approvedProposal();
    const hold = holdPricing();
    const issuing = P.issue(MGR, p.id, ver.id);
    await hold.reached;
    await P.revise(PRO, p.id, "Customer asked for more users");
    hold.release();
    await expect(issuing).rejects.toThrow();
    expect(versionRow(ver.id).issue).toBeUndefined();
    expect(versionRow(ver.id).supersededAt).toBeTruthy();
    expect(status(p.id)).toBe("draft");
  });
  it("issues normally when nothing changes while pricing is pending", async () => {
    const { p, ver } = await approvedProposal();
    const hold = holdPricing();
    const issuing = P.issue(MGR, p.id, ver.id);
    await hold.reached;
    hold.release();
    expect((await issuing).issue).toBeTruthy();
    expect(status(p.id)).toBe("shared");
  });
  it("submission and approval also reject state that changed while pricing was pending", async () => {
    const { p } = await readyProposal();
    let hold = holdPricing();
    const submitting = P.submitForReview(PRO, p.id);
    await hold.reached;
    await P.saveSection(PRO, p.id, "next_steps", { body: "Edited during submission" });
    hold.release();
    await expect(submitting).rejects.toThrow(/changed while/);
    expect(store.table("proposalVersions").filter((v) => v.proposalId === p.id)).toHaveLength(0);
    expect(status(p.id)).toBe("draft");

    const ver = await P.submitForReview(PRO, p.id);
    hold = holdPricing();
    const approving = P.approve(REVIEWER, p.id, ver.id, { acknowledged: ackOf(ver) });
    await hold.reached;
    await P.requestChanges(ADMIN, p.id, ver.id, "Needs a different scope");
    hold.release();
    await expect(approving).rejects.toThrow(/changed while/);
    expect(versionRow(ver.id).review?.decision).toBe("changes_requested");
    expect(status(p.id)).toBe("changes_requested");
  });
});

describe("P1-02 published prices bound to the right capability", () => {
  it("accepts the Receivables app with its own published price and records the binding", async () => {
    const { p } = await readyProposal();
    const lid = await P.upsertChild(PRO, p.id, "lines", {
      category: "aurumi_subscription",
      catalogItemId: "app_receivables",
      priceBookItemId: "pb_receivables",
      description: "Receivables app (second org)",
    });
    const l = (await P.get(PRO, p.id)).workspace.lines.find((x) => x.id === lid)!;
    expect(l.catalogItemId).toBe("app_receivables");
    expect(l.priceRef?.catalogItemId).toBe("app_receivables");
  });
  it("rejects the Receivables app priced with the unrelated core-user price", async () => {
    const { p } = await readyProposal();
    await expect(
      P.upsertChild(PRO, p.id, "lines", {
        category: "aurumi_subscription",
        catalogItemId: "app_receivables",
        priceBookItemId: "pb_core_user",
        description: "Receivables app",
      }),
    ).rejects.toThrow(/applies to general subscriptions, not app_receivables/);
  });
  it("still allows a general subscription line", async () => {
    const { p } = await readyProposal();
    await P.upsertChild(PRO, p.id, "lines", {
      category: "aurumi_subscription",
      priceBookItemId: "pb_core_user",
      quantity: 5,
      description: "Workspace users",
    });
    const v = await P.get(PRO, p.id);
    expect(v.readiness.find((i) => i.key === "commercials")!.ok).toBe(true);
  });
  it("a mismatched price needs an exception authorized by someone other than the author", async () => {
    const { p } = await readyProposal();
    const lid = await P.upsertChild(PRO, p.id, "lines", {
      category: "aurumi_subscription",
      catalogItemId: "app_receivables",
      priceBookItemId: "pb_core_user",
      description: "Receivables seats",
      priceException: { rationale: "Bundled per-user pricing agreed", permits: ["applicability"] },
    });
    let v = await P.get(PRO, p.id);
    expect(v.commercials.lines[lid]!.basis).toBe("price_exception");
    expect(v.readiness.find((i) => i.key === "commercials")!.detail.join()).toMatch(
      /price exception awaits authorization/,
    );
    await expect(P.submitForReview(PRO, p.id)).rejects.toThrow(/not ready/);
    await expect(
      P.authorizeCommercial(PRO, p.id, { kind: "exception", itemId: lid }),
    ).rejects.toThrow(AccessDeniedError);
    await P.authorizeCommercial(REVIEWER, p.id, { kind: "exception", itemId: lid });
    v = await P.get(PRO, p.id);
    expect(v.readiness.find((i) => i.key === "commercials")!.ok).toBe(true);
  });
  it("the priced identity and approved exception are preserved in the issued snapshot", async () => {
    const { p } = await readyProposal();
    const lid = await P.upsertChild(PRO, p.id, "lines", {
      category: "aurumi_subscription",
      catalogItemId: "app_receivables",
      priceBookItemId: "pb_core_user",
      description: "Receivables seats",
      priceException: { rationale: "Bundled per-user pricing agreed", permits: ["applicability"] },
    });
    await P.authorizeCommercial(REVIEWER, p.id, { kind: "exception", itemId: lid });
    const ver = await P.submitForReview(PRO, p.id);
    await P.approve(REVIEWER, p.id, ver.id, { acknowledged: ackOf(ver) });
    const issued = await P.issue(MGR, p.id, ver.id);
    const l = issued.document.commercials.lines.find((x) => x.id === lid)!;
    expect(l.catalogItemId).toBe("app_receivables");
    expect(l.priceRef).toMatchObject({ priceBookItemId: "pb_core_user" });
    expect(l.priceRef!.catalogItemId).toBeUndefined();
    expect(l.priceException).toMatchObject({
      permits: ["applicability"],
      authorization: { approvedBy: REVIEWER.user.id },
    });
    expect(l.computed.basis).toBe("price_exception");
  });
});

describe("P1-03 published-price validity", () => {
  it("currently valid prices pass readiness", async () => {
    const { view } = await readyProposal();
    expect(view.readiness.find((i) => i.key === "commercials")!.ok).toBe(true);
  });
  it("rejects submission once a price has expired", async () => {
    const { p } = await readyProposal();
    at(AFTER_PRICE_EXPIRY);
    await expect(P.submitForReview(PRO, p.id)).rejects.toThrow(/expired on 2027-03-31/);
  });
  it("rejects approval once a price has expired", async () => {
    const { p } = await readyProposal();
    const ver = await P.submitForReview(PRO, p.id);
    at(AFTER_PRICE_EXPIRY);
    await expect(P.approve(REVIEWER, p.id, ver.id, { acknowledged: ackOf(ver) })).rejects.toThrow(
      /expired/,
    );
    expect(versionRow(ver.id).review).toBeUndefined();
  });
  it("blocks issuance when a price expires between approval and issuance", async () => {
    const { p, ver } = await approvedProposal();
    at(AFTER_PRICE_EXPIRY);
    await expect(P.issue(MGR, p.id, ver.id)).rejects.toThrow(/expired/);
    expect(versionRow(ver.id).issue).toBeUndefined();
    expect(status(p.id)).toBe("approved");
    expect(versionRow(ver.id).document.commercials.lines[0]!.priceRef!.validUntil).toBe(
      "2027-03-31",
    );
  });
  it("treats invalid validity dates as problems", async () => {
    expect(validityEnd("2027-03-31")).toBe(Date.parse("2027-03-31T23:59:59.999Z"));
    expect(validityEnd("2027-02-30")).toBeNull();
    expect(validityEnd("soon")).toBeNull();
    expect(validityEnd(undefined)).toBeNull();
    const item = MOCK_PRICE_BOOK.items.find((i) => i.id === "pb_training")!;
    item.validUntil = "2027-02-30";
    try {
      const { p } = await readyProposal();
      await P.upsertChild(PRO, p.id, "lines", {
        category: "training",
        priceBookItemId: "pb_training",
        description: "Training",
      });
      const v = await P.get(PRO, p.id);
      expect(v.readiness.find((i) => i.key === "commercials")!.detail.join()).toMatch(
        /invalid validity date/,
      );
    } finally {
      item.validUntil = "2027-03-31";
    }
  });
  it("an expired price is usable only with an authorized exception", async () => {
    const { p } = await readyProposal();
    at(AFTER_PRICE_EXPIRY);
    await expect(
      P.upsertChild(PRO, p.id, "lines", {
        category: "advisory",
        priceBookItemId: "pb_cia_day",
        description: "Advisory day",
      }),
    ).rejects.toThrow(/expired/);
    const ref = (await P.get(PRO, p.id)).workspace.lines[0]!.priceRef!;
    const line = { description: "x", priceRef: ref };
    expect(priceUseProblems(line).join()).toMatch(/expired/);
    expect(
      priceUseProblems({
        ...line,
        priceException: { rationale: "Held price", permits: ["expired"] },
      }).join(),
    ).toMatch(/awaits authorization/);
    expect(
      priceUseProblems({
        ...line,
        priceException: {
          rationale: "Held price",
          permits: ["expired"],
          authorization: { approvedBy: "u_reviewer", approvedAt: AFTER_PRICE_EXPIRY },
        },
      }),
    ).toEqual([]);
  });
});

describe("P1-04 share and issued-version expiry", () => {
  async function shared() {
    const r = await issuedProposal();
    const s = await P.share(MGR, r.p.id, {
      versionId: r.issued.id,
      recipient: { name: "B", email: "b@example.com" },
    });
    return { ...r, s };
  }
  const LATER = "2031-01-01T00:00:00.000Z";
  for (const before of [undefined, "viewed", "acknowledged"] as const)
    it(`a ${before ?? "pending"} share expires and cannot be accepted`, async () => {
      const { p, s } = await shared();
      if (before) await P.recordResponse(MGR, s.id, { response: before });
      at(LATER);
      expect((await P.get(PRO, p.id)).shares[0]!.effective).toBe("expired");
      await expect(P.recordResponse(MGR, s.id, { response: "accepted" })).rejects.toThrow(
        /final \(expired\)|expired/,
      );
      expect(status(p.id)).toBe("shared");
    });
  it("acceptance recorded before expiry stays valid afterwards", async () => {
    const { p, s } = await shared();
    await P.recordResponse(MGR, s.id, { response: "accepted" });
    at(LATER);
    expect((await P.get(PRO, p.id)).shares[0]!.effective).toBe("accepted");
    expect(status(p.id)).toBe("accepted");
  });
  it("a revoked share cannot be accepted", async () => {
    const { s } = await shared();
    await P.revokeShare(MGR, s.id);
    await expect(P.recordResponse(MGR, s.id, { response: "accepted" })).rejects.toThrow(/revoked/);
  });
  it("rejects invalid expiry timestamps", async () => {
    const { p, issued } = await issuedProposal();
    for (const expiresAt of ["not-a-date", "", "2027-01-01"])
      await expect(
        P.share(MGR, p.id, {
          versionId: issued.id,
          recipient: { name: "B", email: "b@example.com" },
          expiresAt,
        }),
      ).rejects.toThrow(/valid expiry/);
  });
  it("issued-version expiry overrides a longer share validity", async () => {
    const { p, s, issued } = await shared();
    store.replace(
      "proposalShares",
      store
        .table("proposalShares")
        .map((x) => (x.id === s.id ? { ...x, expiresAt: "2099-01-01T00:00:00.000Z" } : x)),
    );
    at(new Date(Date.parse(issued.issue!.expiresAt) + 1000).toISOString());
    expect((await P.get(PRO, p.id)).shares[0]!.effective).toBe("expired");
    await expect(P.recordResponse(MGR, s.id, { response: "accepted" })).rejects.toThrow(/expired/);
  });
});

describe("P1-05 restored immutable proposal versions", () => {
  type Mut = (v: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  async function restoreWith(mut: Mut) {
    const backend = memoryBackend();
    store.attach(backend);
    const r = await issuedProposal();
    const saved = JSON.parse(backend.read(STORAGE_KEY)!);
    const copy = structuredClone(saved.tables.proposalVersions[0]);
    copy.id = "pv_corrupt";
    mut(copy);
    saved.tables.proposalVersions.push(copy);
    backend.write(STORAGE_KEY, JSON.stringify(saved));
    store.attach(backend);
    return { ...r, backend };
  }
  it("a valid restored version keeps its approval", async () => {
    const backend = memoryBackend();
    store.attach(backend);
    const { p, issued } = await issuedProposal();
    store.attach(backend);
    expect(store.persistence().quarantined).toBe(0);
    const v = (await P.get(PRO, p.id)).versions.find((x) => x.id === issued.id)!;
    expect(v.review?.decision).toBe("approved");
    expect(versionIntegrityProblems(v)).toEqual([]);
  });
  const cases: [string, Mut][] = [
    ["corrupted line amount", (v) => (v.document.commercials.lines[0].computed.amount = 1)],
    ["corrupted monthly total", (v) => (v.document.commercials.summary.totals[0].monthly += 1)],
    ["null computed amount", (v) => (v.document.commercials.lines[0].computed.amount = null)],
    ["broken proposal/version relationship", (v) => (v.proposalId = "prp_other")],
    ["mismatched approval hash", (v) => (v.contentHash = "fnv1a-deadbeef-1")],
    [
      "altered unit price with matching amounts",
      (v) => {
        const l = v.document.commercials.lines[0];
        l.priceRef.publishedAmount = 1;
        l.computed = { ...l.computed, unitAmount: 1, amount: 1 };
      },
    ],
  ];
  for (const [name, mut] of cases)
    it(`quarantines a version with a ${name} and keeps the valid sibling`, async () => {
      const { p, issued, backend } = await restoreWith(mut);
      expect(store.persistence()).toMatchObject({ quarantined: 1, backupSaved: true });
      const ids = (await P.get(PRO, p.id)).versions.map((x) => x.id);
      expect(ids).toEqual([issued.id]);
      const backup = JSON.parse(backend.read(QUARANTINE_KEY)!);
      expect(JSON.stringify(backup)).toContain("pv_corrupt");
    });
  it("if the recovery copy cannot be saved, the original payload is untouched and writes pause", async () => {
    const m = new Map<string, string>();
    const ctl = { fail: false };
    const backend = {
      kind: "memory" as const,
      read: (k: string) => m.get(k) ?? null,
      write: (k: string, v: string) => {
        if (k === QUARANTINE_KEY && ctl.fail) throw new Error("QuotaExceededError");
        m.set(k, v);
      },
    };
    store.attach(backend);
    await issuedProposal();
    const saved = JSON.parse(m.get(STORAGE_KEY)!);
    saved.tables.proposalVersions[0].document.commercials.lines[0].computed.amount = 7;
    const raw = JSON.stringify(saved);
    m.set(STORAGE_KEY, raw);
    ctl.fail = true;
    store.attach(backend);
    expect(store.persistence()).toMatchObject({ protected: true, backupSaved: false });
    expect(m.get(STORAGE_KEY)).toBe(raw);
  });
  it("an approved version that fails validation cannot be issued", async () => {
    const backend = memoryBackend();
    store.attach(backend);
    const { p, ver } = await approvedProposal();
    // Corrupted in memory: issuance re-validates the document itself.
    store.replace(
      "proposalVersions",
      store.table("proposalVersions").map((v) => {
        if (v.id !== ver.id) return v;
        const c = structuredClone(v) as unknown as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        c.document.commercials.summary.totals[0].monthly = 1;
        return c as unknown as ProposalVersionRecord;
      }),
    );
    await expect(P.issue(MGR, p.id, ver.id)).rejects.toThrow(/version integrity/);
    // Corrupted in storage: the version is quarantined on reload and cannot be issued.
    store.replace("proposalVersions", store.table("proposalVersions"));
    store.attach(backend);
    expect(store.persistence().quarantined).toBe(1);
    await expect(P.issue(MGR, p.id, ver.id)).rejects.toThrow(/current approved version/);
    expect(status(p.id)).toBe("approved");
  });
});

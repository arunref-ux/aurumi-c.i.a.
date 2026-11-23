/** Phase 4 final three P1 corrections (P1-02, P1-03, P1-05). Deterministic clocks, no timers. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proposalStudio as P } from "@/data/proposal-studio";
import { QUARANTINE_KEY, STORAGE_KEY, memoryBackend, store } from "@/data/store";
import {
  proposalClock,
  validityEnd,
  versionIntegrityProblems,
  type ProposalVersionRecord,
} from "@/domain/proposal";
import { MOCK_PRICE_BOOK } from "@/integrations/adapters/pricing-studio";
import {
  issuedProposal,
  readyProposal,
  resetProposalTestState,
  REVIEWER,
} from "./proposal-fixtures";
import { MGR, PRO } from "./solution-fixtures";

const realNow = proposalClock.now;
beforeEach(resetProposalTestState);
afterEach(() => {
  proposalClock.now = realNow;
});
const ackOf = (v: ProposalVersionRecord) => [
  ...v.document.deliverables.filter((d) => d.info.needsQualification).map((d) => d.id),
  ...v.document.risks.filter((x) => x.resolution === "accepted").map((x) => x.id),
];
const lineOf = async (pid: string, lid: string) =>
  (await P.get(PRO, pid)).workspace.lines.find((x) => x.id === lid)!;
async function receivablesLine() {
  const r = await readyProposal();
  const lid = await P.upsertChild(PRO, r.p.id, "lines", {
    category: "aurumi_subscription",
    catalogItemId: "app_receivables",
    priceBookItemId: "pb_receivables",
    description: "Receivables app",
  });
  return { ...r, lid };
}

describe("P1-02 capability identity survives line updates", () => {
  it("omitting the capability while switching to an unrelated price is rejected", async () => {
    const { p, lid } = await receivablesLine();
    await expect(
      P.upsertChild(PRO, p.id, "lines", {
        id: lid,
        category: "aurumi_subscription",
        priceBookItemId: "pb_core_user",
        description: "Receivables app",
      }),
    ).rejects.toThrow(/applies to general subscriptions, not app_receivables/);
    const l = await lineOf(p.id, lid);
    expect(l.catalogItemId).toBe("app_receivables");
    expect(l.priceRef?.priceBookItemId).toBe("pb_receivables");
  });
  it("the same switch with an omitted capability needs an authorized exception before issue", async () => {
    const { p, lid } = await receivablesLine();
    await P.upsertChild(PRO, p.id, "lines", {
      id: lid,
      category: "aurumi_subscription",
      priceBookItemId: "pb_core_user",
      description: "Receivables app",
      priceException: { rationale: "Bundled per-user pricing", permits: ["applicability"] },
    });
    expect((await lineOf(p.id, lid)).catalogItemId).toBe("app_receivables");
    await expect(P.submitForReview(PRO, p.id)).rejects.toThrow(/awaits authorization/);
    await P.authorizeCommercial(REVIEWER, p.id, { kind: "exception", itemId: lid });
    const ver = await P.submitForReview(PRO, p.id);
    await P.approve(REVIEWER, p.id, ver.id, { acknowledged: ackOf(ver) });
    const issued = await P.issue(MGR, p.id, ver.id);
    const l = issued.document.commercials.lines.find((x) => x.id === lid)!;
    expect(l.catalogItemId).toBe("app_receivables");
    expect(l.priceRef?.priceBookItemId).toBe("pb_core_user");
    expect(l.priceException?.authorization?.approvedBy).toBe(REVIEWER.user.id);
    expect(l.computed.basis).toBe("price_exception");
  });
  it("an update that changes neither price nor capability stays valid", async () => {
    const { p, lid } = await receivablesLine();
    await P.upsertChild(PRO, p.id, "lines", {
      id: lid,
      category: "aurumi_subscription",
      priceBookItemId: "pb_receivables",
      quantity: 3,
      description: "Receivables app (3 orgs)",
    });
    const l = await lineOf(p.id, lid);
    expect(l).toMatchObject({ catalogItemId: "app_receivables", quantity: 3 });
    const v = await P.get(PRO, p.id);
    expect(v.readiness.find((i) => i.key === "commercials")!.ok).toBe(true);
  });
  it("explicit capability replacement is validated and audited", async () => {
    const { p, lid, handoff } = await receivablesLine();
    await expect(
      P.upsertChild(PRO, p.id, "lines", {
        id: lid,
        category: "aurumi_subscription",
        catalogItemId: "not_in_solution",
        priceBookItemId: "pb_receivables",
        description: "x",
      }),
    ).rejects.toThrow(/not a capability in the approved solution/);
    const other = handoff.catalog.items.find((c) => c.id !== "app_receivables")!;
    await expect(
      P.upsertChild(PRO, p.id, "lines", {
        id: lid,
        category: "aurumi_subscription",
        catalogItemId: other.id,
        priceBookItemId: "pb_receivables",
        description: "x",
      }),
    ).rejects.toThrow(new RegExp(`not ${other.id}`));
    await P.upsertChild(PRO, p.id, "lines", {
      id: lid,
      category: "aurumi_subscription",
      catalogItemId: other.id,
      priceBookItemId: "pb_receivables",
      description: "x",
      priceException: { rationale: "Repurposed", permits: ["applicability"] },
    });
    expect((await lineOf(p.id, lid)).catalogItemId).toBe(other.id);
    const audit = store.audit().filter((a) => a.resourceId === p.id);
    expect(
      audit.some(
        (a) => a.action === "proposal.price_exception" || a.action === "proposal.capability",
      ),
    ).toBe(true);
  });
  it("records a capability change without exception as proposal.capability", async () => {
    const r = await readyProposal();
    const lid = await P.upsertChild(PRO, r.p.id, "lines", {
      category: "aurumi_subscription",
      priceBookItemId: "pb_core_user",
      description: "Seats",
    });
    await P.upsertChild(PRO, r.p.id, "lines", {
      id: lid,
      category: "aurumi_subscription",
      catalogItemId: "app_receivables",
      priceBookItemId: "pb_receivables",
      description: "Receivables",
    });
    expect(store.audit().some((a) => a.action === "proposal.capability")).toBe(true);
  });
  it("explicit removal cannot keep a capability-specific price", async () => {
    const { p, lid } = await receivablesLine();
    await expect(
      P.upsertChild(PRO, p.id, "lines", {
        id: lid,
        category: "aurumi_subscription",
        catalogItemId: null,
        priceBookItemId: "pb_receivables",
        description: "x",
      }),
    ).rejects.toThrow(/capability cannot be removed/);
    expect((await lineOf(p.id, lid)).catalogItemId).toBe("app_receivables");
  });
  it("a new general subscription remains valid", async () => {
    const { p } = await readyProposal();
    const lid = await P.upsertChild(PRO, p.id, "lines", {
      category: "aurumi_subscription",
      priceBookItemId: "pb_core_user",
      quantity: 4,
      description: "Users",
    });
    expect((await lineOf(p.id, lid)).catalogItemId).toBeUndefined();
    expect((await P.get(PRO, p.id)).readiness.find((i) => i.key === "commercials")!.ok).toBe(true);
  });
});

describe("P1-03 calendar-checked validity timestamps", () => {
  it.each([
    "2027-02-30T00:00:00Z",
    "2027-02-30T05:30:00+05:30",
    "2027-02-29T00:00:00Z",
    "2027-02-29",
    "2027-04-31T12:00:00Z",
    "2027-03-31T24:00:00Z",
    "2027-03-31T23:60:00Z",
    "2027-03-31T23:59:60Z",
    "2027-03-31T10:00:00+15:00",
    "2027-03-31T10:00:00+05:60",
    "2027-13-01",
    "2027-00-10T00:00:00Z",
  ])("rejects %s", (v) => expect(validityEnd(v)).toBeNull());
  it("accepts real dates and offsets", () => {
    expect(validityEnd("2028-02-29T00:00:00Z")).toBe(Date.parse("2028-02-29T00:00:00Z"));
    expect(validityEnd("2027-03-31T05:30:00+05:30")).toBe(Date.parse("2027-03-31T00:00:00Z"));
    expect(validityEnd("2027-03-31T23:59:59.5-04:00")).toBe(Date.parse("2027-04-01T03:59:59.500Z"));
    expect(validityEnd("2027-03-31")).toBe(Date.parse("2027-03-31T23:59:59.999Z"));
  });
  it("a malformed full timestamp blocks readiness, submission, approval and issue", async () => {
    proposalClock.now = () => "2026-12-01T00:00:00.000Z";
    const item = MOCK_PRICE_BOOK.items.find((i) => i.id === "pb_training")!;
    const orig = item.validUntil;
    try {
      const { p } = await readyProposal();
      const ver = await P.submitForReview(PRO, p.id);
      item.validUntil = "2027-02-30T00:00:00Z";
      await expect(
        P.upsertChild(PRO, p.id, "lines", {
          category: "training",
          priceBookItemId: "pb_training",
          description: "T",
        }),
      ).rejects.toThrow();
      // Approval re-checks the frozen version's prices against the current book.
      const v = store.table("proposalVersions").find((x) => x.id === ver.id)!;
      const l = v.document.commercials.lines[0]!;
      const bad = structuredClone(v) as unknown as {
        document: { commercials: { lines: { priceRef?: { validUntil: string } }[] } };
      };
      bad.document.commercials.lines[0]!.priceRef!.validUntil = "2027-02-30T00:00:00Z";
      expect(l.priceRef).toBeDefined();
      store.replace(
        "proposalVersions",
        store
          .table("proposalVersions")
          .map((x) => (x.id === ver.id ? (bad as unknown as ProposalVersionRecord) : x)),
      );
      await expect(
        P.approve(REVIEWER, p.id, ver.id, { acknowledged: ackOf(ver) }),
      ).rejects.toThrow();
      expect(store.table("proposalVersions").find((x) => x.id === ver.id)!.review).toBeUndefined();
    } finally {
      item.validUntil = orig;
    }
  });
});

describe("P1-05 embedded source content is bound to version integrity", () => {
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
  const cases: [string, Mut][] = [
    ["substituted embedded solution id", (v) => (v.document.solution.solutionId = "sol_other")],
    ["substituted embedded snapshot id", (v) => (v.document.solution.id = "ssnap_other")],
    [
      "substituted assessment requirement (ids unchanged)",
      (v) =>
        (v.document.solution.sourceAssessment.requirements[0].statement = "Replaced requirement"),
    ],
    [
      "substituted catalog capability",
      (v) => (v.document.solution.catalog.items[0].capability = "Something else"),
    ],
    [
      "substituted catalog dependency",
      (v) => v.document.solution.catalog.items[0].dependencies.push("cat_injected"),
    ],
    ["mismatched embedded version", (v) => (v.document.solution.version += 1)],
    ["mismatched assessment version", (v) => (v.document.solution.sourceAssessment.version += 1)],
  ];
  for (const [name, mut] of cases)
    it(`quarantines a ${name} and keeps the valid sibling`, async () => {
      const { p, issued, backend } = await restoreWith(mut);
      expect(store.persistence()).toMatchObject({ quarantined: 1, backupSaved: true });
      expect((await P.get(PRO, p.id)).versions.map((x) => x.id)).toEqual([issued.id]);
      expect(JSON.stringify(JSON.parse(backend.read(QUARANTINE_KEY)!))).toContain("pv_corrupt");
    });
  it("detects embedded content changes directly, with the outer source and hash unchanged", async () => {
    const { issued } = await issuedProposal();
    const c = structuredClone(issued) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    c.document.solution.sourceAssessment.requirements[0].statement = "x";
    expect(versionIntegrityProblems(c).join()).toMatch(/content hash/);
    const d = structuredClone(issued) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    d.document.solution.solutionId = "sol_other";
    expect(versionIntegrityProblems(d).join()).toMatch(/embedded solution id/);
  });
  it("a valid version stays intact when live solution and price records change", async () => {
    const backend = memoryBackend();
    store.attach(backend);
    const { p, issued } = await issuedProposal();
    const before = JSON.stringify(issued.document);
    store.replace(
      "solutions",
      store.table("solutions").map((s) => ({ ...s, title: `${s.title} (edited later)` })),
    );
    const item = MOCK_PRICE_BOOK.items[0]!;
    const amt = item.amount;
    item.amount = amt + 1;
    try {
      store.attach(backend);
      expect(store.persistence().quarantined).toBe(0);
      const v = (await P.get(PRO, p.id)).versions.find((x) => x.id === issued.id)!;
      expect(versionIntegrityProblems(v)).toEqual([]);
      expect(JSON.stringify(v.document)).toBe(before);
    } finally {
      item.amount = amt;
    }
  });
  it("issuance is rejected when approved source content is corrupted", async () => {
    const r = await readyProposal();
    const ver = await P.submitForReview(PRO, r.p.id);
    await P.approve(REVIEWER, r.p.id, ver.id, { acknowledged: ackOf(ver) });
    store.replace(
      "proposalVersions",
      store.table("proposalVersions").map((v) => {
        if (v.id !== ver.id) return v;
        const c = structuredClone(v) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        c.document.solution.sourceAssessment.requirements[0].statement = "Swapped";
        return c as ProposalVersionRecord;
      }),
    );
    await expect(P.issue(MGR, r.p.id, ver.id)).rejects.toThrow(/version integrity/);
    expect(store.table("proposalVersions").find((v) => v.id === ver.id)!.issue).toBeUndefined();
  });
});

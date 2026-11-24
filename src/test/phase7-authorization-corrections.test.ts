/** P7-P1-A stale issuance authority and P7-P1-B partial-issuance source eligibility. Fictional data. */
import { beforeEach, describe, expect, it } from "vitest";
import { proposalStudio as P } from "@/data/proposal-studio";
import { engagementService as E } from "@/data/delivery";
import { STORAGE_KEY, memoryBackend, store, type PersistenceBackend } from "@/data/store";
import { proposalShareAdapter } from "@/integrations/adapters/proposal-share";
import { pricingStudio } from "@/integrations/adapters/pricing-studio";
import { proposalScopeTerms } from "@/domain/delivery";
import type { User } from "@/domain/types";
import { readyProposal, resetProposalTestState, REVIEWER } from "./proposal-fixtures";
import { MGR, PRO } from "./solution-fixtures";
import { creation, first, reset } from "./delivery-fixtures";

const realBook = pricingStudio.getPriceBook;
beforeEach(() => {
  pricingStudio.getPriceBook = realBook;
  reset();
  resetProposalTestState();
});

async function approved(b: PersistenceBackend) {
  store.attach(b);
  const r = await readyProposal();
  const ver = await P.submitForReview(PRO, r.p.id);
  const ack = [
    ...ver.document.deliverables.filter((d) => d.info.needsQualification).map((d) => d.id),
    ...ver.document.risks.filter((x) => x.resolution === "accepted").map((x) => x.id),
  ];
  await P.approve(REVIEWER, r.p.id, ver.id, { acknowledged: ack });
  return { pid: r.p.id, vid: ver.id };
}
/** Pause the next real price-book read; `release()` lets it resolve. */
function pausePricing() {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  pricingStudio.getPriceBook = async () => {
    pricingStudio.getPriceBook = realBook;
    await gate;
    return realBook();
  };
  return () => release();
}
const editCanonical = (id: string, f: (u: User) => User | null) =>
  store.replace(
    "users",
    store
      .table("users")
      .map((u) => (u.id === id ? f(u) : u))
      .filter((u): u is User => !!u),
  );
const saved = (b: PersistenceBackend) => JSON.parse(b.read(STORAGE_KEY)!);
function state(b: PersistenceBackend, pid: string, vid: string) {
  const s = saved(b);
  const v = s.tables.proposalVersions.find((x: { id: string }) => x.id === vid);
  return {
    status: s.tables.proposals.find((p: { id: string }) => p.id === pid).status,
    issue: v.issue ?? null,
    hash: v.contentHash,
    allowed: s.audit.filter(
      (a: { action: string; resourceId: string; outcome: string }) =>
        a.action === "proposal.issue" && a.resourceId === pid && a.outcome === "allowed",
    ).length,
    issued: s.tables.proposalWorkspaces
      .find((w: { proposalId: string }) => w.proposalId === pid)
      .comments.filter((c: { kind: string }) => c.kind === "issued").length,
  };
}

describe("P7-P1-A canonical actor at the issuance commitment", () => {
  const revocations: [string, (u: User) => User | null][] = [
    ["A1 roles removed", (u) => ({ ...u, roles: [] })],
    ["A2 actor removed", () => null],
    ["A2 organization membership removed", (u) => ({ ...u, organizationId: "org_other" })],
    [
      "A2 issuance permission removed (role downgraded)",
      (u) => ({ ...u, roles: ["cia_professional"] }),
    ],
  ];
  for (const [name, change] of revocations)
    it(`${name} during the pricing await → denied, nothing committed, reload consistent`, async () => {
      const b = memoryBackend();
      const { pid, vid } = await approved(b);
      const before = state(b, pid, vid);
      const release = pausePricing();
      const pending = P.issue(MGR, pid, vid); // original caller context retained
      await new Promise((r) => setTimeout(r, 5));
      editCanonical(MGR.user.id, change);
      release();
      await expect(pending).rejects.toThrow();
      const expected = {
        status: "approved",
        issue: null,
        hash: before.hash,
        allowed: 0,
        issued: 0,
      };
      expect(state(b, pid, vid)).toEqual(expected);
      expect(store.table("proposals").find((p) => p.id === pid)!.status).toBe("approved");
      expect(store.table("proposalVersions").find((v) => v.id === vid)!.issue).toBeUndefined();
      store.attach(b); // reload (users reseed from directory)
      expect(state(b, pid, vid)).toEqual(expected);
    });

  it("A3 unchanged authority issues once; A4 a fresh authorized request succeeds after a denial", async () => {
    const b = memoryBackend();
    const { pid, vid } = await approved(b);
    const release = pausePricing();
    const pending = P.issue(MGR, pid, vid);
    await new Promise((r) => setTimeout(r, 5));
    editCanonical(MGR.user.id, (u) => ({ ...u, roles: [] }));
    release();
    await expect(pending).rejects.toThrow();
    // The stale context cannot bypass while canonical roles remain revoked.
    await expect(P.issue(MGR, pid, vid)).rejects.toThrow();
    const ADMIN = { user: store.table("users").find((u) => u.id === "u_admin")! };
    const v = await P.issue(ADMIN, pid, vid);
    expect(v.issue?.issuedBy).toBe("u_admin");
    expect(state(b, pid, vid)).toMatchObject({ status: "shared", allowed: 1, issued: 1 });
    store.attach(b);
    expect(state(b, pid, vid)).toMatchObject({ status: "shared", allowed: 1, issued: 1 });
  });

  it("A3 an actor whose canonical authority is unchanged issues normally", async () => {
    const b = memoryBackend();
    const { pid, vid } = await approved(b);
    const v = await P.issue(MGR, pid, vid);
    expect(v.issue?.issuedBy).toBe(MGR.user.id);
    expect(state(b, pid, vid)).toMatchObject({ status: "shared", allowed: 1, issued: 1 });
  });

  it("adjacent: approval re-resolves the canonical reviewer after the pricing await", async () => {
    const b = memoryBackend();
    store.attach(b);
    const r = await readyProposal();
    const ver = await P.submitForReview(PRO, r.p.id);
    const ack = [
      ...ver.document.deliverables.filter((d) => d.info.needsQualification).map((d) => d.id),
      ...ver.document.risks.filter((x) => x.resolution === "accepted").map((x) => x.id),
    ];
    const release = pausePricing();
    const pending = P.approve(REVIEWER, r.p.id, ver.id, { acknowledged: ack });
    await new Promise((res) => setTimeout(res, 5));
    editCanonical(REVIEWER.user.id, (u) => ({ ...u, roles: [] }));
    release();
    await expect(pending).rejects.toThrow();
    expect(store.table("proposals").find((p) => p.id === r.p.id)!.status).toBe("in_review");
    expect(store.table("proposalVersions").find((v) => v.id === ver.id)!.review).toBeUndefined();
  });
});

describe("P7-P1-A adjacent: simulated sharing", () => {
  it("roles removed while the share adapter is pending → no share record", async () => {
    const b = memoryBackend();
    const { pid, vid } = await approved(b);
    await P.issue(MGR, pid, vid);
    const real = proposalShareAdapter.share;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    proposalShareAdapter.share = async (a) => {
      await gate;
      return real(a);
    };
    try {
      const pending = P.share(MGR, pid, {
        versionId: vid,
        recipient: { name: "B", email: "b@example.com" },
      });
      await new Promise((r) => setTimeout(r, 5));
      editCanonical(MGR.user.id, (u) => ({ ...u, roles: [] }));
      release();
      await expect(pending).rejects.toThrow();
    } finally {
      proposalShareAdapter.share = real;
    }
    expect(store.table("proposalShares").filter((x) => x.proposalId === pid)).toHaveLength(0);
    store.attach(b);
    expect(store.table("proposalShares").filter((x) => x.proposalId === pid)).toHaveLength(0);
  });
});

describe("P7-P1-B partial-issuance proposal sources", () => {
  const M = { user: store.table("users").find((u) => u.id === "u_manager")! };
  /** Restores the original partial-save shape: version has issue, parent still approved. */
  function partial(b: PersistenceBackend, pid: string, vid: string) {
    const s = saved(b);
    s.tables.proposalVersions.find((v: { id: string }) => v.id === vid).issue = {
      issuedAt: new Date(Date.now() - 86400000).toISOString(),
      issuedBy: "u_manager",
      effectiveAt: new Date(Date.now() - 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 20 * 86400000).toISOString(),
    };
    s.tables.proposals.find((p: { id: string }) => p.id === pid).status = "approved";
    b.write(STORAGE_KEY, JSON.stringify(s));
    store.attach(b);
  }
  const input = (vid: string, key = "partial-source") => {
    const v = store.table("proposalVersions").find((x) => x.id === vid)!;
    const total = first(v.document.commercials.summary.totals);
    return creation({
      operationKey: key,
      origin: "proposal",
      customerName: v.document.recipient.organization || v.document.recipient.name,
      proposalVersionId: v.id,
      allocationId: `allocation-${key}`,
      terms: {
        ...creation().terms,
        ...proposalScopeTerms(v),
        currency: total.currency,
        amount: total.initialCost,
      },
    });
  };

  it("B1/B2/B4 inconsistent source is inspectable, unlisted and rejected directly; valid sibling still works", async () => {
    const b = memoryBackend();
    const bad = await approved(b);
    const good = await approved(b);
    await P.issue(MGR, good.pid, good.vid);
    partial(b, bad.pid, bad.vid);
    for (let i = 0; i < 2; i++) {
      // Historical record remains inspectable.
      const view = await P.get(MGR, bad.pid);
      expect(view.versions.find((v) => v.id === bad.vid)!.issue).toBeTruthy();
      await expect(P.issue(MGR, bad.pid, bad.vid)).rejects.toThrow(/partially saved/);
      const listed = (await E.proposals(M)).map((x) => x.id);
      expect(listed).not.toContain(bad.vid);
      expect(listed).toContain(good.vid);
      const count = store.table("engagements").length;
      await expect(E.create(M, input(bad.vid))).rejects.toThrow(/eligible issued/);
      expect(store.table("engagements")).toHaveLength(count);
      expect(saved(b).tables.proposals.find((p: { id: string }) => p.id === bad.pid).status).toBe(
        "approved",
      );
      store.attach(b);
    }
    const created = await E.create(M, input(good.vid, "good-source"));
    let id = created.engagement.id;
    await E.transition(M, id, "pending_authorization", "mock://request", "Request");
    const ok = await E.transition(M, id, "authorized", "mock://auth", "Authorize");
    expect(ok.engagement.status).toBe("authorized");
    store.attach(b);
    expect(store.table("engagements").find((e) => e.id === id)!.status).toBe("authorized");
    id = "";
  });

  it("B3/§14 an existing draft from a later-inconsistent source cannot obtain commencement authority", async () => {
    const b = memoryBackend();
    const { pid, vid } = await approved(b);
    await P.issue(MGR, pid, vid);
    const v = await E.create(M, input(vid, "pre-fix"));
    const id = v.engagement.id;
    await E.transition(M, id, "pending_authorization", "mock://request", "Request");
    // Reconstruct the pre-correction case: parent never actually moved past approved.
    const s = saved(b);
    s.tables.proposals.find((p: { id: string }) => p.id === pid).status = "approved";
    b.write(STORAGE_KEY, JSON.stringify(s));
    store.attach(b);
    await expect(E.transition(M, id, "authorized", "mock://auth", "Authorize")).rejects.toThrow(
      /partially issued/,
    );
    store.attach(b);
    const w = store.table("deliveryWorkspaces").find((x) => x.engagementId === id)!;
    expect(w.authorization).toBeNull();
    expect(store.table("engagements").find((e) => e.id === id)!.status).toBe(
      "pending_authorization",
    );
    expect(w.initiation.source.kind).toBe("proposal"); // original evidence preserved
  });

  it("B6 legitimately accepted proposals remain eligible", async () => {
    const b = memoryBackend();
    const { pid, vid } = await approved(b);
    await P.issue(MGR, pid, vid);
    const s = saved(b);
    s.tables.proposals.find((p: { id: string }) => p.id === pid).status = "accepted";
    b.write(STORAGE_KEY, JSON.stringify(s));
    store.attach(b);
    expect((await E.proposals(M)).map((x) => x.id)).toContain(vid);
    const v = await E.create(M, input(vid, "accepted-source"));
    await E.transition(M, v.engagement.id, "pending_authorization", "mock://r", "Request");
    const a = await E.transition(M, v.engagement.id, "authorized", "mock://a", "Authorize");
    expect(a.engagement.status).toBe("authorized");
  });
});

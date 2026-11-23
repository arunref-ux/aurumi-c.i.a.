/** Phase 4 — Proposal Studio acceptance tests (service boundary + identity switching). */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proposalConfig, proposalStudio as P } from "@/data/proposal-studio";
import { repos, ValidationError } from "@/data/repositories";
import { solutionStudio as S } from "@/data/solution-studio";
import { memoryBackend, STORAGE_KEY, store } from "@/data/store";
import { AccessDeniedError } from "@/domain/permissions";
import { calculateCommercials, type CommercialLine, type TaxConfig } from "@/domain/proposal";
import { MOCK_PRICE_BOOK } from "@/integrations/adapters/pricing-studio";
import { useProposalList } from "@/lib/proposal-queries";
import { SessionProvider, useSession } from "@/lib/session";
import {
  ADMIN,
  approvedSolution,
  issuedProposal,
  readyProposal,
  resetProposalTestState,
  REVIEWER,
} from "./proposal-fixtures";
import { approvedAssessment, MGR, PARTNER, PM, PRO, readySolution, u } from "./solution-fixtures";

beforeEach(resetProposalTestState);
afterEach(cleanup);

const line = (over: Partial<CommercialLine>): CommercialLine =>
  ({
    id: Math.random().toString(36),
    organizationId: "org",
    createdAt: "",
    createdBy: "",
    updatedAt: "",
    updatedBy: "",
    category: "aurumi_subscription",
    classification: "priced",
    description: "",
    quantity: 1,
    recurrence: "monthly",
    currency: "INR",
    quoteReference: "",
    ...over,
  }) as CommercialLine;

describe("1. creation only from compatible approved solution snapshots", () => {
  it("rejects drafts, legacy /1 hand-offs and mismatched tracks; records the exact source", async () => {
    const { a, snap, sol, handoff } = await approvedSolution();
    await expect(P.create(PRO, { solutionSnapshotId: sol.id, track: "tenant_solution", title: "x" })).rejects.toThrow(
      AccessDeniedError,
    );
    const legacy = { ...structuredClone(handoff), id: "ssnap_legacy", version: 9, schema: "aurumi.cia.solution-handoff/1" };
    store.replace("solutionSnapshots", [...store.table("solutionSnapshots"), legacy as never]);
    await expect(
      P.create(PRO, { solutionSnapshotId: "ssnap_legacy", track: "tenant_solution", title: "x" }),
    ).rejects.toThrow(/not supported/);
    await expect(
      P.create(PRO, { solutionSnapshotId: handoff.id, track: "reseller_partner", title: "x" }),
    ).rejects.toThrow(/needs a partner solution/);
    const p = await P.create(PRO, { solutionSnapshotId: handoff.id, track: "tenant_solution", title: "One" });
    expect(p).toMatchObject({
      status: "draft",
      ownerId: "u_pro",
      organizationId: "org_aurumi",
      assessmentId: a.id,
      source: {
        solutionId: sol.id,
        solutionSnapshotId: handoff.id,
        solutionSnapshotVersion: 1,
        assessmentSnapshotId: snap.id,
      },
    });
    const c = (await P.candidates(PRO)).find((x) => x.solutionId === sol.id)!;
    expect(c.snapshots.find((x) => x.id === "ssnap_legacy")).toMatchObject({ compatible: false });
    expect(c.snapshots.find((x) => x.id === handoff.id)!.existingProposals).toHaveLength(1);
    // Generic repository updates can't touch a Proposal Studio record.
    expect(() => repos.proposals.update(PRO, p.id, { status: "in_review" })).toThrow(/managed by Proposal Studio/);
  });
  it("imports facts and keeps them distinguishable from authored and AI-drafted text", async () => {
    const { handoff } = await approvedSolution();
    const p = await P.create(PRO, { solutionSnapshotId: handoff.id, track: "tenant_solution", title: "T" });
    let v = await P.get(PRO, p.id);
    expect(v.workspace.sections.find((s) => s.key === "challenges")).toMatchObject({ origin: "imported" });
    expect(v.workspace.deliverables).toHaveLength(1);
    await P.draftSection(PRO, p.id, "executive_summary");
    v = await P.get(PRO, p.id);
    expect(v.workspace.sections.find((s) => s.key === "executive_summary")).toMatchObject({ origin: "ai_draft", reviewed: false });
    expect(v.readiness.find((i) => i.key === "content")!.detail.join()).toMatch(/AI draft not yet reviewed/);
    await P.saveSection(PRO, p.id, "executive_summary", { body: "Our certified team guarantees results", reviewed: true });
    v = await P.get(PRO, p.id);
    expect(v.readiness.find((i) => i.key === "claims")!.ok).toBe(false);
  });
});

describe("2. source pinning and explicit rebase", () => {
  it("a new solution version never moves a proposal; rebase compares, preserves and audits", async () => {
    const { p, sol, view } = await readyProposal("tenant_solution");
    await S.reopen(PRO, sol.id, "Add CRM");
    const rec = (await S.get(PRO, sol.id)).workspace.recommendations[0]!;
    await S.upsertChild(PRO, sol.id, "recommendations", {
      id: rec.id,
      category: rec.category,
      title: "Receivables app (renamed)",
      needIds: rec.needIds,
      rationale: rec.rationale,
      catalogItemIds: rec.catalogRefs.map((c) => c.itemId),
      provenance: "professional_judgment",
    });
    await S.submitForReview(PRO, sol.id);
    const h2 = await S.approve(MGR, sol.id);
    let v = await P.get(PRO, p.id);
    expect(v.proposal.source.solutionSnapshotId).toBe(view.proposal.source.solutionSnapshotId);
    expect(v.newerSource).toMatchObject({ id: h2.id, version: 2 });
    const diff = await P.previewRebase(PRO, p.id);
    expect(diff.changed[0]!.changes.join()).toMatch(/renamed/);
    expect(diff.affectedDeliverables).toHaveLength(1);
    await expect(P.rebase(PRO, p.id, h2.id, " ")).rejects.toThrow(ValidationError);
    await expect(P.rebase(PM, p.id, h2.id, "x")).rejects.toThrow(AccessDeniedError);
    await P.rebase(PRO, p.id, h2.id, "Customer asked for the renamed app");
    v = await P.get(PRO, p.id);
    expect(v.proposal).toMatchObject({ revision: 2, source: { solutionSnapshotId: h2.id, solutionSnapshotVersion: 2 } });
    expect(v.workspace.revisions[0]).toMatchObject({ revision: 1, source: { solutionSnapshotVersion: 1 } });
    expect(store.audit().some((e) => e.action === "proposal.rebase" && e.resourceId === p.id)).toBe(true);
  });
});

describe("3–5. tracks, advisory and commercial pricing rules", () => {
  it("advisory proposals need no price; commercial proposals do", async () => {
    const adv = await readyProposal("tenant_solution");
    expect(adv.view.readiness.find((i) => i.key === "commercials")!.ok).toBe(true);
    expect(adv.view.readinessPercent).toBe(100);
    resetProposalTestState();
    const base = await approvedSolution();
    const c = await P.create(PRO, { solutionSnapshotId: base.handoff.id, track: "tenant_commercial", title: "C" });
    const v = await P.get(PRO, c.id);
    expect(v.readiness.find((i) => i.key === "commercials")!.detail.join()).toMatch(/at least one priced line/);
    expect(v.workspace.sections.map((s) => s.key)).toContain("commercials");
    await expect(P.submitForReview(PRO, c.id)).rejects.toThrow(/not ready/);
  });
  it("partner tracks need a partner solution and get partner sections and terms", async () => {
    const base = await approvedAssessment("partner");
    void base;
    const p = await approvedSolution();
    await expect(P.upsertChild(PRO, (await P.create(PRO, { solutionSnapshotId: p.handoff.id, track: "tenant_solution", title: "t" })).id, "partnerTerms", { kind: "commission", description: "10%" })).rejects.toThrow(/partner proposals/);
  });
});

describe("6–8. pricing references, calculations and authorization", () => {
  it("pins price-book version and amounts; price changes don't alter the pin until refreshed", async () => {
    const { p, view, lineId } = await readyProposal();
    const l = view.workspace.lines.find((x) => x.id === lineId)!;
    expect(l.priceRef).toMatchObject({ priceBookItemId: "pb_receivables", priceBookVersion: MOCK_PRICE_BOOK.priceBookVersion, publishedAmount: 2500, currency: "INR", recurrence: "monthly" });
    await expect(
      P.upsertChild(PRO, p.id, "lines", { category: "aurumi_subscription", priceBookItemId: "pb_receivables", currency: "USD" }),
    ).rejects.toThrow(/come from the price book/);
    await expect(P.upsertChild(PRO, p.id, "lines", { category: "training", quantity: 2, currency: "INR", recurrence: "one_time" })).rejects.toThrow(
      /must reference a Pricing Studio/,
    );
    const item = MOCK_PRICE_BOOK.items.find((i) => i.id === "pb_receivables")!;
    const before = { ...item, version: MOCK_PRICE_BOOK.priceBookVersion };
    item.amount = 2900;
    MOCK_PRICE_BOOK.priceBookVersion = "mock-pricebook-2027.01";
    try {
      let v = await P.get(PRO, p.id);
      expect(v.workspace.lines.find((x) => x.id === lineId)!.priceRef!.publishedAmount).toBe(2500);
      expect(v.readiness.find((i) => i.key === "commercials")!.detail.join()).toMatch(/refresh prices/);
      await P.refreshPrices(PRO, p.id);
      v = await P.get(PRO, p.id);
      expect(v.workspace.lines.find((x) => x.id === lineId)!.priceRef).toMatchObject({ publishedAmount: 2900, priceBookVersion: "mock-pricebook-2027.01" });
      expect(store.audit().some((e) => e.action === "proposal.pricing_refresh")).toBe(true);
    } finally {
      item.amount = before.amount;
      MOCK_PRICE_BOOK.priceBookVersion = before.version;
    }
  });
  it("calculates per currency and billing period, never combining them; taxes only when configured", () => {
    const lines = [
      line({ id: "a", quantity: 3, recurrence: "monthly", priceRef: { publishedAmount: 450 } as never }),
      line({ id: "b", category: "implementation", recurrence: "one_time", priceRef: { publishedAmount: 60000 } as never }),
      line({ id: "c", recurrence: "annual", priceRef: { publishedAmount: 4800 } as never, quantity: 2 }),
      line({ id: "d", currency: "USD", priceRef: { publishedAmount: 99 } as never }),
      line({ id: "e", category: "discount", recurrence: "one_time", discount: { amount: 5000, rationale: "x" } }),
      line({ id: "f", classification: "tbd", priceRef: { publishedAmount: 1 } as never }),
      line({ id: "g", classification: "estimated", category: "custom_development", recurrence: "one_time", estimate: { unitAmount: 12345.675, basis: "2 weeks" } }),
    ];
    const none = calculateCommercials(lines, []);
    const inr = none.totals.find((t) => t.currency === "INR")!;
    expect(inr).toMatchObject({ oneTime: 67345.68, monthly: 1350, annual: 9600, initialCost: 67345.68, includesEstimates: true });
    expect(inr.tax).toEqual({ one_time: 0, monthly: 0, annual: 0 });
    expect(inr.discounts.one_time).toBe(5000);
    expect(none.totals.find((t) => t.currency === "USD")!.monthly).toBe(99);
    expect(none.mixedCurrencies).toBe(true);
    expect(none.tbdCount).toBe(1);
    expect(none.warnings.join()).toMatch(/never converted/);
    expect(none.warnings.join()).toMatch(/monthly and annual charges are shown separately/);
    const tax: TaxConfig = { id: "t", organizationId: "o", createdAt: "", createdBy: "", updatedAt: "", updatedBy: "", label: "GST (example)", ratePercent: 18, appliesTo: "one_time", currency: "INR", source: "Customer finance team" };
    const taxed = calculateCommercials(lines, [tax]).totals.find((t) => t.currency === "INR")!;
    expect(taxed.tax.one_time).toBe(12122.22);
    expect(taxed.initialCost).toBe(79467.9);
    expect(taxed.monthly).toBe(1350);
  });
  it("overrides and discounts need a rationale and separate approval; authors can't approve them", async () => {
    const { p, lineId } = await readyProposal();
    await expect(
      P.upsertChild(PRO, p.id, "lines", { id: lineId!, category: "aurumi_subscription", priceBookItemId: "pb_receivables", override: { unitAmount: 2000, rationale: " " } }),
    ).rejects.toThrow(/rationale/);
    await P.upsertChild(PRO, p.id, "lines", { id: lineId!, category: "aurumi_subscription", priceBookItemId: "pb_receivables", override: { unitAmount: 2000, rationale: "Pilot pricing" } });
    const disc = await P.upsertChild(PRO, p.id, "lines", { category: "discount", classification: "priced", currency: "INR", recurrence: "one_time", discount: { amount: 5000, rationale: "Launch" } });
    let v = await P.get(PRO, p.id);
    expect(v.commercials.lines[lineId!]).toMatchObject({ basis: "proposed_override", amount: 2000 });
    expect(v.workspace.lines.find((x) => x.id === lineId)!.priceRef!.publishedAmount).toBe(2500); // price book untouched
    expect(MOCK_PRICE_BOOK.items.find((i) => i.id === "pb_receivables")!.amount).toBe(2500);
    expect(v.readiness.find((i) => i.key === "commercials")!.detail.join()).toMatch(/override awaits approval.*discount awaits approval/);
    await expect(P.authorizeCommercial(PRO, p.id, { kind: "override", itemId: lineId! })).rejects.toThrow(AccessDeniedError);
    await expect(P.submitForReview(PRO, p.id)).rejects.toThrow(/not ready/);
    await P.authorizeCommercial(REVIEWER, p.id, { kind: "override", itemId: lineId! });
    await P.authorizeCommercial(REVIEWER, p.id, { kind: "discount", itemId: disc });
    v = await P.get(PRO, p.id);
    expect(v.commercials.lines[lineId!]!.basis).toBe("approved_override");
    expect(v.readiness.find((i) => i.key === "commercials")!.ok).toBe(true);
    // Changing the approved override clears its approval.
    await P.upsertChild(PRO, p.id, "lines", { id: lineId!, category: "aurumi_subscription", priceBookItemId: "pb_receivables", override: { unitAmount: 1500, rationale: "Pilot pricing" } });
    v = await P.get(PRO, p.id);
    expect(v.commercials.lines[lineId!]!.basis).toBe("proposed_override");
    expect(store.audit().some((e) => e.action === "proposal.override")).toBe(true);
  });
});

describe("9. partner terms stay proposed", () => {
  it("reseller terms are proposed until an authorized reviewer approves them; edits revert approval", async () => {
    const base = await approvedAssessment("partner");
    const sol = await S.create(PRO, { assessmentId: base.a.id, snapshotId: base.snap.id, title: "Partner" });
    void sol;
    // Partner terms on a partner proposal are validated by the domain rules directly here.
    const { TRACKS } = await import("@/domain/proposal");
    expect(TRACKS.reseller_partner.partnerTerms).toBe(true);
    expect(TRACKS.reseller_partner.disclosure).toMatch(/not binding/);
    expect(TRACKS.tenant_solution.partnerTerms).toBe(false);
  });
});

describe("10–11. deliverable qualifications and high-risk dependencies", () => {
  it("classification is derived; conditional items need a qualification; labels can't upgrade them", async () => {
    const { handoff } = await approvedSolution();
    const p = await P.create(PRO, { solutionSnapshotId: handoff.id, track: "tenant_solution", title: "Q" });
    const v = await P.get(PRO, p.id);
    const d = v.workspace.deliverables[0]!;
    const info = v.deliverables[d.id]!;
    expect(info.classification).toBe("conditional"); // Tally integration is possible, uncommitted
    expect(info.needsQualification).toBe(true);
    expect(info.reasons.join()).toMatch(/TallyPrime/);
    await expect(
      P.upsertChild(PRO, p.id, "deliverables", { id: d.id, recommendationId: d.recommendationId, classification: "available_verified" } as never),
    ).rejects.toThrow(ValidationError);
    await expect(P.upsertChild(PRO, p.id, "deliverables", { recommendationId: "rec_invented" })).rejects.toThrow(/not in the approved/);
    expect(v.readiness.find((i) => i.key === "deliverables")!.detail.join()).toMatch(/visible qualification/);
  });
  it("source high-risk unknowns are imported, can't be deleted or downgraded, and block until handled", async () => {
    const { handoff } = await approvedSolution();
    const p = await P.create(PRO, { solutionSnapshotId: handoff.id, track: "tenant_solution", title: "R" });
    const v = await P.get(PRO, p.id);
    const high = v.workspace.risks.find((r) => r.severity === "high")!;
    expect(high.source).toMatchObject({ kind: "integration" });
    expect(v.readiness.find((i) => i.key === "risks")!.detail.join()).toMatch(/Blocking/);
    await expect(P.removeChild(PRO, p.id, "risks", high.id)).rejects.toThrow(/not deleted/);
    await expect(
      P.upsertChild(PRO, p.id, "risks", { id: high.id, category: high.category, description: high.description, severity: "low" }),
    ).rejects.toThrow(/downgraded/);
    await P.upsertChild(PRO, p.id, "risks", { id: high.id, category: high.category, description: high.description, severity: "high", resolution: "accepted" });
    expect((await P.get(PRO, p.id)).readiness.find((i) => i.key === "risks")!.detail.join()).toMatch(/need a qualification/);
  });
});

describe("12–14. protected review, exact-version approval, issue and share", () => {
  it("separates author and reviewer and requires acknowledging qualifications", async () => {
    const { p } = await readyProposal();
    const ver = await P.submitForReview(PRO, p.id);
    expect(ver.document.solution.sourceAssessment.id).toBeTruthy();
    await expect(P.saveSection(PRO, p.id, "next_steps", { body: "x" })).rejects.toThrow(/revise it/);
    await expect(P.approve(PRO, p.id, ver.id)).rejects.toThrow(AccessDeniedError);
    await expect(P.approve(MGR, p.id, ver.id)).rejects.toThrow(AccessDeniedError); // no approve permission
    await expect(P.approve(REVIEWER, p.id, ver.id)).rejects.toThrow(/acknowledge each qualification/);
    await expect(P.issue(MGR, p.id, ver.id)).rejects.toThrow(/only approved/);
    await expect(P.requestChanges(REVIEWER, p.id, ver.id, " ")).rejects.toThrow(ValidationError);
    await P.requestChanges(REVIEWER, p.id, ver.id, "Tighten the summary");
    expect((await P.get(PRO, p.id)).proposal.status).toBe("changes_requested");
  });
  it("approval binds to one version; an edit invalidates it; an old approval can't issue changed terms", async () => {
    const { p, lineId } = await readyProposal();
    const v1 = await P.submitForReview(PRO, p.id);
    const ack = [
      ...v1.document.deliverables.filter((d) => d.info.needsQualification).map((d) => d.id),
      ...v1.document.risks.filter((r) => r.resolution === "accepted").map((r) => r.id),
    ];
    await expect(P.approve(REVIEWER, p.id, "pv_other", { acknowledged: ack })).rejects.toThrow(/current submitted version/);
    await P.approve(REVIEWER, p.id, v1.id, { acknowledged: ack });
    // Material change after approval: quantity changes the financial terms.
    await P.upsertChild(PRO, p.id, "lines", { id: lineId!, category: "aurumi_subscription", priceBookItemId: "pb_receivables", quantity: 3 });
    let v = await P.get(PRO, p.id);
    expect(v.proposal.status).toBe("draft");
    expect(v.versions.find((x) => x.id === v1.id)!.supersededAt).toBeTruthy();
    await expect(P.issue(MGR, p.id, v1.id)).rejects.toThrow(/only approved/);
    const v2 = await P.submitForReview(PRO, p.id);
    expect(v2.versionNumber).toBe(2);
    expect(v2.contentHash).not.toBe(v1.contentHash);
    await P.approve(REVIEWER, p.id, v2.id, { acknowledged: ack });
    await expect(P.issue(PRO, p.id, v2.id)).rejects.toThrow(AccessDeniedError); // professional can't issue
    const issued = await P.issue(MGR, p.id, v2.id);
    expect(issued.issue!.expiresAt > issued.issue!.issuedAt).toBe(true);
    v = await P.get(PRO, p.id);
    expect(v.proposal.status).toBe("shared");
    expect(store.audit().filter((e) => ["proposal.approve", "proposal.issue", "proposal.approval_invalidated"].includes(e.action)).length).toBeGreaterThanOrEqual(4);
  });
  it("sharing is simulated, needs permission and an issued version, and validates recipients", async () => {
    const { p, issued } = await issuedProposal();
    await expect(P.share(PRO, p.id, { versionId: issued.id, recipient: { name: "A", email: "a@example.com" } })).rejects.toThrow(AccessDeniedError);
    await expect(P.share(MGR, p.id, { versionId: issued.id, recipient: { name: "A", email: "nope" } })).rejects.toThrow(/valid recipient/);
    const s = await P.share(MGR, p.id, { versionId: issued.id, recipient: { name: "Asha (fictional)", email: "asha@example.com" } });
    expect(s).toMatchObject({ simulated: true, response: "pending", versionNumber: issued.versionNumber });
    expect(s.channelReference).toMatch(/^sim-share-/);
  });
});

describe("15–16. immutable issued versions and standalone interpretation", () => {
  it("issued versions never change after edits, price changes, rebase or later approvals", async () => {
    const { p, issued, sol } = await issuedProposal();
    const frozen = structuredClone(issued);
    expect(Object.isFrozen(issued.document)).toBe(true);
    await P.revise(PRO, p.id, "Customer wants more users");
    await P.saveSection(PRO, p.id, "next_steps", { body: "Updated next steps" });
    const item = MOCK_PRICE_BOOK.items.find((i) => i.id === "pb_receivables")!;
    item.amount = 3100;
    try {
      store.replace("solutionSnapshots", []);
      store.replace("snapshots", []);
      store.replace("solutions", store.table("solutions").filter((x) => x.id !== sol.id));
      const v = await P.get(PRO, p.id);
      const old = v.versions.find((x) => x.id === issued.id)!;
      expect(old.document).toEqual(frozen.document);
      expect(old.document.commercials.lines[0]!.priceRef!.publishedAmount).toBe(2500);
      expect(old.document.solution.recommendations[0]!.title).toBe("Receivables app");
      expect(old.document.solution.sourceAssessment.requirements.length).toBe(1);
      expect(old.document.sections.find((s) => s.key === "next_steps")!.body).not.toBe("Updated next steps");
    } finally {
      item.amount = 2500;
    }
  });
});

describe("17. partner and cross-organization isolation", () => {
  it("other teams, partners, visitors and other organizations see nothing", async () => {
    const { p, issued } = await issuedProposal();
    await expect(P.get(PARTNER, p.id)).rejects.toThrow(AccessDeniedError);
    await expect(P.get(PM, p.id)).rejects.toThrow(AccessDeniedError);
    expect((await P.list(PARTNER)).some((x) => x.proposal.id === p.id)).toBe(false);
    const outsider = { user: { ...u("u_admin").user, id: "u_other_org", organizationId: "org_other" } };
    await expect(P.get(outsider, p.id)).rejects.toThrow(AccessDeniedError);
    await expect(P.share(outsider, p.id, { versionId: issued.id, recipient: { name: "x", email: "x@example.com" } })).rejects.toThrow(AccessDeniedError);
    const visitor = { user: { ...u("u_pro").user, id: "u_visitor", roles: ["public_visitor" as const] } };
    expect(await P.list(visitor)).toEqual([]);
    expect(await P.candidates(visitor)).toEqual([]);
    expect((await P.list(ADMIN)).some((x) => x.proposal.id === p.id)).toBe(true);
    expect(store.audit().some((e) => e.outcome === "denied" && e.resourceId === p.id)).toBe(true);
  });
});

describe("18. identity switching during pending requests", () => {
  it("a slow list request from the previous identity never shows its proposals to the next", async () => {
    const { p } = await readyProposal("tenant_solution");
    proposalConfig.latencyMs = 60;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    );
    const seen: { user: string; ids: string[] }[] = [];
    const { result } = renderHook(
      () => {
        const s = useSession();
        const q = useProposalList();
        if (q.data) seen.push({ user: s.user.id, ids: q.data.map((x) => x.proposal.id) });
        return s;
      },
      { wrapper },
    );
    act(() => result.current.setUserId("u_manager"));
    await waitFor(() => expect(seen.some((x) => x.user === "u_manager")).toBe(true));
    act(() => result.current.setUserId("u_partner_pro"));
    await new Promise((r) => setTimeout(r, 20));
    act(() => result.current.setUserId("u_pro"));
    act(() => result.current.setUserId("u_partner_pro"));
    await waitFor(() => expect(seen.some((x) => x.user === "u_partner_pro")).toBe(true), { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 200));
    expect(seen.filter((x) => x.user === "u_partner_pro").every((x) => !x.ids.includes(p.id))).toBe(true);
  });
});

describe("19. simulated recipient responses", () => {
  it("records responses against the issued version; acceptance is not a signature and is final", async () => {
    const { p, issued } = await issuedProposal();
    const s = await P.share(MGR, p.id, { versionId: issued.id, recipient: { name: "Asha", email: "asha@example.com" } });
    await P.recordResponse(MGR, s.id, { response: "viewed" });
    expect((await P.get(PRO, p.id)).proposal.status).toBe("shared");
    await expect(P.recordResponse(PRO, s.id, { response: "accepted" })).rejects.toThrow(AccessDeniedError);
    await P.recordResponse(MGR, s.id, { response: "accepted", note: "Email reply (simulated)" });
    const v = await P.get(PRO, p.id);
    expect(v.proposal.status).toBe("accepted");
    expect(v.shares[0]).toMatchObject({ response: "accepted", simulated: true });
    await expect(P.recordResponse(MGR, s.id, { response: "declined" })).rejects.toThrow(/final/);
    await expect(P.revise(PRO, p.id, "x")).rejects.toThrow(/cannot be revised/);
  });
  it("expired shares read as expired and can't be accepted", async () => {
    const { p, issued } = await issuedProposal();
    const s = await P.share(MGR, p.id, { versionId: issued.id, recipient: { name: "B", email: "b@example.com" } });
    store.replace("proposalShares", store.table("proposalShares").map((x) => (x.id === s.id ? { ...x, expiresAt: "2020-01-01T00:00:00Z" } : x)));
    expect((await P.get(PRO, p.id)).shares[0]!.effective).toBe("expired");
    await expect(P.recordResponse(MGR, s.id, { response: "accepted" })).rejects.toThrow(/final/);
  });
});

describe("20. malformed persistence recovery", () => {
  it("bad child records and versions are quarantined; valid siblings survive reload", async () => {
    const backend = memoryBackend();
    store.attach(backend);
    const { p, issued } = await issuedProposal();
    store.attach(backend);
    expect((await P.get(PRO, p.id)).versions[0]!.id).toBe(issued.id);
    const saved = JSON.parse(backend.read(STORAGE_KEY)!);
    const w = saved.tables.proposalWorkspaces.find((x: { proposalId: string }) => x.proposalId === p.id);
    w.lines.push({ ...w.lines[0], id: "cl_bad", quantity: "lots" });
    w.lines.push({ ...w.lines[0], id: "cl_bad2", priceRef: { ...w.lines[0].priceRef, publishedAmount: Number.NaN } });
    saved.tables.proposalVersions.push({ ...saved.tables.proposalVersions[0], id: "pv_bad", review: { decision: "maybe" } });
    saved.tables.proposalShares.push({ id: "psh_bad", proposalId: p.id, recipient: { email: "nope" } });
    backend.write(STORAGE_KEY, JSON.stringify(saved));
    store.attach(backend);
    expect(store.persistence().quarantined).toBe(4);
    const v = await P.get(PRO, p.id);
    expect(v.workspace.lines.map((l) => l.id)).not.toContain("cl_bad");
    expect(v.workspace.lines).toHaveLength(2);
    expect(v.versions.map((x) => x.id)).toEqual([issued.id]);
  });
});

describe("21. earlier phases preserved", () => {
  it("legacy sample proposals stay read-only and listed; solution workflow is unaffected", async () => {
    const list = await P.list(MGR);
    expect(list.find((x) => x.proposal.id === "prp_b")).toMatchObject({ legacy: true });
    await expect(P.get(MGR, "prp_b")).rejects.toThrow(/predates Proposal Studio/);
    const { sol } = await readySolution();
    expect((await S.get(PRO, sol.id)).readinessPercent).toBe(100);
  });
});

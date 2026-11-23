/** Phase 3 — Solution Studio acceptance tests (service-level, as the boundary that matters). */
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assessmentStudio as A, studioConfig } from "@/data/assessment-studio";
import { ValidationError } from "@/data/repositories";
import { seedUsers } from "@/data/seed";
import { solutionStudio as S, solutionConfig } from "@/data/solution-studio";
import { memoryBackend, STORAGE_KEY, store } from "@/data/store";
import { AccessDeniedError } from "@/domain/permissions";
import { analyzeDependencies } from "@/domain/solution";
import { MOCK_CATALOG } from "@/integrations/adapters/solution-catalog";

const u = (id: string) => ({ user: seedUsers.find((x) => x.id === id)! });
const PRO = u("u_pro");
const MGR = u("u_manager");
const ADMIN = u("u_admin");
const PARTNER = u("u_partner_pro");
const REVIEWER = u("u_reviewer");
const PM = u("u_pm");

beforeEach(() => {
  studioConfig.latencyMs = 0;
  solutionConfig.latencyMs = 0;
  store.attach(null);
  store.reset();
});
afterEach(cleanup);

const evidence = (over: Record<string, unknown> = {}) => ({
  attribute: "api",
  statement: "Vendor documents a REST API",
  status: "research_finding" as const,
  sources: [
    {
      title: "Vendor docs",
      sourceType: "vendor_documentation" as const,
      retrievedAt: "2026-11-01T00:00:00Z",
    },
  ],
  researchedAt: "2026-11-01T00:00:00Z",
  confidence: { level: "medium" as const },
  verification: { state: "verified" as const, method: "Checked docs" },
  links: [],
  ...over,
});

/** Approved assessment owned by PRO with one system, pain point, requirement and verified evidence. */
async function approvedAssessment(type: "tenant" | "partner" = "tenant") {
  const a = await A.create(PRO, {
    type,
    title: "Acme review",
    subjectName: "Acme (fictional)",
    channel: "direct",
  });
  await A.saveOverview(PRO, a.id, { purpose: "p", scope: "s", primaryContact: "c" });
  await A.saveProfile(PRO, a.id, {
    industry: "Retail",
    geography: "Pune",
    employees: "20",
    businessModel: "Retail",
  });
  if (type === "partner")
    await A.savePartner(PRO, a.id, {
      partnerCategory: "ISV",
      products: "Ledger",
      objectives: "Reach",
    });
  const sys = await A.upsertChild(PRO, a.id, "systems", {
    name: "TallyPrime",
    classification: "commercial",
  });
  const proc = await A.upsertChild(PRO, a.id, "processes", { name: "Collections" });
  const pain = await A.upsertChild(PRO, a.id, "painPoints", {
    processId: proc,
    description: "Overdue invoices are chased by hand",
  });
  const req = await A.upsertChild(PRO, a.id, "requirements", {
    category: "workflow",
    statement: "See overdue invoices daily",
    basis: "confirmed",
  });
  const ev = await A.upsertChild(
    PRO,
    a.id,
    "evidence",
    evidence({ links: [{ kind: "requirement", id: req }] }),
  );
  const apiEv = await A.upsertChild(
    PRO,
    a.id,
    "evidence",
    evidence({
      applicability: "external_api",
      links: [{ kind: "system", id: sys }],
      statement: "Tally exposes an API",
    }),
  );
  await A.saveFindings(PRO, a.id, {
    environment: "e",
    problems: "p",
    opportunities: "o",
    nextSteps: "n",
  });
  for (const q of ["q_goal", "q_pain", "q_systems", "q_decision"])
    await A.saveAnswer(PRO, a.id, { questionId: q, state: "answered", value: "yes" });
  if (type === "partner")
    for (const q of (await A.get(PRO, a.id)).sections.find((s) => s.key === "questions")!.missing)
      void q;
  await A.submitForReview(PRO, a.id);
  const snap = await A.approve(MGR, a.id, "ok");
  return { a, snap, sys, pain, req, ev, apiEv };
}

/** A solution that passes every readiness check. */
async function readySolution() {
  const base = await approvedAssessment();
  const sol = await S.create(PRO, {
    assessmentId: base.a.id,
    snapshotId: base.snap.id,
    title: "Collections uplift",
  });
  const need = await S.upsertChild(PRO, sol.id, "needs", {
    source: { kind: "pain_point", id: base.pain },
    priority: "high",
  });
  const rec = await S.upsertChild(PRO, sol.id, "recommendations", {
    category: "native_app",
    title: "Receivables app",
    needIds: [need],
    rationale: "Daily ageing list replaces manual chasing",
    catalogItemIds: ["app_receivables", "conn_tally"],
    provenance: "verified_catalog_capability",
    evidenceIds: [base.ev],
  });
  await S.upsertChild(PRO, sol.id, "integrations", {
    systemId: base.sys,
    proposalKind: "connector",
    catalogItemId: "conn_tally",
    feasibility: "possible_uncommitted",
    validationOwner: "Integration lead",
  });
  await S.upsertChild(PRO, sol.id, "values", {
    description: "Less time chasing invoices",
    assumptionSource: "Customer interview",
  });
  await S.upsertChild(PRO, sol.id, "roadmap", {
    stage: "foundation",
    deliverables: "Connect Tally",
  });
  await S.upsertChild(PRO, sol.id, "alternatives", { approach: "aurumi_led", preferred: true });
  await S.upsertChild(PRO, sol.id, "alternatives", {
    approach: "defer",
    summary: "Keep manual process",
  });
  await S.saveOverview(PRO, sol.id, {
    preferredRationale: "Fastest path with an available connector",
    outstandingQuestions: "Confirm Tally edition supports the connector",
  });
  return { ...base, sol, need, rec };
}

describe("creation from approved snapshots only", () => {
  it("requires an approved, compatible snapshot and blocks accidental duplicates", async () => {
    const { a, snap } = await approvedAssessment();
    const draft = await A.create(PRO, {
      type: "tenant",
      title: "Draft",
      subjectName: "X",
      channel: "direct",
    });
    await expect(
      S.create(PRO, { assessmentId: draft.id, snapshotId: snap.id, title: "Bad" }),
    ).rejects.toThrow(ValidationError);
    const sol = await S.create(PRO, { assessmentId: a.id, snapshotId: snap.id, title: "One" });
    expect(sol).toMatchObject({
      status: "draft",
      ownerId: "u_pro",
      assessmentId: a.id,
      organizationId: "org_aurumi",
      baseline: { snapshotId: snap.id, snapshotVersion: 1 },
    });
    await expect(
      S.create(PRO, { assessmentId: a.id, snapshotId: snap.id, title: "Two" }),
    ).rejects.toThrow(/already exists/);
    await expect(
      S.create(PRO, { assessmentId: a.id, snapshotId: snap.id, title: "Two", asAlternative: true }),
    ).rejects.toThrow(/name the alternative/);
    const alt = await S.create(PRO, {
      assessmentId: a.id,
      snapshotId: snap.id,
      title: "Two",
      optionLabel: "Option B",
      asAlternative: true,
    });
    expect(alt.optionLabel).toBe("Option B");
  });
  it("rejects legacy /1 snapshots instead of inventing question definitions", async () => {
    const { a, snap } = await approvedAssessment();
    const legacy = {
      ...structuredClone(snap),
      id: "snap_legacy",
      version: 9,
      schema: "aurumi.cia.assessment-handoff/1",
    } as never as typeof snap;
    delete (legacy as { questions?: unknown }).questions;
    store.replace("snapshots", [...store.table("snapshots"), legacy]);
    await expect(
      S.create(PRO, { assessmentId: a.id, snapshotId: "snap_legacy", title: "L" }),
    ).rejects.toThrow(/not supported/);
    const c = (await S.candidates(PRO)).find((x) => x.assessmentId === a.id)!;
    expect(c.snapshots.find((s) => s.id === "snap_legacy")).toMatchObject({ compatible: false });
  });
});

describe("baseline pinning and controlled rebase", () => {
  it("never moves the baseline silently; rebase shows changes, preserves the previous revision and re-evaluates claims", async () => {
    const { a, snap, sol, need, rec, ev } = await readySolution();
    // A later approval with changed evidence and a changed pain point.
    await A.reopen(PRO, a.id, "Update");
    const ws = (await A.get(PRO, a.id)).workspace;
    const pain = ws.painPoints[0]!;
    await A.upsertChild(PRO, a.id, "painPoints", {
      id: pain.id,
      processId: pain.processId,
      description: "Overdue invoices chased weekly",
    });
    await A.upsertChild(MGR, a.id, "evidence", {
      ...evidence({
        statement: "Changed claim",
        links: ws.evidence.find((e) => e.id === ev)!.links,
      }),
      id: ev,
    } as never);
    await A.submitForReview(PRO, a.id);
    const snap2 = await A.approve(MGR, a.id);
    let v = await S.get(PRO, sol.id);
    expect(v.solution.baseline.snapshotId).toBe(snap.id);
    expect(v.newerSnapshot).toMatchObject({ id: snap2.id, version: 2 });

    const diff = await S.previewRebase(PRO, sol.id);
    expect(diff.changed.map((c) => c.kind)).toContain("pain_point");
    expect(diff.evidenceChanged).toContain(ev);
    expect(diff.affectedNeeds).toContain(need);
    expect(diff.affectedRecommendations).toContain(rec);

    await expect(S.rebase(PRO, sol.id, snap2.id, " ")).rejects.toThrow(ValidationError);
    await S.rebase(PRO, sol.id, snap2.id, "Customer clarified collections cadence");
    v = await S.get(PRO, sol.id);
    expect(v.solution.baseline).toMatchObject({ snapshotId: snap2.id, snapshotVersion: 2 });
    expect(v.solution.revision).toBe(2);
    expect(v.workspace.revisions[0]).toMatchObject({
      revision: 1,
      baseline: { snapshotId: snap.id },
    });
    expect(v.workspace.revisions[0]!.workspace.recommendations[0]!.justificationStale).toBe(false);
    expect(v.workspace.needs.find((n) => n.id === need)!.sourceStatus).toBe("changed");
    expect(v.workspace.recommendations.find((r) => r.id === rec)!.justificationStale).toBe(true);
    expect(v.readiness.find((i) => i.key === "justified")!.ok).toBe(false);
    expect(
      store.audit().some((e) => e.action === "solution.rebase" && e.resourceId === sol.id),
    ).toBe(true);
  });
});

describe("needs come only from the immutable snapshot", () => {
  it("copies labels from the snapshot and rejects items not in it", async () => {
    const { a, snap, pain } = await approvedAssessment();
    const sol = await S.create(PRO, { assessmentId: a.id, snapshotId: snap.id, title: "N" });
    await expect(
      S.upsertChild(PRO, sol.id, "needs", { source: { kind: "pain_point", id: "pain_fake" } }),
    ).rejects.toThrow(/not in the approved/);
    await S.upsertChild(PRO, sol.id, "needs", {
      source: { kind: "pain_point", id: pain },
      label: "spoof",
    } as never).catch(() => null);
    const id = await S.upsertChild(PRO, sol.id, "needs", {
      source: { kind: "pain_point", id: pain },
    });
    expect((await S.get(PRO, sol.id)).workspace.needs.find((n) => n.id === id)!.source.label).toBe(
      "Overdue invoices are chased by hand",
    );
    await expect(
      S.upsertChild(PRO, sol.id, "needs", { source: { kind: "pain_point", id: pain } }),
    ).rejects.toThrow(/already selected/);
  });
});

describe("provenance cannot be upgraded by a label", () => {
  it("verified claims need real support", async () => {
    const { a, snap, apiEv } = await approvedAssessment();
    const sol = await S.create(PRO, { assessmentId: a.id, snapshotId: snap.id, title: "P" });
    const base = { category: "native_app" as const, title: "R" };
    await expect(
      S.upsertChild(PRO, sol.id, "recommendations", {
        ...base,
        provenance: "verified_assessment_fact",
      }),
    ).rejects.toThrow(/Verified assessment fact/);
    await expect(
      S.upsertChild(PRO, sol.id, "recommendations", {
        ...base,
        provenance: "verified_catalog_capability",
        catalogItemIds: ["app_crm_followups"],
      }),
    ).rejects.toThrow(/Available/);
    await expect(
      S.upsertChild(PRO, sol.id, "recommendations", { ...base, catalogItemIds: ["made_up"] }),
    ).rejects.toThrow(/unknown catalog item/);
    const ok = await S.upsertChild(PRO, sol.id, "recommendations", {
      ...base,
      provenance: "verified_assessment_fact",
      evidenceIds: [apiEv],
    });
    const r = (await S.get(PRO, sol.id)).workspace.recommendations.find((x) => x.id === ok)!;
    expect(r.provenance).toBe("verified_assessment_fact");
    expect(r.status).toBe("proposed"); // professional status stays separate from facts
  });
  it("derives availability from the catalog, never from input", async () => {
    const { sol, rec } = await readySolution();
    const v = await S.get(PRO, sol.id);
    expect(v.availability[rec]).toBe("available");
    const beta = await S.upsertChild(PRO, sol.id, "recommendations", {
      category: "native_app",
      title: "CRM",
      catalogItemIds: ["app_crm_followups"],
      availability: "available",
    } as never).catch((e) => e);
    expect(beta).toBeInstanceOf(ValidationError);
  });
});

describe("integration feasibility", () => {
  it("an external API never establishes a confirmed Aurumi integration", async () => {
    const { a, snap, sys, apiEv } = await approvedAssessment();
    const sol = await S.create(PRO, { assessmentId: a.id, snapshotId: snap.id, title: "I" });
    const base = { systemId: sys, proposalKind: "connector" as const, catalogItemId: "conn_tally" };
    await expect(
      S.upsertChild(PRO, sol.id, "integrations", {
        ...base,
        feasibility: "confirmed_working",
        evidenceIds: [apiEv],
      }),
    ).rejects.toThrow(/external API is not enough/);
    await expect(
      S.upsertChild(PRO, sol.id, "integrations", {
        systemId: sys,
        proposalKind: "connector",
        catalogItemId: "conn_pms_generic",
        feasibility: "planned",
      }),
    ).rejects.toThrow(/Planned/);
    await expect(
      S.upsertChild(PRO, sol.id, "integrations", {
        systemId: sys,
        proposalKind: "connector",
        catalogItemId: "app_receivables",
      }),
    ).rejects.toThrow(/not allowed/);
    const id = await S.upsertChild(PRO, sol.id, "integrations", {
      ...base,
      feasibility: "possible_uncommitted",
    });
    const i = (await S.get(PRO, sol.id)).workspace.integrations.find((x) => x.id === id)!;
    expect(i).toMatchObject({ systemName: "TallyPrime", feasibility: "possible_uncommitted" });
  });
});

describe("AI design", () => {
  it("attaches to AI recommendations, uses catalog capabilities and requires confirmation for actions", async () => {
    const { a, snap } = await approvedAssessment();
    const sol = await S.create(PRO, { assessmentId: a.id, snapshotId: snap.id, title: "AI" });
    const app = await S.upsertChild(PRO, sol.id, "recommendations", {
      category: "native_app",
      title: "App",
    });
    const ai = await S.upsertChild(PRO, sol.id, "recommendations", {
      category: "ai",
      title: "Ask Aura",
    });
    await expect(
      S.upsertChild(PRO, sol.id, "aiDesigns", { recommendationId: app }),
    ).rejects.toThrow(/AI \/ conversational/);
    await expect(
      S.upsertChild(PRO, sol.id, "aiDesigns", { recommendationId: ai, mode: "write" }),
    ).rejects.toThrow(/confirmation/);
    await expect(
      S.upsertChild(PRO, sol.id, "aiDesigns", {
        recommendationId: ai,
        capabilityItemIds: ["invented_skill"],
      }),
    ).rejects.toThrow(/unknown catalog/);
    const d = await S.upsertChild(PRO, sol.id, "aiDesigns", {
      recommendationId: ai,
      exampleQuestions: [
        "Which customers have overdue invoices, and what follow-up actions are pending?",
        " ",
      ],
      capabilityItemIds: ["ai_receivables_skill"],
      mode: "read",
    });
    const rec = (await S.get(PRO, sol.id)).workspace.aiDesigns.find((x) => x.id === d)!;
    expect(rec.exampleQuestions).toHaveLength(1);
    expect(rec.capabilityRefs[0]).toMatchObject({
      itemId: "ai_receivables_skill",
      catalogVersion: MOCK_CATALOG.catalogVersion,
    });
    await S.removeChild(PRO, sol.id, "recommendations", ai);
    expect((await S.get(PRO, sol.id)).workspace.aiDesigns).toEqual([]);
  });
});

describe("dependencies, value and roadmap rules", () => {
  it("detects missing and circular dependencies", () => {
    const r = analyzeDependencies(
      [
        { id: "a", dependsOn: ["b"], catalogRefs: [] },
        {
          id: "b",
          dependsOn: ["a", "zzz"],
          catalogRefs: [{ itemId: "app_guest_desk", catalogVersion: "v", nameAtSelection: "" }],
        },
      ],
      MOCK_CATALOG,
    );
    expect(r.missing).toEqual([{ from: "b", to: "zzz" }]);
    expect(r.cycles.length).toBeGreaterThan(0);
    expect(r.catalogGaps[0]).toMatchObject({ itemId: "app_guest_desk", needs: "conn_pms_generic" });
  });
  it("financial estimates need assumptions and a source; roadmap is always a planning assumption", async () => {
    const { a, snap } = await approvedAssessment();
    const sol = await S.create(PRO, { assessmentId: a.id, snapshotId: snap.id, title: "V" });
    await expect(
      S.upsertChild(PRO, sol.id, "values", {
        description: "Savings",
        estimate: { amount: 1000, currency: "INR", assumptions: "", source: "" },
      }),
    ).rejects.toThrow(ValidationError);
    await S.upsertChild(PRO, sol.id, "values", {
      description: "Savings",
      estimate: {
        amount: 1000,
        currency: "INR",
        assumptions: "2 hrs/week saved",
        source: "Interview",
      },
    });
    const rm = await S.upsertChild(PRO, sol.id, "roadmap", {
      stage: "initial",
      status: "committed",
    } as never).catch((e) => e);
    expect(rm).toBeInstanceOf(ValidationError);
    const id = await S.upsertChild(PRO, sol.id, "roadmap", { stage: "initial" });
    expect((await S.get(PRO, sol.id)).workspace.roadmap.find((x) => x.id === id)!.status).toBe(
      "planning_assumption",
    );
  });
  it("only one preferred alternative at a time", async () => {
    const { sol } = await readySolution();
    await S.upsertChild(PRO, sol.id, "alternatives", { approach: "hybrid", preferred: true });
    const alts = (await S.get(PRO, sol.id)).workspace.alternatives;
    expect(alts.filter((x) => x.preferred).map((x) => x.approach)).toEqual(["hybrid"]);
  });
});

describe("permissions and scope", () => {
  it("enforces scope on reads and child writes, and keeps public visitors out", async () => {
    const { sol, pain } = await readySolution();
    await expect(S.get(PARTNER, sol.id)).rejects.toThrow(AccessDeniedError);
    await expect(S.get(PM, sol.id)).rejects.toThrow(AccessDeniedError); // other team
    await expect(
      S.upsertChild(PARTNER, sol.id, "needs", { source: { kind: "pain_point", id: pain } }),
    ).rejects.toThrow(AccessDeniedError);
    expect((await S.list(PARTNER)).length).toBe(0);
    const visitor = {
      user: { ...seedUsers[0]!, id: "u_visitor", roles: ["public_visitor" as const] },
    };
    await expect(S.list(visitor)).resolves.toEqual([]);
    await expect(S.get(visitor, sol.id)).rejects.toThrow(AccessDeniedError);
    expect((await S.candidates(visitor)).length).toBe(0);
    // Reviewer can read but not edit or approve.
    await expect(S.get(REVIEWER, sol.id)).resolves.toBeTruthy();
    await expect(S.saveOverview(REVIEWER, sol.id, { objectives: "x" })).rejects.toThrow(
      AccessDeniedError,
    );
    expect(store.audit().some((e) => e.outcome === "denied" && e.resourceId === sol.id)).toBe(true);
  });
});

describe("review, approval and immutable hand-off", () => {
  it("separates author and reviewer, requires readiness, and freezes a self-contained snapshot", async () => {
    const { a, sol } = await readySolution();
    const draft = await S.create(PRO, {
      assessmentId: a.id,
      snapshotId: (await S.get(PRO, sol.id)).solution.baseline.snapshotId,
      title: "Empty option",
      optionLabel: "Empty",
      asAlternative: true,
    });
    await S.submitForReview(PRO, draft.id);
    await expect(S.approve(MGR, draft.id)).rejects.toThrow(/not ready/);

    await expect(S.approve(MGR, sol.id)).rejects.toThrow(ValidationError); // not submitted
    await S.submitForReview(PRO, sol.id);
    await expect(S.saveOverview(PRO, sol.id, { objectives: "x" })).rejects.toThrow(ValidationError); // locked
    await expect(S.approve(PRO, sol.id)).rejects.toThrow(AccessDeniedError);
    await expect(S.approve(REVIEWER, sol.id)).rejects.toThrow(AccessDeniedError);
    await S.assign(MGR, sol.id, { assignedUserIds: ["u_manager"] });
    await expect(S.approve(MGR, sol.id)).rejects.toThrow(AccessDeniedError); // assigned → can't approve
    await S.assign(MGR, sol.id, { assignedUserIds: [] });
    const snap = await S.approve(MGR, sol.id, "Good");
    expect(snap).toMatchObject({
      schema: "aurumi.cia.solution-handoff/1",
      version: 1,
      approval: { approvedBy: "u_manager" },
    });
    expect(snap.catalog.items.map((i) => i.id).sort()).toEqual(["app_receivables", "conn_tally"]);
    expect(snap.recommendations[0]!.availability).toBe("available");
    expect(snap.evidence.length).toBe(1);
    expect(Object.isFrozen(snap.recommendations)).toBe(true);

    await S.reopen(PRO, sol.id, "Customer asked for a CRM option");
    await S.upsertChild(PRO, sol.id, "recommendations", {
      ...(await S.get(PRO, sol.id)).workspace.recommendations[0]!,
      title: "Renamed",
      evidenceIds: [],
      catalogItemIds: ["app_receivables", "conn_tally"],
      provenance: "professional_judgment",
    } as never).catch(() => null);
    const v = await S.get(PRO, sol.id);
    expect(v.snapshots[0]!.recommendations[0]!.title).toBe("Receivables app");
    expect(store.audit().some((e) => e.action === "solution.snapshot")).toBe(true);
  });
  it("return requires a comment and moves to returned", async () => {
    const { sol } = await readySolution();
    await S.submitForReview(PRO, sol.id);
    await expect(S.returnForRevision(MGR, sol.id, " ")).rejects.toThrow(ValidationError);
    await S.returnForRevision(MGR, sol.id, "Add a CRM alternative");
    expect((await S.get(PRO, sol.id)).solution.status).toBe("returned");
  });
});

describe("persistence", () => {
  it("saved solutions survive reload; malformed child records are quarantined, siblings kept", async () => {
    const backend = memoryBackend();
    store.attach(backend);
    const { sol, rec } = await readySolution();
    store.attach(backend);
    expect((await S.get(PRO, sol.id)).workspace.recommendations[0]!.id).toBe(rec);
    const saved = JSON.parse(backend.read(STORAGE_KEY)!);
    const sw = saved.tables.solutionWorkspaces.find(
      (w: { solutionId: string }) => w.solutionId === sol.id,
    );
    sw.recommendations.push({ id: "rec_bad", title: 3 });
    backend.write(STORAGE_KEY, JSON.stringify(saved));
    store.attach(backend);
    expect(store.persistence().quarantined).toBe(1);
    expect((await S.get(PRO, sol.id)).workspace.recommendations.map((r) => r.id)).toEqual([rec]);
  });
  it("admin sees all; owner list shows readiness", async () => {
    const { sol } = await readySolution();
    const mine = (await S.list(PRO)).find((x) => x.solution.id === sol.id)!;
    expect(mine.readiness).toBe(100);
    expect((await S.list(ADMIN)).some((x) => x.solution.id === sol.id)).toBe(true);
  });
});

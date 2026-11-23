/** Shared Solution Studio test fixtures (fictional data). */
import { assessmentStudio as A, studioConfig } from "@/data/assessment-studio";
import { seedUsers } from "@/data/seed";
import { solutionStudio as S, solutionConfig } from "@/data/solution-studio";
import { store } from "@/data/store";

export const u = (id: string) => ({ user: seedUsers.find((x) => x.id === id)! });
export const PRO = u("u_pro");
export const MGR = u("u_manager");
export const ADMIN = u("u_admin");
export const PARTNER = u("u_partner_pro");
export const REVIEWER = u("u_reviewer");
export const PM = u("u_pm");

export function resetSolutionTestState() {
  studioConfig.latencyMs = 0;
  solutionConfig.latencyMs = 0;
  store.attach(null);
  store.reset();
}

export const evidence = (over: Record<string, unknown> = {}) => ({
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
export async function approvedAssessment(type: "tenant" | "partner" = "tenant") {
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
export async function readySolution() {
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

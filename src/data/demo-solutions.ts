/**
 * Reference sample data for Solution Studio (fictional). Built only through the real
 * Assessment/Solution services, so every record passes the normal validation,
 * independent approval and snapshot integrity rules.
 */
import { assessmentStudio as A, studioConfig } from "@/data/assessment-studio";
import { seedUsers } from "@/data/seed";
import { solutionStudio as S, solutionConfig } from "@/data/solution-studio";

const u = (id: string) => ({ user: seedUsers.find((x) => x.id === id)! });

interface Spec {
  company: string;
  industry: string;
  geography: string;
  system: string;
  process: string;
  pain: string;
  requirement: string;
  title: string;
  value: string;
  final: "draft" | "in_review" | "approved";
}

const SPECS: Spec[] = [
  {
    company: "Kesar Textiles (fictional)",
    industry: "Manufacturing",
    geography: "Surat",
    system: "TallyPrime",
    process: "Collections",
    pain: "Overdue invoices are chased by hand every week",
    requirement: "See overdue invoices and ageing daily",
    title: "Collections uplift",
    value: "About 6 hours a week saved on manual follow-ups",
    final: "approved",
  },
  {
    company: "Lakeview Residency (fictional)",
    industry: "Hospitality",
    geography: "Udaipur",
    system: "TallyPrime",
    process: "Supplier billing",
    pain: "Supplier bills are reconciled in spreadsheets at month end",
    requirement: "Match supplier bills to payments automatically",
    title: "Supplier billing automation",
    value: "Month-end close shortened by two days",
    final: "in_review",
  },
  {
    company: "Nirmal Clinics (fictional)",
    industry: "Healthcare",
    geography: "Pune",
    system: "TallyPrime",
    process: "Patient receivables",
    pain: "Insurance receivables are tracked on paper",
    requirement: "Track insurance claims through to payment",
    title: "Receivables visibility",
    value: "Fewer missed insurance follow-ups",
    final: "draft",
  },
];

const ev = (over: Record<string, unknown>) => ({
  attribute: "api",
  statement: "Vendor documents a REST API",
  status: "research_finding" as const,
  sources: [
    {
      title: "Vendor documentation",
      sourceType: "vendor_documentation" as const,
      retrievedAt: "2026-11-01T00:00:00Z",
    },
  ],
  researchedAt: "2026-11-01T00:00:00Z",
  confidence: { level: "medium" as const },
  verification: { state: "verified" as const, method: "Checked vendor documentation" },
  links: [],
  ...over,
});

async function build(s: Spec) {
  const PRO = u("u_pro");
  const MGR = u("u_manager");
  const a = await A.create(PRO, {
    type: "tenant",
    title: `${s.company.split(" (")[0]} review`,
    subjectName: s.company,
    channel: "direct",
  });
  await A.saveOverview(PRO, a.id, {
    purpose: `Understand ${s.process.toLowerCase()} challenges`,
    scope: `${s.process} and finance operations`,
    primaryContact: "Finance lead",
  });
  await A.saveProfile(PRO, a.id, {
    industry: s.industry,
    geography: s.geography,
    employees: "60",
    businessModel: s.industry,
  });
  const sys = await A.upsertChild(PRO, a.id, "systems", {
    name: s.system,
    classification: "commercial",
  });
  const proc = await A.upsertChild(PRO, a.id, "processes", { name: s.process });
  const pain = await A.upsertChild(PRO, a.id, "painPoints", {
    processId: proc,
    description: s.pain,
  });
  const req = await A.upsertChild(PRO, a.id, "requirements", {
    category: "workflow",
    statement: s.requirement,
    basis: "confirmed",
  });
  const evidence = await A.upsertChild(
    PRO,
    a.id,
    "evidence",
    ev({ links: [{ kind: "requirement", id: req }], statement: "Customer confirmed the need" }),
  );
  await A.upsertChild(
    PRO,
    a.id,
    "evidence",
    ev({
      applicability: "external_api",
      links: [{ kind: "system", id: sys }],
      statement: `${s.system} exposes an API`,
    }),
  );
  await A.saveFindings(PRO, a.id, {
    environment: `${s.system} for accounting`,
    problems: s.pain,
    opportunities: s.requirement,
    nextSteps: "Design a solution",
  });
  for (const q of ["q_goal", "q_pain", "q_systems", "q_decision"])
    await A.saveAnswer(PRO, a.id, { questionId: q, state: "answered", value: "yes" });
  await A.submitForReview(PRO, a.id);
  const snap = await A.approve(MGR, a.id, "Approved for solution design");

  const sol = await S.create(PRO, { assessmentId: a.id, snapshotId: snap.id, title: s.title });
  const need = await S.upsertChild(PRO, sol.id, "needs", {
    source: { kind: "pain_point", id: pain },
    priority: "high",
  });
  await S.upsertChild(PRO, sol.id, "recommendations", {
    category: "native_app",
    title: "Receivables app",
    needIds: [need],
    rationale: `Addresses: ${s.requirement.toLowerCase()}`,
    catalogItemIds: ["app_receivables", "conn_tally"],
    provenance: "verified_catalog_capability",
    evidenceIds: [evidence],
  });
  await S.upsertChild(PRO, sol.id, "integrations", {
    systemId: sys,
    proposalKind: "connector",
    catalogItemId: "conn_tally",
    feasibility: "possible_uncommitted",
    validationOwner: "Integration lead",
  });
  await S.upsertChild(PRO, sol.id, "values", {
    description: s.value,
    assumptionSource: "Customer interview",
  });
  await S.upsertChild(PRO, sol.id, "roadmap", {
    stage: "foundation",
    deliverables: `Connect ${s.system}`,
  });
  await S.upsertChild(PRO, sol.id, "alternatives", { approach: "aurumi_led", preferred: true });
  await S.upsertChild(PRO, sol.id, "alternatives", {
    approach: "defer",
    summary: "Keep the current manual process",
  });
  await S.saveOverview(PRO, sol.id, {
    preferredRationale: "Fastest path with an available connector",
    outstandingQuestions: `Confirm the ${s.system} edition supports the connector`,
  });
  if (s.final === "draft") return;
  await S.submitForReview(PRO, sol.id, "Ready for review");
  if (s.final === "approved") await S.approve(MGR, sol.id, "Approved as reference design");
}

/** Creates three reference solutions (approved, in review, draft). */
export async function loadDemoSolutions() {
  const prev = [studioConfig.latencyMs, solutionConfig.latencyMs] as const;
  studioConfig.latencyMs = 0;
  solutionConfig.latencyMs = 0;
  try {
    for (const s of SPECS) await build(s);
  } finally {
    studioConfig.latencyMs = prev[0];
    solutionConfig.latencyMs = prev[1];
  }
}

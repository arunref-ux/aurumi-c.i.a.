import { beforeEach, expect, it } from "vitest";
import { assessmentStudio as AS } from "@/data/assessment-studio";
import { solutionStudio as SS } from "@/data/solution-studio";
import { proposalStudio as PS } from "@/data/proposal-studio";
import { engagementService as E } from "@/data/delivery";
import { questionsFor } from "@/domain/assessment";
import { QUESTION_BANK } from "@/data/question-bank";
import { proposalScopeTerms } from "@/domain/delivery";
import { store } from "@/data/store";
import { reset, first, PARTNER, A, R, M, creation, faults } from "./delivery-fixtures";

beforeEach(() => {
  reset();
  store.reset();
});
it("J04 builds an actual partner-scoped Assessment → Solution → reseller proposal → authorized delivery, never relabelling a tenant handoff", async () => {
  const backend = faults().backend;
  const assessment = await AS.create(PARTNER, {
    type: "partner",
    title: "Fictional distributor reseller opportunity",
    subjectName: "North Ledger partner (fictional)",
    channel: "partner_referral",
  });
  await AS.saveOverview(PARTNER, assessment.id, {
    purpose: "Distribution reporting",
    scope: "Reseller-led advisory",
    primaryContact: "Fictional partner manager",
  });
  await AS.saveProfile(PARTNER, assessment.id, {
    industry: "Distribution",
    geography: "Canada",
    employees: "20",
    businessModel: "Distribution",
  });
  await AS.savePartner(PARTNER, assessment.id, {
    partnerCategory: "Reseller",
    products: "Tally and reporting advisory",
    objectives: "Evaluate reporting value",
  });
  const system = await AS.upsertChild(PARTNER, assessment.id, "systems", {
    name: "Tally",
    classification: "commercial",
  });
  const process = await AS.upsertChild(PARTNER, assessment.id, "processes", {
    name: "Distributor reporting",
  });
  const pain = await AS.upsertChild(PARTNER, assessment.id, "painPoints", {
    processId: process,
    description: "Manual follow-up and reporting",
  });
  await AS.upsertChild(PARTNER, assessment.id, "requirements", {
    category: "reporting",
    statement: "Comparable distributor report",
    basis: "confirmed",
  });
  await AS.upsertChild(PARTNER, assessment.id, "evidence", {
    attribute: "requirement",
    statement:
      "Fictional distributor interview confirms manual reporting need, not connector availability",
    status: "confirmed_fact",
    sources: [
      {
        title: "Fictional distributor interview",
        sourceType: "interview",
        retrievedAt: new Date().toISOString(),
      },
    ],
    researchedAt: new Date().toISOString(),
    confidence: { level: "high" },
    verification: {
      state: "verified",
      method: "Reviewed this fictional interview for reporting need only",
    },
    links: [{ kind: "system", id: system }],
  });
  await AS.saveFindings(PARTNER, assessment.id, {
    environment: "Existing Tally and spreadsheets retained",
    problems: "Manual reporting",
    opportunities: "Advisory",
    nextSteps: "Validate feasibility",
  });
  for (const q of questionsFor(
    (await AS.get(PARTNER, assessment.id)).workspace,
    "partner",
    QUESTION_BANK,
  ).filter((q) => q.required))
    await AS.saveAnswer(PARTNER, assessment.id, {
      questionId: q.id,
      state: "answered",
      value: "Fictional partner interview reviewed",
    });
  await AS.submitForReview(PARTNER, assessment.id);
  const baseline = await AS.approve(A, assessment.id);
  const solution = await SS.create(PARTNER, {
    assessmentId: assessment.id,
    snapshotId: baseline.id,
    title: "Reseller distributor advisory",
  });
  const need = await SS.upsertChild(PARTNER, solution.id, "needs", {
    source: { kind: "pain_point", id: pain },
    priority: "high",
  });
  await SS.upsertChild(PARTNER, solution.id, "recommendations", {
    category: "native_app",
    title: "Operations reporting",
    needIds: [need],
    rationale: "Available reporting, conditional data inputs",
    catalogItemIds: ["app_ops_reports"],
    provenance: "verified_catalog_capability",
  });
  await SS.upsertChild(PARTNER, solution.id, "integrations", {
    systemId: system,
    proposalKind: "custom",
    feasibility: "possible_uncommitted",
    validationOwner: "Fictional partner technical lead",
  });
  await SS.upsertChild(PARTNER, solution.id, "values", {
    description: "Potential reporting improvement",
    assumptionSource: "Fictional interview",
  });
  await SS.upsertChild(PARTNER, solution.id, "roadmap", {
    stage: "foundation",
    deliverables: "Distribution report and advisory",
  });
  await SS.upsertChild(PARTNER, solution.id, "alternatives", {
    approach: "hybrid",
    preferred: true,
  });
  await SS.upsertChild(PARTNER, solution.id, "alternatives", {
    approach: "defer",
    summary: "Retain manual reporting",
  });
  await SS.savePartner(PARTNER, solution.id, {
    hypothesis: "Reseller-led distributor reporting",
    technicalValidation: "Validate Tally interface; not agreed",
  });
  await SS.saveOverview(PARTNER, solution.id, {
    preferredRationale: "Conditional distributor advisory",
    outstandingQuestions: "No guaranteed connector",
  });
  await SS.submitForReview(PARTNER, solution.id);
  const handoff = await SS.approve(A, solution.id);
  const proposal = await PS.create(PARTNER, {
    solutionSnapshotId: handoff.id,
    track: "reseller_partner",
    title: "Fictional North Ledger distribution proposal",
  });
  const pv = await PS.get(PARTNER, proposal.id);
  for (const section of pv.workspace.sections)
    if (!["cover", "scope"].includes(section.key))
      await PS.saveSection(PARTNER, proposal.id, section.key, {
        body: "Fictional proposed partner service. No commissions or signed contract; external interfaces excluded until feasibility validation.",
      });
  for (const d of pv.workspace.deliverables)
    await PS.upsertChild(PARTNER, proposal.id, "deliverables", {
      id: d.id,
      recommendationId: d.recommendationId,
      description: d.description,
      inclusion: "included",
      acceptanceCriterion: "Distributor acknowledges comparable report",
      responsibleParty: "partner",
      qualification: "External integration excluded pending validation",
    });
  for (const r of pv.workspace.risks)
    await PS.upsertChild(PARTNER, proposal.id, "risks", {
      id: r.id,
      category: r.category,
      description: r.description,
      severity: r.severity,
      resolution: "accepted",
      qualification: "Customer acknowledges conditional interfaces",
    });
  await PS.upsertChild(PARTNER, proposal.id, "partnerTerms", {
    kind: "other",
    description: "Fictional reseller delivers agreed advisory; no financial commission",
  });
  await PS.saveMeta(PARTNER, proposal.id, {
    recipient: {
      name: "Fictional distributor manager",
      contact: "distributor@example.invalid",
      organization: "Harbour Distribution (fictional)",
    },
  });
  await PS.upsertChild(PARTNER, proposal.id, "lines", {
    category: "implementation",
    priceBookItemId: "pb_impl_standard",
    quantity: 1,
    description: "Distribution reporting advisory",
  });
  const submitted = await PS.submitForReview(PARTNER, proposal.id);
  const acknowledged = [
    ...submitted.document.deliverables.filter((d) => d.info.needsQualification).map((d) => d.id),
    ...submitted.document.risks.filter((r) => r.resolution === "accepted").map((r) => r.id),
  ];
  await PS.approve(R, proposal.id, submitted.id, { acknowledged });
  const issued = await PS.issue(A, proposal.id, submitted.id);
  const total = first(issued.document.commercials.summary.totals);
  const engagement = await E.create(
    A,
    creation({
      operationKey: "phase7-reseller",
      origin: "proposal",
      title: "Fictional distributor delivery",
      customerName: "Harbour Distribution (fictional)",
      proposalVersionId: issued.id,
      allocationId: "phase7-reseller",
      partnerAffiliationId: "aff_northledger",
      leadProfessionalId: "pro_liam",
      terms: {
        ...creation().terms,
        ...proposalScopeTerms(issued),
        amount: total.initialCost,
        currency: total.currency,
      },
    }),
  );
  for (const state of ["pending_authorization", "authorized", "mobilizing", "active"])
    await E.transition(
      A,
      engagement.engagement.id,
      state,
      "mock://reseller-authorization",
      "Explicit fictional commercial and service authorization",
    );
  const id = engagement.engagement.id;
  const planned = await E.workstream(A, id, {
    name: "Distributor advisory",
    description: "Assigned reseller scope",
    ownerProfessionalId: "pro_liam",
    start: "2026-11-24",
    end: "2026-12-31",
    dependencies: [],
  });
  await E.assign(A, id, {
    professionalId: "pro_liam",
    responsibility: "training",
    workstreamId: first(planned.workspace.workstreams).id,
    start: "2026-11-24",
    end: "2026-12-31",
    allocationHours: 8,
    qualificationIds: [],
    service: "adoption_training",
  });
  const partnerView = await E.get(PARTNER, id);
  await E.review(PARTNER, id, {
    kind: "monthly",
    scheduledAt: new Date().toISOString(),
    calendarReference: "mock://calendar",
    summary: "Distributor advisory review",
    customerFeedback: "Reporting feasibility reviewed",
    nextActions: "Validate external input",
    participants: ["customer", "partner"],
    evidence: "mock://review",
    comment: "Review does not imply closure",
  });
  expect(partnerView.commercialVisible).toBe(false);
  expect(partnerView.initiation).toBeNull();
  expect(issued.document.proposal.track).toBe("reseller_partner");
  expect(handoff.solution.kind).toBe("partner");
  expect(handoff.sourceAssessment.assessment.type).toBe("partner");
  expect(issued.document.commercials.partnerTerms.every((t) => t.status === "proposed")).toBe(true);
  await expect(E.get(PARTNER, "delivery_hotel")).rejects.toThrow();
  const crossOrg = { user: { ...M.user, organizationId: "unrelated-org" } };
  await expect(E.get(crossOrg, id)).rejects.toThrow();
  for (let i = 0; i < 3; i++) {
    store.attach(backend);
    expect((await PS.get(A, proposal.id)).versions.at(-1)?.document).toEqual(issued.document);
    expect((await E.get(A, id)).overview.customerName).toBe("Harbour Distribution (fictional)");
  }
});

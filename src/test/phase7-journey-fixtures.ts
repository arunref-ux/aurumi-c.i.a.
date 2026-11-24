/** Clean fictional upstream-to-downstream journeys: never substitute seeded handoffs. */
import { businessFitPublic as B } from "@/data/business-fit-public";
import { businessFitInternal as I } from "@/data/business-fit-internal";
import { FIT_SCENARIOS } from "@/data/business-fit-seed";
import { assessmentStudio as AS } from "@/data/assessment-studio";
import { solutionStudio as SS } from "@/data/solution-studio";
import { proposalStudio as PS } from "@/data/proposal-studio";
import { engagementService as E } from "@/data/delivery";
import { proposalScopeTerms } from "@/domain/delivery";
import { questionsFor } from "@/domain/assessment";
import { QUESTION_BANK } from "@/data/question-bank";
import { first, M, P, A, R, creation } from "./delivery-fixtures";

export const hotelContact = {
  name: "Fictional Hotel Operations Manager",
  businessName: "Phase 7 Harbour Hotel (fictional)",
  email: "hotel@example.invalid",
  phone: "",
  country: "India",
  preferredContact: "email",
  comments: "Controlled fictional evaluation; retain existing software",
  contactConsent: true,
  marketingConsent: false,
};

export async function cleanStudioJourney(scenario = 0) {
  const responses = {
    ...structuredClone(first(FIT_SCENARIOS.slice(scenario)).responses),
    businessName: hotelContact.businessName,
  };
  const handle = B.begin();
  B.save(handle, responses, 4);
  const report = B.generate(handle);
  const consultation = await B.consult(handle, hotelContact);
  const intake = first(I.list(M)).intake;
  I.assign(M, intake.id, P.user.id);
  I.status(P, intake.id, "qualified");
  const assessmentId = await I.convert(P, intake.id, {
    type: "tenant",
    confirm: true,
    organizationId: P.user.organizationId,
  });
  const imported = await AS.get(P, assessmentId);
  await AS.saveOverview(P, assessmentId, {
    purpose: "Reduce reporting effort and improve departmental accountability",
    scope: "Hotel finance and management reporting; existing PMS and attendance retained",
    primaryContact: hotelContact.name,
  });
  await AS.saveProfile(P, assessmentId, {
    businessName: hotelContact.businessName,
    industry: scenario === 3 ? "Manufacturing" : "Hospitality",
    geography: "India, one property",
    employees: "Approximately 100",
    businessModel: "Room nights and departmental services",
  });
  const processId = await AS.upsertChild(P, assessmentId, "processes", {
    name: "Management report preparation",
  });
  const painId = await AS.upsertChild(P, assessmentId, "painPoints", {
    processId,
    description: "Preparing comparable management reports takes 120 minutes",
  });
  const requirementId = await AS.upsertChild(P, assessmentId, "requirements", {
    category: "reporting",
    statement: "A comparable departmental management report",
    basis: "confirmed",
  });
  const evidenceId = await AS.upsertChild(P, assessmentId, "evidence", {
    attribute: "requirement",
    statement: "Fictional interview confirms the reporting requirement, not connector availability",
    status: "confirmed_fact",
    sources: [
      {
        title: "Fictional management interview",
        sourceType: "interview",
        retrievedAt: new Date().toISOString(),
      },
    ],
    researchedAt: new Date().toISOString(),
    confidence: { level: "high" },
    verification: {
      state: "verified",
      method: "Professional checked this fictional interview against the reporting requirement",
    },
    links: [{ kind: "requirement", id: requirementId }],
  });
  await AS.saveFindings(P, assessmentId, {
    environment:
      "PMS, Tally, attendance and spreadsheets retained; interfaces require investigation",
    problems: "Manual reporting and departmental accountability gaps",
    opportunities:
      "Use Operations Reporting for available Aurumi data; validate external feeds independently",
    nextSteps: "Conditional integration feasibility before production commitment",
  });
  for (const question of questionsFor(
    imported.workspace,
    imported.assessment.type,
    QUESTION_BANK,
  ).filter((q) => q.required))
    await AS.saveAnswer(P, assessmentId, {
      questionId: question.id,
      state: "answered",
      value: "Fictional management interview reviewed; existing systems retained",
    });
  await AS.submitForReview(P, assessmentId);
  const assessmentSnapshot = await AS.approve(
    M,
    assessmentId,
    "Independent fictional assessment review; self-reported imports remain distinguishable",
  );
  const solution = await SS.create(P, {
    assessmentId,
    snapshotId: assessmentSnapshot.id,
    title: "Hotel reporting and accountability",
  });
  const need = await SS.upsertChild(P, solution.id, "needs", {
    source: { kind: "pain_point", id: painId },
    priority: "high",
  });
  await SS.upsertChild(P, solution.id, "recommendations", {
    category: "native_app",
    title: "Operations Reporting",
    needIds: [need],
    rationale: "Report on data already available in Aurumi; external feeds not guaranteed",
    catalogItemIds: ["app_ops_reports"],
    provenance: "verified_catalog_capability",
    evidenceIds: [evidenceId],
  });
  const system = first(assessmentSnapshot.systems);
  await SS.upsertChild(P, solution.id, "integrations", {
    systemId: system.id,
    proposalKind: "custom",
    feasibility: "possible_uncommitted",
    validationOwner: "Integration lead",
  });
  await SS.upsertChild(P, solution.id, "values", {
    description: "Target reporting effort of 60 minutes; no guarantee",
    assumptionSource: "Fictional baseline interview",
  });
  await SS.upsertChild(P, solution.id, "roadmap", {
    stage: "foundation",
    deliverables: "Comparable departmental report and workflow training",
  });
  await SS.upsertChild(P, solution.id, "alternatives", { approach: "aurumi_led", preferred: true });
  await SS.upsertChild(P, solution.id, "alternatives", {
    approach: "defer",
    summary: "Keep existing manual reporting",
  });
  await SS.saveOverview(P, solution.id, {
    preferredRationale:
      "Use available reporting capability without inventing integration availability",
    outstandingQuestions:
      "PMS, accounting and biometric interface compatibility remains unconfirmed",
  });
  await SS.submitForReview(P, solution.id);
  const solutionSnapshot = await SS.approve(
    M,
    solution.id,
    "Conditional interfaces acknowledged; no unsupported capability promise",
  );
  const proposal = await PS.create(P, {
    solutionSnapshotId: solutionSnapshot.id,
    track: "tenant_commercial",
    title: "Hotel reporting advisory and implementation",
  });
  const proposalView = await PS.get(P, proposal.id);
  for (const deliverable of proposalView.workspace.deliverables)
    await PS.upsertChild(P, proposal.id, "deliverables", {
      id: deliverable.id,
      recommendationId: deliverable.recommendationId,
      description: deliverable.description,
      inclusion: "included",
      acceptanceCriterion: "Comparable departmental report reviewed with hotel management",
      responsibleParty: "aurumi",
      qualification:
        "External PMS, attendance and accounting feeds are excluded pending feasibility validation",
    });
  for (const section of proposalView.workspace.sections)
    if (section.key !== "cover" && section.key !== "scope")
      await PS.saveSection(P, proposal.id, section.key, {
        body: "Fictional authorized service; retain existing systems; external integrations excluded until feasibility is validated",
      });
  for (const risk of proposalView.workspace.risks)
    await PS.upsertChild(P, proposal.id, "risks", {
      id: risk.id,
      category: risk.category,
      description: risk.description,
      severity: risk.severity,
      resolution: "accepted",
      qualification: "Conditional interface risk acknowledged; not an integration commitment",
    });
  await PS.upsertChild(P, proposal.id, "lines", {
    category: "implementation",
    priceBookItemId: "pb_impl_standard",
    quantity: 1,
    description: "Comparable reporting implementation and advisory",
  });
  const submittedVersion = await PS.submitForReview(P, proposal.id);
  const acknowledged = [
    ...submittedVersion.document.deliverables
      .filter((d) => d.info.needsQualification)
      .map((d) => d.id),
    ...submittedVersion.document.risks.filter((r) => r.resolution === "accepted").map((r) => r.id),
  ];
  await PS.approve(R, proposal.id, submittedVersion.id, { acknowledged });
  const issued = await PS.issue(M, proposal.id, submittedVersion.id);
  const share = await PS.share(M, proposal.id, {
    versionId: issued.id,
    recipient: { name: hotelContact.name, email: hotelContact.email },
  });
  await PS.recordResponse(M, share.id, {
    response: "accepted",
    note: "Simulated customer response, not a signed contract",
  });
  const total = first(issued.document.commercials.summary.totals);
  const engagement = await E.create(
    M,
    creation({
      operationKey: `phase7-hotel-${scenario}`,
      title: "Phase 7 hotel reporting delivery",
      origin: "proposal",
      customerName: issued.document.recipient.organization || issued.document.recipient.name,
      proposalVersionId: issued.id,
      allocationId: `phase7-hotel-${scenario}`,
      terms: {
        ...creation().terms,
        ...proposalScopeTerms(issued),
        currency: total.currency,
        amount: total.initialCost,
      },
    }),
  );
  for (const state of ["pending_authorization", "authorized", "mobilizing", "active"])
    await E.transition(
      M,
      engagement.engagement.id,
      state,
      "mock://file-hub/commencement",
      "Explicit fictional customer and commercial commencement authorization",
    );
  return {
    handle,
    report,
    consultation,
    intakeId: intake.id,
    imported,
    assessmentId,
    assessmentSnapshot,
    solution,
    solutionSnapshot,
    proposal,
    issued,
    share,
    engagementId: engagement.engagement.id,
  };
}

export async function deliverAndComplete(id: string) {
  let view = await E.workstream(M, id, {
    name: "Hotel reporting",
    description: "Agreed departmental reporting",
    ownerProfessionalId: "pro_rohan",
    start: "2026-11-24",
    end: "2026-12-31",
    dependencies: [],
  });
  const stream = first(view.workspace.workstreams);
  for (const obligation of view.obligations.filter((o) => o.required)) {
    view = await E.deliverable(M, id, {
      workstreamId: stream.id,
      ownerProfessionalId: "pro_rohan",
      title: obligation.description,
      description: "Fictional agreed report reviewed with customer",
      criteria: obligation.criteria,
      due: "2026-12-01",
      required: true,
      independentReview: true,
      acceptanceKind:
        obligation.acceptance === "review_evidence" ? "customer_acceptance" : obligation.acceptance,
      artifactReference: "mock://file-hub/hotel-report",
    });
    const d = view.workspace.deliverables.at(-1);
    if (!d) throw Error("Missing clean deliverable");
    await E.mapObligation(M, id, {
      obligationId: obligation.id,
      deliverableIds: [d.id],
      milestoneIds: [],
      workstreamIds: [stream.id],
      reviewIds: [],
      coverage: obligation.criteria,
      evidence: ["mock://mapping"],
      comment: "Exact authorized criterion mapping",
    });
    view = await E.submitDeliverable(M, id, d.id);
    const version = view.workspace.deliverables.find((r) => r.id === d.id)?.versions.at(-1);
    if (!version) throw Error("Missing submitted version");
    await E.reviewDeliverable(
      A,
      id,
      d.id,
      version.id,
      d.acceptanceKind,
      "accepted",
      "mock://file-hub/customer-acceptance",
      "Independent simulated customer acceptance of this exact version",
    );
  }
  view = await E.milestone(M, id, {
    workstreamId: stream.id,
    title: "Agreed reporting accepted",
    description: "Authorized report and training",
    ownerProfessionalId: "pro_rohan",
    due: "2026-12-01",
    criteria: "All agreed reports accepted",
    deliverableIds: view.workspace.deliverables.map((d) => d.id),
    dependencies: [],
    required: true,
  });
  await E.milestoneStatus(M, id, first(view.workspace.milestones).id, "completed", [
    "mock://accepted-reports",
  ]);
  view = await E.outcome(M, id, {
    objective: "Reduce reporting preparation time",
    definition: "Minutes for the same departmental report",
    unit: "minutes",
    type: "quantitative",
    baseline: 120,
    baselineDescription: "Fictional management report baseline",
    baselineEvidence: ["mock://baseline"],
    target: 60,
    targetDescription: "Target, not guarantee",
    direction: "decrease",
    frequency: "Monthly",
    ownerProfessionalId: "pro_rohan",
    workstreamId: stream.id,
  });
  const outcome = first(view.workspace.outcomes);
  view = await E.measure(
    M,
    id,
    outcome.id,
    {
      value: 80,
      observedAt: new Date().toISOString(),
      qualitative: "Partial result",
      source: "Fictional customer observation",
      provenance: "customer_reported",
      evidence: ["mock://observation"],
    },
    "partially_achieved",
    "Target remains unmet",
  );
  const measurement = first(first(view.workspace.outcomes).measurements);
  await E.verifyMeasurement(
    A,
    id,
    outcome.id,
    measurement.id,
    "mock://verification",
    "Independent fictional observation verification",
  );
  view = await E.continuation(M, id, {
    kind: "advisory",
    recommendation: "Continue source-data quality coaching",
    customerNeed: "Consistent departmental inputs",
    evidence: ["mock://customer-need"],
  });
  const recommendation = first(view.workspace.continuations);
  await E.handoffContinuation(M, id, recommendation.id, "phase7-continuation");
  const completion = {
    evidence: "mock://completion",
    comment: "Independent honest completion",
    summary: "Delivered agreed reporting; 120 to 80 minutes, target 60 not achieved",
    customerFeedback: "Agreed services accepted with partial improvement",
    outstandingResponsibilities: "Customer standardizes departmental inputs",
  };
  await E.review(M, id, {
    kind: "completion",
    scheduledAt: new Date().toISOString(),
    calendarReference: "mock://calendar",
    summary: completion.summary,
    customerFeedback: completion.customerFeedback,
    nextActions: completion.outstandingResponsibilities,
    outstandingResponsibilities: completion.outstandingResponsibilities,
    participants: ["customer", M.user.id],
    evidence: "mock://review",
    comment: "Fresh material-state review",
  });
  await E.transition(
    M,
    id,
    "completion_review",
    "mock://request-completion",
    "Request independent completion",
  );
  return E.complete(A, id, completion);
}

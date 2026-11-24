/** Six explicitly fictional operational journeys, added without modifying earlier seed records. */
import { seedProfessionals, seedUsers, ORG } from "./seed";
import {
  seal,
  strongSeal,
  STRONG_CONTRACT,
  sourceObligations,
  establishOutcomeEvidence,
  measurementContent,
  completionState,
  contentValue,
  SERVICES,
  type ProfessionalProfile,
  type DeliveryWorkspace,
  type ServiceTerms,
  type ProfessionalAssignment,
  type ExpertiseCategory,
  DELIVERY_SCHEMA,
} from "@/domain/delivery";
import { AuthorizationSchema } from "@/domain/delivery-evidence";
import type { Engagement } from "@/domain/types";
const at = "2026-11-24T04:00:00.000Z";
export const demoBase = (id: string, by = "u_admin") => ({
  id,
  organizationId: ORG,
  createdAt: at,
  createdBy: by,
  updatedAt: at,
  updatedBy: by,
});
const approval = {
  by: "u_admin",
  at,
  evidence: "mock://file-hub/authorized-demonstration",
  comment: "Fictional demonstration authorization, not a real contract",
  simulated: true,
};
export const deliveryExpertise: ExpertiseCategory[] = [
  "Process assessment",
  "Hospitality operations",
  "Accounting systems",
  "Tally",
  "QuickBooks",
  "CRM implementation",
  "HR and attendance",
  "Workflow automation",
  "AI-assisted operations",
  "Integration advisory",
  "Change management",
  "Training",
  "Information security advisory",
].map((label, i) => ({ ...demoBase(`expertise_${i}`), label, active: true }));
export const deliveryProfiles: ProfessionalProfile[] = seedProfessionals.map((p) => {
  const u = seedUsers.find((u) => u.id === p.userId);
  if (!u) throw Error("Missing demo identity");
  const relationship =
    p.id === "pro_ananya" ? "independent" : p.id === "pro_liam" ? "reseller" : "employed";
  return {
    ...demoBase(p.id),
    userId: p.userId,
    teamId: u.teamId,
    displayName: p.displayName,
    title: relationship === "independent" ? "Independent integration & delivery adviser" : p.title,
    summary:
      "Fictional professional profile. Expertise tags are self-declared; authorizations below are simulated.",
    country: p.id === "pro_liam" ? "Canada" : "India",
    region: p.region,
    timezone: p.id === "pro_liam" ? "America/Toronto" : "Asia/Kolkata",
    languages: p.id === "pro_liam" ? ["English", "French"] : ["English", "Hindi"],
    expertise: ["expertise_0", "expertise_9", "expertise_11"],
    status: "active",
    services: [...SERVICES],
    affiliations: [
      {
        ...demoBase(`affiliation_${p.id}`),
        organization: p.affiliationId ?? "aff_aurumi",
        relationship,
        start: "2026-01-01",
        end: null,
        status: "approved",
        approval,
      },
    ],
    qualifications: [
      {
        ...demoBase(`authorization_${p.id}`),
        professionalId: p.id,
        name: "Simulated Aurumi delivery authorization",
        issuer: "Aurumi (fictional demonstration)",
        category: "aurumi_authorization",
        issueDate: "2026-01-01",
        expiryDate: "2027-01-01",
        evidenceReference: "mock://file-hub/authorization",
        services: [...SERVICES],
        status: "verified",
        verification: approval,
        notes: "Not a certification or an examination credential",
      },
    ],
    availability: p.id === "pro_ananya" ? "limited" : "available",
    weeklyCapacity: p.id === "pro_ananya" ? 20 : 32,
    absenceStart: null,
    absenceEnd: null,
    statusDecision: approval,
  };
});
export const demoTerms = (included: string): ServiceTerms => ({
  included,
  excluded: "Production connector commitments and new product development",
  assumptions:
    "Customer provides access to agreed systems; third-party integration remains subject to verified feasibility",
  customerResponsibilities: "Provide source data and appoint a departmental contact",
  professionalResponsibilities: "Delivery oversight, evidence-based advice and agreed training",
  commercialBasis: "Explicit fictional service allocation DEMO-2026, separately authorized",
  currency: "INR",
  amount: 24000,
  period: "one_time",
  pricingReference: "mock://pricing-studio/authorized-service-allocation",
  start: "2026-11-01",
  end: "2026-12-31",
  cadence: "Weekly delivery review",
});
function assignment(
  eid: string,
  pid: string,
  responsibility: ProfessionalAssignment["responsibility"],
  workstreamId = "",
): ProfessionalAssignment {
  const p = deliveryProfiles.find((p) => p.id === pid);
  const affiliation = p?.affiliations[0];
  if (!p || !affiliation) throw Error("Missing seeded professional");
  return {
    ...demoBase(`assignment_${eid}_${pid}`),
    engagementId: eid,
    professionalId: pid,
    userId: p.userId,
    responsibility,
    workstreamId,
    start: "2026-11-01",
    end: null,
    status: "active",
    acknowledgedAt: at,
    allocationHours: responsibility === "lead" ? 8 : 4,
    qualificationIds: [`authorization_${pid}`],
    service: "implementation",
    affiliation: {
      id: affiliation.id,
      organization: affiliation.organization,
      relationship: affiliation.relationship,
      start: affiliation.start,
      end: affiliation.end,
    },
  };
}
const scenarios = [
  {
    id: "delivery_hotel",
    title: "Coral Bay — connected operations",
    name: "Coral Bay Resort (fictional)",
    scope:
      "Mobilization, PMS/Tally/attendance feasibility, workflow implementation, departmental training and reporting",
    service: "implementation",
    status: "active",
    lead: "pro_rohan",
  },
  {
    id: "delivery_distribution",
    title: "Brightline — adoption & monthly advisory",
    name: "Brightline Distribution (fictional)",
    scope:
      "Retain Tally; improve spreadsheet follow-ups, task accountability and monthly management reviews",
    service: "ongoing_advisory",
    status: "active",
    lead: "pro_rohan",
  },
  {
    id: "delivery_training",
    title: "Cedar Foods — team training",
    name: "Cedar Foods (fictional)",
    scope:
      "Two departmental training sessions and an adoption check; separately authorized direct service",
    service: "adoption_training",
    status: "authorized",
    lead: "pro_rohan",
  },
  {
    id: "delivery_reseller",
    title: "Maple Books — customer enablement",
    name: "Maple Books customer (fictional)",
    scope: "Reseller-led adoption support for the explicitly assigned customer only",
    service: "partner_enablement",
    status: "active",
    lead: "pro_liam",
  },
  {
    id: "delivery_specialist",
    title: "Harbour Logistics — integration advisory",
    name: "Harbour Logistics (fictional)",
    scope:
      "Independent specialist review of existing third-party accounting integration; no connector commitment",
    service: "integration_advisory",
    status: "active",
    lead: "pro_rohan",
  },
  {
    id: "delivery_completed",
    title: "Shreeji — reporting review completed",
    name: "Shreeji Precision (fictional)",
    scope: "Management reporting process improvement and training",
    service: "process_improvement",
    status: "completed",
    lead: "pro_rohan",
  },
] as const;
export const deliveryEngagements: Engagement[] = [];
export const deliveryWorkspaces: DeliveryWorkspace[] = scenarios.map((s) => {
  const terms = demoTerms(s.scope);
  if (s.service === "ongoing_advisory") {
    terms.period = "monthly";
    terms.amount = 12000;
    terms.cadence = "Monthly advisory review";
  }
  const streamId = `workstream_${s.id}`;
  const customer = {
    reference: `mock://shoptalk/${s.id}`,
    name: s.name,
    kind: "customer" as const,
    partnerAffiliationId: s.id === "delivery_reseller" ? "aff_northledger" : "",
  };
  const initiation = seal({
    ...demoBase(`init_${s.id}`),
    schema: "aurumi.cia.engagement-initiation/1" as const,
    engagementId: s.id,
    customer,
    serviceCategories: [s.service],
    source: { kind: "direct" as const, customerReference: customer.reference },
    terms,
    deliverables: [
      {
        title: "Delivery findings & recommendations",
        criteria: "Source limitations documented; customer responsibilities recorded",
      },
    ],
    authorizingEvidence: approval.evidence,
  });
  const scopes = [
    seal({
      ...demoBase(`scope_${s.id}_1`),
      schema: "aurumi.cia.engagement-scope/1" as const,
      engagementId: s.id,
      number: 1,
      terms,
      changeId: "",
      approval,
    }),
  ];
  const assignments = [assignment(s.id, s.lead, "lead")];
  if (s.id === "delivery_hotel" || s.id === "delivery_specialist")
    assignments.push(assignment(s.id, "pro_ananya", "integration", streamId));
  const w: DeliveryWorkspace = {
    ...demoBase(`workspace_${s.id}`),
    engagementId: s.id,
    initiation,
    authorization: approval,
    scopes,
    assignments,
    workstreams: [
      {
        ...demoBase(streamId),
        engagementId: s.id,
        name: s.id === "delivery_hotel" ? "Discovery, integration & training" : "Service delivery",
        description: s.scope,
        ownerProfessionalId: s.lead,
        start: "2026-11-01",
        end: "2026-12-31",
        dependencies: [],
        status: s.status === "completed" ? "completed" : "active",
      },
    ],
    milestones: [
      {
        ...demoBase(`milestone_${s.id}`),
        engagementId: s.id,
        workstreamId: streamId,
        title: "Review findings with customer",
        description: "Confirm recommendations and actual results",
        ownerProfessionalId: s.lead,
        due: s.id === "delivery_hotel" ? "2026-11-22" : "2026-12-04",
        completedAt: null,
        criteria: "Accepted findings and recorded customer feedback",
        deliverableIds: [`deliverable_${s.id}`],
        dependencies: [],
        required: true,
        status: "planned",
        evidence: [],
        exception: null,
      },
    ],
    deliverables: [
      {
        ...demoBase(`deliverable_${s.id}`),
        engagementId: s.id,
        workstreamId: streamId,
        ownerProfessionalId: s.lead,
        title: "Delivery findings & recommendations",
        description: s.scope,
        criteria: "Source limitations documented; customer responsibilities recorded",
        due: "2026-12-04",
        required: true,
        independentReview: true,
        acceptanceKind: "customer_acceptance",
        artifactReference: "mock://file-hub/findings",
        status: "draft",
        versions: [],
        reviews: [],
      },
    ],
    outcomes: [
      {
        ...demoBase(`outcome_${s.id}`),
        engagementId: s.id,
        objective: "Reduce management report preparation time",
        definition:
          "Minutes to prepare the same agreed consolidated report, observed once per month",
        unit: "minutes",
        type: "quantitative",
        baseline: s.id === "delivery_training" ? null : 120,
        baselineDescription: "Customer-reported observation (fictional)",
        baselineEvidence: ["mock://file-hub/baseline"],
        target: 60,
        targetDescription: "Target only, not a guaranteed benefit",
        direction: "decrease",
        frequency: "Monthly",
        ownerProfessionalId: s.lead,
        status: "in_progress",
        feedback: "",
        measurements: [],
      },
    ],
    tasks: [],
    interactions: [],
    changes: [],
    concerns: [],
    reviews: [],
    continuations: [],
    holdReason: "",
    holdBy: "",
    completion: null,
    cancellation: null,
  };
  if (s.status === "completed") {
    const d = w.deliverables[0],
      m = w.milestones[0],
      o = w.outcomes[0];
    if (!d || !m || !o) throw Error("Missing completion demo");
    const v = seal({
      ...demoBase(`version_${s.id}_1`, "u_manager"),
      schema: "aurumi.cia.deliverable-version/1" as const,
      engagementId: s.id,
      deliverableId: d.id,
      number: 1,
      description: d.description,
      criteria: d.criteria,
      artifactReference: d.artifactReference,
      authorProfessionalId: "pro_rohan",
      submittedAt: at,
    });
    d.versions.push(v);
    d.reviews.push(
      seal({
        ...demoBase(`acceptance_${s.id}`),
        engagementId: s.id,
        deliverableId: d.id,
        versionId: v.id,
        versionValue: v.integrityValue,
        kind: "customer_acceptance" as const,
        decision: "accepted" as const,
        approval,
      }),
    );
    d.status = "accepted";
    m.status = "completed";
    m.completedAt = at;
    m.evidence = [v.artifactReference];
    o.status = "partially_achieved";
    o.feedback = "Report preparation improved but remains above the agreed target";
    o.measurements.push({
      ...demoBase(`measurement_${s.id}`),
      engagementId: s.id,
      outcomeId: o.id,
      observedAt: at,
      value: 80,
      qualitative: "Partial improvement; input data cleanup remains with the customer",
      source: "Customer feedback at completion review",
      provenance: "customer_reported",
      evidence: ["mock://file-hub/customer-feedback"],
      verification: null,
    });
    w.reviews.push(
      seal({
        ...demoBase(`review_${s.id}`),
        schema: "aurumi.cia.engagement-review/1" as const,
        engagementId: s.id,
        kind: "completion" as const,
        scheduledAt: at,
        calendarReference: "mock://tasks-calendar/completion",
        summary:
          "Delivered reporting review; target partially achieved and limitations acknowledged",
        customerFeedback: o.feedback,
        nextActions: "Customer to standardize the remaining spreadsheet inputs",
        participants: ["u_manager", "fictional_customer"],
        milestoneResults: [{ id: m.id, status: m.status }],
        deliverableResults: [{ id: d.id, versionId: v.id, status: d.status }],
        measurementIds: o.measurements.map((m) => m.id),
        concernIds: [],
        approval,
      }),
    );
    w.continuations.push({
      ...demoBase(`continuation_${s.id}`),
      engagementId: s.id,
      kind: "advisory",
      recommendation: "Consider monthly advisory for input quality and sustained adoption",
      customerNeed: "Remaining spreadsheet standardization",
      evidence: ["mock://file-hub/customer-feedback"],
      obligation: false,
      opportunityReference: "",
    });
    w.completion = seal({
      ...demoBase(`completion_${s.id}`),
      schema: "aurumi.cia.engagement-completion/1" as const,
      engagementId: s.id,
      initiation: w.initiation,
      scopes: w.scopes,
      assignments: w.assignments,
      workstreams: w.workstreams,
      milestones: w.milestones,
      deliverables: w.deliverables,
      outcomes: w.outcomes,
      concerns: w.concerns,
      reviews: w.reviews,
      continuations: w.continuations,
      customerFeedback: o.feedback,
      outstandingResponsibilities: "Customer to standardize the remaining spreadsheet inputs",
      executiveSummary:
        "Reporting review delivered. Preparation time fell from 120 to 80 minutes against a 60-minute target. Partial achievement is recorded honestly.",
      decision: approval,
    });
  }
  // Fresh demonstration data uses /2; restored /1 records are never rewritten.
  w.integrityContract = STRONG_CONTRACT;
  const obligations = sourceObligations(w.initiation);
  w.initiation = strongSeal({
    ...w.initiation,
    schema: "aurumi.cia.engagement-initiation/2" as const,
    obligations,
  });
  w.obligations = obligations;
  w.obligationMappings = obligations.map((o) =>
    strongSeal({
      obligationId: o.id,
      deliverableIds: [`deliverable_${s.id}`],
      milestoneIds: [`milestone_${s.id}`],
      workstreamIds: [streamId],
      reviewIds: [],
      coverage: o.criteria,
      evidence: [approval.evidence],
      approval,
    }),
  );
  w.scopes = w.scopes.map((scope) =>
    strongSeal({
      ...scope,
      schema: "aurumi.cia.engagement-scope/2" as const,
      obligationIds: obligations.map((o) => o.id),
    }),
  );
  const original = w.scopes[0];
  if (!original) throw Error("Missing seeded scope");
  w.authorization = strongSeal({
    ...approval,
    engagementId: w.engagementId,
    organizationId: w.organizationId,
    initiationId: w.initiation.id,
    initiationValue: w.initiation.integrityValue,
    scopeId: original.id,
    scopeValue: original.integrityValue,
    commercialValue: contentValue(original.terms),
    authorizationType: w.initiation.source.kind,
  });
  const lifecycle = [
    "pending_authorization",
    "authorized",
    ...(s.status !== "authorized" ? ["mobilizing", "active"] : []),
    ...(s.status === "completed" ? ["completion_review", "completed"] : []),
  ];
  w.lifecycleHistory = lifecycle.map((to, n) =>
    strongSeal({
      id: `lifecycle_${s.id}_${n}`,
      engagementId: s.id,
      organizationId: w.organizationId,
      from: lifecycle[n - 1] ?? "draft",
      to,
      authorizationValue: n === 0 ? "" : AuthorizationSchema.parse(w.authorization).integrityValue,
      approval,
    }),
  );
  for (const outcome of w.outcomes) {
    outcome.workstreamId = streamId;
    establishOutcomeEvidence(outcome, approval);
    const definition = outcome.evidenceHistory?.definitions[0],
      baseline = outcome.evidenceHistory?.baselines[0];
    if (!definition) throw Error("Missing seeded definition");
    outcome.measurements = outcome.measurements.map((m) => ({
      ...m,
      binding: strongSeal({
        measurementId: m.id,
        organizationId: w.organizationId,
        engagementId: w.engagementId,
        outcomeId: outcome.id,
        definitionId: definition.id,
        definitionValue: definition.integrityValue,
        baselineId: baseline?.id ?? "",
        baselineValue: baseline?.integrityValue ?? "",
        content: measurementContent(m),
        supersedesId: "",
        reason: "",
      }),
    }));
  }
  if (w.completion)
    w.completionRequirements = {
      customerFeedback: w.completion.customerFeedback,
      outstandingResponsibilities: w.completion.outstandingResponsibilities,
    };
  w.reviews = w.reviews.map((r) =>
    strongSeal({
      ...r,
      schema: "aurumi.cia.engagement-review/2" as const,
      outcomeEvidence: structuredClone(w.outcomes),
      binding: strongSeal({
        engagementId: w.engagementId,
        organizationId: w.organizationId,
        state: completionState(w),
        stateValue: contentValue(completionState(w)),
      }),
    }),
  );
  if (w.completion)
    w.completion = strongSeal({
      ...w.completion,
      schema: "aurumi.cia.engagement-completion/2" as const,
      initiation: w.initiation,
      scopes: w.scopes,
      authorization: AuthorizationSchema.parse(w.authorization),
      lifecycleHistory: w.lifecycleHistory,
      obligations: w.obligations,
      obligationMappings: w.obligationMappings,
      changes: w.changes,
      outcomes: w.outcomes,
      reviews: w.reviews,
      ...(w.completionRequirements ? { completionRequirements: w.completionRequirements } : {}),
    });
  deliveryEngagements.push({
    ...demoBase(s.id),
    ownerId: s.id === "delivery_reseller" ? "u_pm" : "u_manager",
    teamId: s.id === "delivery_reseller" ? "team_partners" : "team_advisory",
    assignedUserIds: assignments.map((a) => a.userId),
    proposalId: "",
    title: s.title,
    status: s.status,
    deliverySchema: DELIVERY_SCHEMA,
    initiationId: initiation.id,
  });
  return w;
});

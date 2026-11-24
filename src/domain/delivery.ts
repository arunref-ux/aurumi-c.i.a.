/** Phase 6: explicit operational records; browser-local consistency, never production authentication. */
import { z } from "zod";
import { canonical } from "./assessment";
import { versionIntegrityProblems, type ProposalVersionRecord } from "./proposal";
import type { BaseRecord } from "./types";
import { STRONG_CONTRACT, strongSeal, checkStrong, strictInstant, timestampInstant, metricFor, validateMetric,
  OutcomeEvidenceSchema, MeasurementBindingSchema, VerificationBindingSchema, AuthorizationSchema,
  ObligationSchema, ObligationMappingSchema, ObligationAmendmentSchema, ReviewBindingSchema,
  MetricSchema, type MeasurementDefinition } from "./delivery-evidence";
import { HistoricalRevalidationSchema, LifecycleEventSchema } from "./delivery-evidence";
export { STRONG_CONTRACT, strongSeal, timestampInstant, metricFor, validateMetric } from "./delivery-evidence";

export const DELIVERY_SCHEMA = "aurumi.cia.engagement/1" as const;
export const INTEGRITY_CONTRACT = "aurumi.cia.delivery-content/1" as const;
export const LIFE = [
  "draft",
  "pending_authorization",
  "authorized",
  "mobilizing",
  "active",
  "on_hold",
  "completion_review",
  "completed",
  "cancelled",
] as const;
export const SERVICES = [
  "implementation",
  "adoption_training",
  "integration_advisory",
  "process_improvement",
  "ongoing_advisory",
  "periodic_review",
  "partner_enablement",
  "custom",
] as const;
export const RESPONSIBILITIES = [
  "lead",
  "assessment",
  "implementation",
  "integration",
  "training",
  "advisory",
  "reviewer",
  "support",
] as const;
const id = z.string().trim().min(1);
const text = z.string();
const date = z
  .string()
  .refine(
    (v) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      Number.isFinite(Date.parse(`${v}T00:00:00Z`)) &&
      new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v,
    "Invalid calendar date",
  );
const instant = strictInstant;
const base = {
  id,
  organizationId: id,
  createdAt: instant,
  createdBy: id,
  updatedAt: instant,
  updatedBy: id,
};
type Entity<S extends z.ZodType> = BaseRecord & Omit<z.infer<S>, keyof BaseRecord>;
const evidence = z.array(id);
const sealFields = { integrityContract: z.enum([INTEGRITY_CONTRACT, STRONG_CONTRACT]), integrityValue: id };
export const ApprovalSchema = z.strictObject({
  by: id,
  at: instant,
  evidence: id,
  comment: id,
  simulated: z.boolean(),
});
export type Approval = z.infer<typeof ApprovalSchema>;
export const TermsSchema = z.strictObject({
  included: id,
  excluded: text,
  assumptions: text,
  customerResponsibilities: text,
  professionalResponsibilities: id,
  commercialBasis: id,
  currency: z.string().regex(/^[A-Z]{3}$/),
  amount: z.number().finite().nonnegative().nullable(),
  period: z.enum(["one_time", "monthly", "annual", "service_period"]),
  pricingReference: text,
  start: date,
  end: date,
  cadence: text,
});
export type ServiceTerms = z.infer<typeof TermsSchema>;
export const ScopeSchema = z.strictObject({
  ...base,
  schema: z.enum(["aurumi.cia.engagement-scope/1", "aurumi.cia.engagement-scope/2"]),
  engagementId: id,
  number: z.number().int().positive(),
  terms: TermsSchema,
  changeId: text,
  obligationIds: evidence.optional(),
  approval: ApprovalSchema,
  ...sealFields,
});
export type ScopeVersion = Entity<typeof ScopeSchema>;
export const AssignmentSchema = z.strictObject({
  ...base,
  engagementId: id,
  professionalId: id,
  userId: id,
  responsibility: z.enum(RESPONSIBILITIES),
  workstreamId: text,
  start: date,
  end: date.nullable(),
  status: z.enum(["offered", "active", "ended"]),
  acknowledgedAt: instant.nullable(),
  allocationHours: z.number().finite().nonnegative().max(168),
  qualificationIds: evidence,
  service: z.enum(SERVICES),
  affiliation: z.strictObject({
    id,
    organization: id,
    relationship: z.enum(["employed", "independent", "reseller"]),
    start: date,
    end: date.nullable(),
  }),
});
export type ProfessionalAssignment = Entity<typeof AssignmentSchema>;
export const AffiliationSchema = z.strictObject({
  ...base,
  organization: id,
  relationship: z.enum(["employed", "independent", "reseller"]),
  start: date,
  end: date.nullable(),
  status: z.enum(["pending", "approved", "ended"]),
  approval: ApprovalSchema.nullable(),
});
export const QualificationSchema = z.strictObject({
  ...base,
  professionalId: id,
  name: id,
  issuer: id,
  category: z.enum(["external", "aurumi_authorization", "self_declared"]),
  issueDate: date,
  expiryDate: date.nullable(),
  evidenceReference: text,
  services: z.array(z.enum(SERVICES)),
  status: z.enum(["self_declared", "pending", "verified", "rejected", "revoked"]),
  verification: ApprovalSchema.nullable(),
  notes: text,
});
export type Qualification = Entity<typeof QualificationSchema>;
export const ProfileSchema = z.strictObject({
  ...base,
  userId: id,
  teamId: id,
  displayName: id,
  title: id,
  summary: text,
  country: id,
  region: text,
  timezone: id,
  languages: z.array(id).min(1),
  expertise: evidence,
  status: z.enum(["draft", "pending_review", "active", "suspended", "inactive"]),
  services: z.array(z.enum(SERVICES)),
  affiliations: z.array(AffiliationSchema),
  qualifications: z.array(QualificationSchema),
  availability: z.enum(["available", "limited", "unavailable", "absence"]),
  weeklyCapacity: z.number().finite().nonnegative().max(168).nullable(),
  absenceStart: date.nullable(),
  absenceEnd: date.nullable(),
  statusDecision: ApprovalSchema.nullable(),
});
export type ProfessionalProfile = Entity<typeof ProfileSchema>;
export const ExpertiseSchema = z.strictObject({ ...base, label: id, active: z.boolean() });
export type ExpertiseCategory = Entity<typeof ExpertiseSchema>;
export const WorkstreamSchema = z.strictObject({
  ...base,
  engagementId: id,
  name: id,
  description: text,
  ownerProfessionalId: id,
  start: date,
  end: date,
  dependencies: evidence,
  status: z.enum(["planned", "active", "blocked", "completed", "cancelled"]),
});
export type Workstream = Entity<typeof WorkstreamSchema>;
export const MilestoneSchema = z.strictObject({
  ...base,
  engagementId: id,
  workstreamId: id,
  title: id,
  description: text,
  ownerProfessionalId: id,
  due: date,
  completedAt: instant.nullable(),
  criteria: id,
  deliverableIds: evidence,
  dependencies: evidence,
  required: z.boolean(),
  status: z.enum(["planned", "in_progress", "blocked", "ready", "completed", "cancelled"]),
  evidence,
  exception: ApprovalSchema.nullable(),
});
export type DeliveryMilestone = Entity<typeof MilestoneSchema>;
export const ArtifactSchema = z.strictObject({
  ...base,
  schema: z.literal("aurumi.cia.deliverable-version/1"),
  engagementId: id,
  deliverableId: id,
  number: z.number().int().positive(),
  description: id,
  criteria: id,
  artifactReference: id,
  authorProfessionalId: id,
  submittedAt: instant,
  ...sealFields,
});
export type DeliverableVersion = Entity<typeof ArtifactSchema>;
export const AcceptanceSchema = z.strictObject({
  ...base,
  engagementId: id,
  deliverableId: id,
  versionId: id,
  versionValue: id,
  kind: z.enum([
    "internal_review",
    "internal_approval",
    "customer_acknowledgement",
    "customer_acceptance",
  ]),
  decision: z.enum(["accepted", "changes_requested"]),
  approval: ApprovalSchema,
  ...sealFields,
});
export type DeliverableReview = Entity<typeof AcceptanceSchema>;
export const DeliverableSchema = z.strictObject({
  ...base,
  engagementId: id,
  workstreamId: id,
  ownerProfessionalId: id,
  title: id,
  description: id,
  criteria: id,
  due: date,
  required: z.boolean(),
  independentReview: z.boolean(),
  acceptanceKind: z.enum(["internal_approval", "customer_acceptance"]),
  artifactReference: text,
  status: z.enum([
    "draft",
    "submitted",
    "under_review",
    "changes_requested",
    "accepted",
    "withdrawn",
  ]),
  versions: z.array(ArtifactSchema),
  reviews: z.array(AcceptanceSchema),
});
export type DeliveryDeliverable = Entity<typeof DeliverableSchema>;
export const InteractionSchema = z.strictObject({
  ...base,
  engagementId: id,
  workstreamId: text,
  type: z.enum([
    "discovery",
    "implementation",
    "training",
    "advisory",
    "feedback",
    "review",
    "escalation",
  ]),
  at: instant,
  participants: evidence,
  summary: id,
  decisions: text,
  followUps: text,
  evidence,
  messengerReference: text,
  calendarReference: text,
});
export type Interaction = Entity<typeof InteractionSchema>;
export const RiskSchema = z.strictObject({
  ...base,
  engagementId: id,
  workstreamId: text,
  kind: z.enum(["risk", "issue", "decision", "gap"]),
  description: id,
  category: text,
  likelihood: z.enum(["low", "medium", "high", "unknown"]),
  impact: z.enum(["low", "medium", "high"]),
  ownerProfessionalId: id,
  response: text,
  alternatives: text,
  reviewDate: date,
  status: z.enum(["open", "resolved", "acknowledged"]),
  evidence,
  verification: z.enum(["assumption", "professional_observation", "verified"]),
  acknowledgement: ApprovalSchema.nullable(),
});
export type DeliveryConcern = Entity<typeof RiskSchema>;
export const MeasurementSchema = z.strictObject({
  ...base,
  engagementId: id,
  outcomeId: id,
  observedAt: instant,
  value: z.number().finite().nullable(),
  qualitative: text,
  source: id,
  provenance: z.enum([
    "customer_reported",
    "professional_observation",
    "system_derived",
    "estimate",
  ]),
  evidence,
  verification: ApprovalSchema.nullable(),
  binding: MeasurementBindingSchema.optional(),
  verificationBinding: VerificationBindingSchema.optional(),
});
export type OutcomeMeasurement = Entity<typeof MeasurementSchema>;
export const OutcomeSchema = z.strictObject({
  ...base,
  engagementId: id,
  objective: id,
  definition: id,
  unit: text,
  type: z.enum(["quantitative", "qualitative"]),
  baseline: z.number().finite().nullable(),
  baselineDescription: text,
  baselineEvidence: evidence,
  target: z.number().finite().nullable(),
  targetDescription: text,
  direction: z.enum(["increase", "decrease", "qualitative"]),
  frequency: id,
  ownerProfessionalId: id,
  status: z.enum([
    "proposed",
    "baseline_pending",
    "baseline_established",
    "in_progress",
    "achieved",
    "partially_achieved",
    "not_achieved",
    "not_measurable",
    "discontinued",
  ]),
  feedback: text,
  measurements: z.array(MeasurementSchema),
  workstreamId: text.optional(),
  measurementDefinition: MetricSchema.optional(),
  evidenceHistory: OutcomeEvidenceSchema.optional(),
});
export type DeliveryOutcome = Entity<typeof OutcomeSchema>;
export const ChangeSchema = z.strictObject({
  ...base,
  engagementId: id,
  sourceScopeId: id,
  requested: id,
  reason: id,
  impact: id,
  scheduleImpact: text,
  commercialImpact: text,
  terms: TermsSchema,
  revisedProposalVersionId: text,
  revisedProposal: z.unknown().nullable(),
  approvedValue: text,
  status: z.enum(["draft", "submitted", "approved", "rejected", "withdrawn", "applied"]),
  approval: ApprovalSchema.nullable(),
  scopeVersionId: text,
  obligationAmendments: z.array(ObligationAmendmentSchema).optional(),
});
export type ScopeChange = Entity<typeof ChangeSchema>;
export const ReviewSchema = z.strictObject({
  ...base,
  schema: z.enum(["aurumi.cia.engagement-review/1", "aurumi.cia.engagement-review/2"]),
  engagementId: id,
  kind: z.enum(["mobilization", "weekly", "monthly", "quarterly", "completion", "custom"]),
  scheduledAt: instant,
  calendarReference: text,
  summary: id,
  customerFeedback: text,
  nextActions: text,
  participants: evidence,
  milestoneResults: z.array(z.strictObject({ id, status: text })),
  deliverableResults: z.array(z.strictObject({ id, versionId: text, status: text })),
  measurementIds: evidence,
  binding: ReviewBindingSchema.optional(),
  outcomeEvidence: z.array(OutcomeSchema).optional(),
  concernIds: evidence,
  approval: ApprovalSchema,
  ...sealFields,
});
export type DeliveryReview = Entity<typeof ReviewSchema>;
export const ContinuationSchema = z.strictObject({
  ...base,
  engagementId: id,
  kind: z.enum(["renewal", "expansion", "training", "advisory", "integration"]),
  recommendation: id,
  customerNeed: id,
  evidence,
  obligation: z.literal(false),
  opportunityReference: text,
});
export type Continuation = Entity<typeof ContinuationSchema>;
export const OperationSchema = z.strictObject({
  ...base,
  kind: z.enum(["create", "task", "continuation", "demand"]),
  key: id,
  sourceValue: id,
  engagementId: id,
  actorId: id,
  state: z.enum(["pending", "external_created", "complete"]),
  targetId: text,
  payload: z.record(z.string(), z.unknown()),
  reference: text,
});
export type DeliveryOperation = Entity<typeof OperationSchema>;
export const TaskSchema = z.strictObject({
  ...base,
  engagementId: id,
  workstreamId: id,
  milestoneId: text,
  operationId: id,
  reference: id,
  title: id,
  status: z.enum(["open", "completed"]),
  evidence,
  simulated: z.literal(true),
});
export type TaskReference = Entity<typeof TaskSchema>;
export const SourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("proposal"),
    proposalId: id,
    versionId: id,
    versionNumber: z.number().int().positive(),
    version: z.unknown(),
    allocation: id,
  }),
  z.strictObject({ kind: z.literal("direct"), customerReference: id }),
  z.strictObject({
    kind: z.literal("follow_on"),
    previousEngagementId: id,
    previousInitiationValue: id,
    customerReference: id,
    historicalReview: HistoricalRevalidationSchema.optional(),
    historicalSource: z.unknown().optional(),
  }),
]);
export const InitiationSchema = z.strictObject({
  ...base,
  schema: z.enum(["aurumi.cia.engagement-initiation/1", "aurumi.cia.engagement-initiation/2"]),
  engagementId: id,
  customer: z.strictObject({
    reference: id,
    name: id,
    kind: z.enum(["customer", "partner"]),
    partnerAffiliationId: text,
  }),
  serviceCategories: z.array(z.enum(SERVICES)).min(1),
  source: SourceSchema,
  terms: TermsSchema,
  deliverables: z.array(z.strictObject({ title: id, criteria: id })),
  authorizingEvidence: id,
  obligations: z.array(ObligationSchema).optional(),
  ...sealFields,
});
export type Initiation = Entity<typeof InitiationSchema>;
export const CompletionSchema = z.strictObject({
  ...base,
  schema: z.enum(["aurumi.cia.engagement-completion/1", "aurumi.cia.engagement-completion/2"]),
  engagementId: id,
  initiation: InitiationSchema,
  scopes: z.array(ScopeSchema),
  assignments: z.array(AssignmentSchema),
  workstreams: z.array(WorkstreamSchema),
  milestones: z.array(MilestoneSchema),
  deliverables: z.array(DeliverableSchema),
  outcomes: z.array(OutcomeSchema),
  concerns: z.array(RiskSchema),
  reviews: z.array(ReviewSchema),
  continuations: z.array(ContinuationSchema),
  customerFeedback: text,
  outstandingResponsibilities: id,
  executiveSummary: id,
  decision: ApprovalSchema,
  authorization: AuthorizationSchema.optional(),
  lifecycleHistory: z.array(LifecycleEventSchema).optional(),
  obligations: z.array(ObligationSchema).optional(),
  obligationMappings: z.array(ObligationMappingSchema).optional(),
  changes: z.array(ChangeSchema).optional(),
  completionRequirements: z.strictObject({ customerFeedback: text, outstandingResponsibilities: id }).optional(),
  ...sealFields,
});
export type Completion = Entity<typeof CompletionSchema>;
export const WorkspaceSchema = z.strictObject({
  ...base,
  engagementId: id,
  initiation: InitiationSchema,
  authorization: z.union([ApprovalSchema, AuthorizationSchema]).nullable(),
  scopes: z.array(ScopeSchema).min(1),
  assignments: z.array(AssignmentSchema),
  workstreams: z.array(WorkstreamSchema),
  milestones: z.array(MilestoneSchema),
  tasks: z.array(TaskSchema),
  interactions: z.array(InteractionSchema),
  deliverables: z.array(DeliverableSchema),
  changes: z.array(ChangeSchema),
  concerns: z.array(RiskSchema),
  outcomes: z.array(OutcomeSchema),
  reviews: z.array(ReviewSchema),
  continuations: z.array(ContinuationSchema),
  holdReason: text,
  holdBy: text,
  completion: CompletionSchema.nullable(),
  cancellation: ApprovalSchema.nullable(),
  historicalRevalidation: HistoricalRevalidationSchema.optional(),
  lifecycleHistory: z.array(LifecycleEventSchema).optional(),
  integrityContract: z.literal(STRONG_CONTRACT).optional(),
  obligations: z.array(ObligationSchema).optional(),
  obligationMappings: z.array(ObligationMappingSchema).optional(),
  completionRequirements: z.strictObject({ customerFeedback: text, outstandingResponsibilities: id }).optional(),
});
export type DeliveryWorkspace = Entity<typeof WorkspaceSchema>;
export const EngagementSchema = z.strictObject({
  ...base,
  ownerId: id,
  teamId: id,
  assignedUserIds: evidence,
  proposalId: text,
  title: id,
  status: z.enum(LIFE),
  deliverySchema: z.literal(DELIVERY_SCHEMA),
  initiationId: id,
  tenantSuccessReferenceId: text.optional(),
});

/** Canonical coverage: every field except integrityValue, including audit identity, schema and embedded source. */
export function contentValue(value: unknown): string {
  const s = canonical(value);
  let a = 2166136261,
    b = 2246822519;
  for (let i = 0; i < s.length; i++) {
    a = Math.imul(a ^ s.charCodeAt(i), 16777619);
    b = Math.imul(b ^ s.charCodeAt(i), 3266489917);
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}
export function sealedValue(value: { integrityValue: string }): string {
  const { integrityValue: _ignored, ...body } = value;
  return contentValue(body);
}
export function seal<T extends object>(
  value: T,
): T & { integrityContract: typeof INTEGRITY_CONTRACT; integrityValue: string } {
  const body = { ...structuredClone(value), integrityContract: INTEGRITY_CONTRACT };
  return { ...body, integrityValue: contentValue(body) };
}
export function checkSeal(value: { integrityContract: string; integrityValue: string }): void {
  if (![INTEGRITY_CONTRACT, STRONG_CONTRACT].includes(value.integrityContract as typeof INTEGRITY_CONTRACT) || sealedValue(value) !== value.integrityValue)
    throw Error("Unsupported or altered immutable delivery record");
}
export function changeValue(c: ScopeChange): string {
  const {
    status: _status,
    approval: _approval,
    approvedValue: _value,
    scopeVersionId: _scope,
    updatedAt: _at,
    updatedBy: _by,
    ...body
  } = c;
  return contentValue(body);
}
export const today = () => new Date().toISOString().slice(0, 10);
export function validQualification(q: Qualification, service: string, on = today()): boolean {
  return (
    q.category !== "self_declared" &&
    q.status === "verified" &&
    q.verification !== null &&
    !!q.evidenceReference &&
    q.issueDate <= on &&
    (!q.expiryDate || q.expiryDate >= on) &&
    q.services.includes(service as (typeof SERVICES)[number])
  );
}
export function currentAffiliation(p: ProfessionalProfile, on = today()) {
  return p.affiliations.find(
    (a) => a.status === "approved" && a.approval && a.start <= on && (!a.end || a.end >= on),
  );
}
export function hasCycle(rows: readonly { id: string; dependencies: string[] }[]): boolean {
  const visiting = new Set<string>(),
    done = new Set<string>();
  const walk = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (done.has(id)) return false;
    visiting.add(id);
    const r = rows.find((x) => x.id === id);
    if (r?.dependencies.some(walk)) return true;
    visiting.delete(id);
    done.add(id);
    return false;
  };
  return rows.some((r) => walk(r.id));
}
export function acceptedVersion(d: DeliveryDeliverable): DeliverableVersion | undefined {
  const v = d.versions.at(-1);
  return d.status === "accepted" &&
    v &&
    d.reviews.some(
      (r) =>
        r.versionId === v.id &&
        r.versionValue === v.integrityValue &&
        r.kind === d.acceptanceKind &&
        r.decision === "accepted",
    )
    ? v
    : undefined;
}
export function improvement(o: DeliveryOutcome, value: number | null): number | null {
  if (
    o.type !== "quantitative" ||
    o.baseline === null ||
    o.baseline <= 0 ||
    value === null ||
    !Number.isFinite(value) ||
    !o.definition ||
    metricFor(o, o.measurementDefinition).comparison !== "relative" ||
    o.direction === "qualitative"
  )
    return null;
  try { validateMetric(metricFor(o, o.measurementDefinition), value); } catch { return null; }
  return (
    ((o.direction === "decrease" ? o.baseline - value : value - o.baseline) / o.baseline) * 100
  );
}
export function completionProblems(w: DeliveryWorkspace): string[] {
  const p: string[] = [];
  if (w.milestones.some((m) => m.required && m.status !== "completed" && !m.exception))
    p.push("Required milestones remain incomplete");
  if (w.deliverables.some((d) => d.required && !acceptedVersion(d)))
    p.push("Required deliverables are not accepted");
  if (
    w.concerns.some(
      (r) =>
        r.kind === "issue" &&
        r.impact === "high" &&
        r.status !== "resolved" &&
        !(r.status === "acknowledged" && r.acknowledgement),
    )
  )
    p.push("Material issues need resolution or authorized acknowledgement");
  if (
    w.outcomes.some((o) =>
      ["proposed", "baseline_pending", "baseline_established", "in_progress"].includes(o.status),
    )
  )
    p.push("Record actual outcome results or limitations");
  if (!w.reviews.some((r) => r.kind === "completion")) p.push("Completion review is required");
  if (w.integrityContract === STRONG_CONTRACT) {
    try { validateAuthorization(w); } catch (e) { p.push(e instanceof Error ? e.message : "Invalid commencement authorization"); }
    for (const obligation of obligationStates(w)) if (obligation.required && !["satisfied", "removed_by_amendment", "superseded_by_amendment"].includes(obligation.status)) p.push(`Required obligation ${obligation.description}: ${obligation.status}`);
    const review = w.reviews.filter((r) => r.kind === "completion").at(-1);
    if (!review?.binding || review.binding.stateValue !== contentValue(completionState(w))) p.push("Completion review is stale; review the current material state");
  }
  return p;
}
const unique = (rows: readonly { id: string }[]) => {
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    throw Error("Duplicate delivery identity");
};
/** Whole workspace relationship validation; no re-signing or repair of immutable records. */
export function workspaceProblems(raw: unknown): string[] {
  try {
    const w = WorkspaceSchema.parse(raw);
    if(w.authorization === null && (w.reviews.length || w.deliverables.some((d) => d.versions.length) || w.completion)) throw Error("Commenced delivery evidence lacks original authorization");
    checkSeal(w.initiation);
    if(w.historicalRevalidation) {
      checkStrong(w.historicalRevalidation);
      if(w.historicalRevalidation.engagementId!==w.engagementId || w.historicalRevalidation.organizationId!==w.organizationId || w.historicalRevalidation.initiationValue!==w.initiation.integrityValue) throw Error("Historical revalidation source changed");
    }
    const strengthened = w.integrityContract === STRONG_CONTRACT;
    if (!strengthened && (w.initiation.integrityContract === STRONG_CONTRACT || w.obligations || w.obligationMappings)) throw Error("Stripped strengthened workspace contract");
    if (strengthened) validateStrengthened(w);
    if (
      w.initiation.engagementId !== w.engagementId ||
      w.initiation.id !== `init_${w.engagementId}`
    )
      throw Error("Initiation identity mismatch");
    if (w.initiation.source.kind === "proposal") {
      const v = w.initiation.source.version as ProposalVersionRecord;
      const source = w.initiation.source;
      if (
        versionIntegrityProblems(v).length ||
        !v.issue ||
        v.review?.decision !== "approved" ||
        v.id !== source.versionId ||
        v.proposalId !== source.proposalId ||
        v.versionNumber !== source.versionNumber ||
        v.organizationId !== w.organizationId
      )
        throw Error("Invalid embedded issued proposal");
    }
    if(w.initiation.source.kind==="follow_on" && w.initiation.source.historicalReview) {
      const source=w.initiation.source, review=source.historicalReview;
      const historical=WorkspaceSchema.parse(source.historicalSource); checkStrong(review);
      if(workspaceProblems(historical).length || review.engagementId!==source.previousEngagementId || historical.engagementId!==source.previousEngagementId || historical.initiation.integrityValue!==source.previousInitiationValue || historical.organizationId!==w.organizationId || review.sourceValue!==historicalSourceValue(historical)) throw Error("Pinned historical revalidation source is inconsistent");
    }
    if (w.initiation.terms.end < w.initiation.terms.start) throw Error("Invalid service period");
    if (
      w.initiation.organizationId !== w.organizationId ||
      (w.initiation.source.kind !== "proposal" &&
        w.initiation.source.customerReference !== w.initiation.customer.reference)
    )
      throw Error("Initiation customer or organization mismatch");
    for (const list of [
      w.scopes,
      w.assignments,
      w.workstreams,
      w.milestones,
      w.tasks,
      w.interactions,
      w.deliverables,
      w.changes,
      w.concerns,
      w.outcomes,
      w.reviews,
      w.continuations,
    ]) {
      unique(list);
      for (const r of list)
        if (r.organizationId !== w.organizationId || r.engagementId !== w.engagementId)
          throw Error("Child engagement or organization mismatch");
    }
    if (
      w.assignments.filter((a) => a.status === "active" && a.responsibility === "lead").length > 1
    )
      throw Error("Multiple accountable leads");
    for (const s of w.scopes) {
      checkSeal(s);
      if (s.number !== w.scopes.indexOf(s) + 1 || s.terms.end < s.terms.start)
        throw Error("Invalid scope sequence");
    }
    if (canonical(w.scopes[0]?.terms) !== canonical(w.initiation.terms))
      throw Error("Original scope was rewritten");
    const streams = new Set(w.workstreams.map((s) => s.id)),
      milestones = new Set(w.milestones.map((s) => s.id)),
      deliverables = new Set(w.deliverables.map((s) => s.id));
    const professionals = new Set(w.assignments.map((a) => a.professionalId));
    for (const a of w.assignments)
      if ((a.end && a.end < a.start) || (a.workstreamId && !streams.has(a.workstreamId)))
        throw Error("Assignment workstream or period mismatch");
    for (const r of [
      ...w.workstreams,
      ...w.milestones,
      ...w.deliverables,
      ...w.concerns,
      ...w.outcomes,
    ])
      if (!professionals.has(r.ownerProfessionalId))
        throw Error("Responsible professional is not part of the engagement");
    for (const r of [...w.interactions, ...w.concerns])
      if (r.workstreamId && !streams.has(r.workstreamId))
        throw Error("Operational workstream reference mismatch");
    for (const s of w.workstreams)
      if (s.dependencies.some((id) => !streams.has(id)) || s.end < s.start)
        throw Error("Unresolved workstream dependency");
    if (hasCycle(w.workstreams) || hasCycle(w.milestones))
      throw Error("Circular execution dependencies");
    for (const m of w.milestones) {
      if (
        !streams.has(m.workstreamId) ||
        m.dependencies.some((id) => !milestones.has(id)) ||
        m.deliverableIds.some((id) => !deliverables.has(id))
      )
        throw Error("Invalid milestone references");
      if (
        m.status === "completed" &&
        !m.exception &&
        (m.deliverableIds.some(
          (id) => !acceptedVersion(w.deliverables.find((d) => d.id === id) as DeliveryDeliverable),
        ) ||
          m.dependencies.some(
            (id) => w.milestones.find((d) => d.id === id)?.status !== "completed",
          ))
      )
        throw Error("Milestone lacks accepted prerequisites");
    }
    for (const d of w.deliverables) {
      if (!streams.has(d.workstreamId)) throw Error("Invalid deliverable workstream");
      unique(d.versions);
      unique(d.reviews);
      for (const v of d.versions) {
        checkSeal(v);
        if (
          v.deliverableId !== d.id ||
          v.engagementId !== w.engagementId ||
          v.organizationId !== w.organizationId ||
          v.number !== d.versions.indexOf(v) + 1
        )
          throw Error("Invalid deliverable version");
      }
      for (const r of d.reviews) {
        checkSeal(r);
        const v = d.versions.find((v) => v.id === r.versionId);
        if (
          !v ||
          r.deliverableId !== d.id ||
          r.versionValue !== v.integrityValue ||
          r.organizationId !== w.organizationId ||
          r.engagementId !== w.engagementId
        )
          throw Error("Acceptance version mismatch");
        if (d.independentReview && r.approval.by === v.createdBy)
          throw Error("Independent reviewer required");
      }
      if (d.status === "accepted" && !acceptedVersion(d))
        throw Error("Accepted deliverable lacks exact version acceptance");
    }
    const measurementIds = new Set<string>();
    for (const o of w.outcomes) {
      const metric = metricFor(o, o.measurementDefinition, !strengthened);
      validateMetric(metric, o.baseline); validateMetric(metric, o.target);
      unique(o.measurements);
      for (const m of o.measurements) {
        validateMetric(metric, m.value, metric.unit, o.type === "quantitative");
        if (timestampInstant(m.observedAt) > Date.now()) throw Error("Future observed measurement");
        if (
          m.outcomeId !== o.id ||
          m.engagementId !== w.engagementId ||
          m.organizationId !== w.organizationId
        )
          throw Error("Outcome measurement reference mismatch");
        if (
          measurementIds.has(m.id) ||
          (m.verification &&
            (!m.evidence.length ||
              m.provenance === "estimate" ||
              m.verification.by === m.createdBy))
        )
          throw Error("Invalid independent measurement verification or identity");
        measurementIds.add(m.id);
      }
      if (o.status === "achieved") {
        const m = o.measurements.at(-1);
        if (
          !m || (strengthened && m.binding?.definitionId!==o.evidenceHistory?.currentDefinitionId) ||
          m.provenance === "estimate" ||
          !m.evidence.length ||
          (o.type === "quantitative" &&
            (m.value === null ||
              o.target === null ||
              (o.direction === "decrease" ? m.value > o.target : m.value < o.target)))
        )
          throw Error("Achievement is unsupported by observed evidence");
      }
    }
    for (const r of w.reviews) {
      checkSeal(r);
      if (
        r.measurementIds.some((id) => !measurementIds.has(id)) ||
        r.milestoneResults.some((m) => !milestones.has(m.id)) ||
        r.deliverableResults.some(
          (d) =>
            !deliverables.has(d.id) ||
            (d.versionId &&
              !w.deliverables.some((item) => item.versions.some((v) => v.id === d.versionId))),
        ) ||
        r.concernIds.some((id) => !w.concerns.some((c) => c.id === id))
      )
        throw Error("Review references unavailable records");
    }
    for (const c of w.changes) {
      if (
        !w.scopes.some((s) => s.id === c.sourceScopeId) ||
        (["approved", "applied"].includes(c.status) &&
          (!c.approval || c.approval.by === c.createdBy || c.approvedValue !== changeValue(c))) ||
        (c.status === "applied" &&
          !w.scopes.some(
            (s) =>
              s.id === c.scopeVersionId &&
              s.changeId === c.id &&
              canonical(s.terms) === canonical(c.terms),
          ))
      )
        throw Error("Scope amendment reference mismatch");
      if (c.revisedProposal !== null) {
        const v = c.revisedProposal as ProposalVersionRecord;
        if (
          versionIntegrityProblems(v).length ||
          v.id !== c.revisedProposalVersionId ||
          v.organizationId !== w.organizationId ||
          !v.issue
        )
          throw Error("Revised proposal source mismatch");
      }
    }
    for (const t of w.tasks)
      if (!streams.has(t.workstreamId) || (t.milestoneId && !milestones.has(t.milestoneId)))
        throw Error("Invalid task reference");
    if (w.completion) {
      if (completionProblems(w).length)
        throw Error("Completed engagement has incomplete delivery obligations");
      checkSeal(w.completion);
      if (strengthened && (w.completion.integrityContract !== STRONG_CONTRACT || canonical(w.completion.authorization) !== canonical(w.authorization) || canonical(w.completion.lifecycleHistory) !== canonical(w.lifecycleHistory) || canonical(w.completion.obligations) !== canonical(w.obligations) || canonical(w.completion.obligationMappings) !== canonical(w.obligationMappings) || canonical(w.completion.changes) !== canonical(w.changes) || canonical(w.completion.completionRequirements) !== canonical(w.completionRequirements))) throw Error("Completion authorization or obligation content mismatch");
      if (
        w.completion.engagementId !== w.engagementId ||
        w.completion.organizationId !== w.organizationId ||
        canonical(w.completion.initiation) !== canonical(w.initiation)
      )
        throw Error("Completion identity mismatch");
      const c = w.completion;
      for (const key of [
        "scopes",
        "assignments",
        "workstreams",
        "milestones",
        "deliverables",
        "outcomes",
        "concerns",
        "reviews",
        "continuations",
      ] as const)
        if (canonical(c[key]) !== canonical(w[key])) throw Error("Completion content changed");
    }
    return [];
  } catch (e) {
    return [e instanceof Error ? e.message : "Invalid delivery workspace"];
  }
}

export function proposalScopeTerms(v: ProposalVersionRecord) {
  const section = (key: string) => v.document.sections.find((s) => s.key === key)?.body ?? "";
  return {
    included: section("scope") || v.document.deliverables.filter((d) => d.inclusion === "included").map((d) => d.description).join("\n"),
    excluded: v.document.deliverables.filter((d) => d.inclusion === "excluded").map((d) => d.description).join("\n"),
    assumptions: section("assumptions"),
    customerResponsibilities: section("responsibilities"),
    professionalResponsibilities: section("implementation") || section("responsibilities"),
  };
}
export function sourceObligations(i: Pick<Initiation, "id" | "organizationId" | "engagementId" | "source" | "terms" | "deliverables">) {
  const sourceValue = contentValue(i.source.kind === "proposal" ? i.source : { source: i.source, terms: i.terms, deliverables: i.deliverables });
  const version = i.source.kind === "proposal" ? i.source.version as ProposalVersionRecord : null;
  const rows = version ? version.document.deliverables.filter((d) => d.inclusion !== "excluded").map((d) => ({ reference: d.id, description: d.description, criteria: d.acceptanceCriterion, required: d.inclusion === "included", acceptance: "customer_acceptance" as const })) : i.deliverables.length ? i.deliverables.map((d, n) => ({ reference: `deliverable:${n}`, description: d.title, criteria: d.criteria, required: true, acceptance: "customer_acceptance" as const })) : [{ reference: "service-commitment", description: i.terms.included, criteria: i.terms.professionalResponsibilities, required: true, acceptance: "review_evidence" as const }];
  return rows.map((r) => strongSeal({ id: `obligation_${i.engagementId}_${contentValue(r.reference)}`, organizationId: i.organizationId, engagementId: i.engagementId, sourceId: version?.id ?? i.id, sourceValue, sourceReference: r.reference, description: r.description, criteria: r.criteria, required: r.required, acceptance: r.acceptance, amendmentId: "", replacesId: "" }));
}
export function obligationStates(w: DeliveryWorkspace) {
  return (w.obligations ?? sourceObligations(w.initiation)).map((o) => {
    const amendment = w.changes.find((c) => c.status === "applied" && c.obligationAmendments?.some((a) => a.obligationId === o.id));
    const action = amendment?.obligationAmendments?.find((a) => a.obligationId === o.id)?.action;
    const mapping = w.obligationMappings?.find((m) => m.obligationId === o.id);
    let status = action === "remove" ? "removed_by_amendment" : action === "supersede" ? "superseded_by_amendment" : "unmapped";
    if (!action && mapping) {
      status = "mapped";
      if (o.acceptance === "review_evidence") {
        if (mapping.reviewIds.length && mapping.reviewIds.every((id) => w.reviews.some((r) => r.id === id && r.kind !== "completion" && r.approval.evidence))) status = "satisfied";
      } else if (mapping.deliverableIds.length) {
        const ds = mapping.deliverableIds.map((id) => w.deliverables.find((d) => d.id === id));
        status = ds.every((d) => d && acceptedVersion(d)?.criteria.includes(o.criteria) && mapping.coverage === o.criteria && d.acceptanceKind === o.acceptance) ? "satisfied" : ds.some((d) => d && d.versions.length) ? "awaiting_acceptance" : "in_progress";
      }
    }
    return { ...o, status, mapping, amendmentId: amendment?.id ?? o.amendmentId };
  });
}
export function validateAuthorization(w: DeliveryWorkspace) {
  if (!w.authorization) throw Error("Explicit commencement authorization is required");
  if (w.integrityContract !== STRONG_CONTRACT) return;
  const a = AuthorizationSchema.parse(w.authorization); checkStrong(a);
  const original = w.scopes[0];
  if (!original || a.engagementId !== w.engagementId || a.organizationId !== w.organizationId || a.initiationId !== w.initiation.id || a.initiationValue !== w.initiation.integrityValue || a.scopeId !== original.id || a.scopeValue !== original.integrityValue || a.commercialValue !== contentValue(original.terms) || a.authorizationType !== w.initiation.source.kind) throw Error("Commencement authorization does not match original source and scope");
}
export function lifecycleAuthorizationProblems(status: string, w: DeliveryWorkspace): string[] {
  if(w.integrityContract===STRONG_CONTRACT && (w.lifecycleHistory?.at(-1)?.to ?? "draft")!==status) return ["Lifecycle history does not match the engagement state"];
  if (["authorized", "mobilizing", "active", "on_hold", "completion_review", "completed"].includes(status) || (status === "cancelled" && (w.authorization || w.reviews.length || w.deliverables.some((d) => d.versions.length)))) {
    try { validateAuthorization(w); } catch (e) { return [e instanceof Error ? e.message : "Invalid commencement authorization"]; }
  }
  return [];
}
/** Presentation and assignment acknowledgement metadata are excluded. Scope, acceptance, all outcome evidence,
 * concerns and completion responsibilities are material; previous reviews remain immutable when stale. */
export function completionState(w: DeliveryWorkspace): Record<string, unknown> {
  const operational = <T extends { updatedAt: string; updatedBy: string }>(rows: T[]) => rows.map(({ updatedAt: _at, updatedBy: _by, ...r }) => r);
  return { engagementId: w.engagementId, organizationId: w.organizationId, authorization: w.authorization, scopes: w.scopes, obligations: obligationStates(w).map(({ mapping: _mapping, ...o }) => o), mappings: w.obligationMappings ?? [], milestones: operational(w.milestones.filter((m) => m.required)), deliverables: operational(w.deliverables.filter((d) => d.required || w.obligationMappings?.some((m) => m.deliverableIds.includes(d.id)))), outcomes: operational(w.outcomes), concerns: operational(w.concerns), requirements: w.completionRequirements ?? null };
}
export function measurementContent(m: OutcomeMeasurement): Record<string, unknown> {
  const { binding: _binding, verification: _verification, verificationBinding: _vb, updatedAt: _at, updatedBy: _by, ...content } = m;
  return content;
}
export function measurementChange(o: DeliveryOutcome, m: OutcomeMeasurement): { value:number; kind:MeasurementDefinition["comparison"]; unit:string } | null {
  const definition=o.evidenceHistory?.definitions.find((d) => d.id===m.binding?.definitionId), baseline=o.evidenceHistory?.baselines.find((b) => b.id===m.binding?.baselineId);
  if(!definition || !baseline || baseline.value===null || m.value===null) return null;
  const metric=definition.metric;
  try { validateMetric(metric,baseline.value,baseline.unit); validateMetric(metric,m.value); } catch { return null; }
  if(metric.kind==="qualitative" || metric.comparison==="qualitative") return null;
  const difference=metric.direction==="decrease" ? baseline.value-m.value : m.value-baseline.value;
  if(metric.comparison==="relative") {
    if(baseline.value<=0 || ["signed","currency"].includes(metric.kind)) return null;
    return {value:difference/baseline.value*100,kind:"relative",unit:"%"};
  }
  return {value:difference,kind:metric.comparison,unit:metric.comparison==="percentage_points"?"percentage points":metric.unit};
}
export function historicalSourceValue(w: DeliveryWorkspace) {
  const { historicalRevalidation:_review, updatedAt:_at, updatedBy:_by, ...content }=w;
  return contentValue(content);
}
export function historicalObligationProblems(w: DeliveryWorkspace) {
  return sourceObligations(w.initiation).filter((o) => o.required && !w.deliverables.some((d) => d.acceptanceKind===o.acceptance && acceptedVersion(d)?.criteria.includes(o.criteria))).map((o) => `Historical obligation lacks applicable acceptance evidence: ${o.description}`);
}
export function establishOutcomeEvidence(o: DeliveryOutcome, approval: Approval, reason = "Initial authorized outcome definition") {
  const prior = o.evidenceHistory;
  const number = (prior?.definitions.length ?? 0) + 1;
  const definitionId = `definition_${o.id}_${number}`;
  const baselineId = o.baseline !== null || o.baselineDescription ? `baseline_${o.id}_${(prior?.baselines.length ?? 0) + 1}` : "";
  const metric = metricFor(o, o.measurementDefinition);
  validateMetric(metric, o.baseline); validateMetric(metric, o.target);
  const identity = { organizationId:o.organizationId, engagementId:o.engagementId, outcomeId:o.id, createdAt:approval.at, createdBy:approval.by };
  const definition = strongSeal({ ...identity, id:definitionId, number, metric, objective:o.objective, definition:o.definition, target:o.target, targetDescription:o.targetDescription, frequency:o.frequency, baselineId, previousId:prior?.currentDefinitionId ?? "", reason });
  const baseline = baselineId ? strongSeal({ ...identity, id:baselineId, number:(prior?.baselines.length ?? 0)+1, definitionId, value:o.baseline, unit:o.unit, description:o.baselineDescription, observedAt:approval.at, source:o.baselineDescription || "Established baseline", evidence:o.baselineEvidence, previousId:prior?.currentBaselineId ?? "", reason, approval }) : null;
  o.measurementDefinition=metric;
  o.evidenceHistory = OutcomeEvidenceSchema.parse({ definitions:[...(prior?.definitions ?? []),definition], baselines:[...(prior?.baselines ?? []),...(baseline ? [baseline] : [])], currentDefinitionId:definitionId, currentBaselineId:baselineId });
}
function validateStrengthened(w: DeliveryWorkspace) {
  if (w.initiation.integrityContract !== STRONG_CONTRACT || w.initiation.schema !== "aurumi.cia.engagement-initiation/2" || !w.obligations || !w.obligationMappings || !w.initiation.obligations) throw Error("Missing strengthened authorized obligations");
  if (canonical(w.initiation.obligations) !== canonical(sourceObligations(w.initiation))) throw Error("Authorized source obligations were substituted");
  unique(w.obligations);
  for (const original of w.initiation.obligations) if (!w.obligations.some((o) => canonical(o) === canonical(original))) throw Error("Original obligation history was removed");
  for (const o of w.obligations) {
    checkStrong(o);
    if (o.engagementId !== w.engagementId || o.organizationId !== w.organizationId) throw Error("Obligation source identity mismatch");
    if (o.amendmentId) {
      const c = w.changes.find((c) => c.id === o.amendmentId && c.status === "applied");
      const a = c?.obligationAmendments?.find((a) => a.obligationId === o.replacesId && a.action === "supersede");
      if (!c?.approval || !a || a.description !== o.description || a.criteria !== o.criteria || !w.obligations.some((p) => p.id === o.replacesId)) throw Error("Revised obligation lacks applicable authorized amendment");
    } else if (!w.initiation.obligations.some((r) => canonical(r) === canonical(o))) throw Error("Unauthorized added obligation");
  }
  const active = obligationStates(w).filter((o) => !["removed_by_amendment", "superseded_by_amendment"].includes(o.status)).map((o) => o.id).sort();
  if (canonical(w.scopes.at(-1)?.obligationIds?.slice().sort()) !== canonical(active)) throw Error("Effective scope obligation register mismatch");
  const mapped = new Set<string>();
  for (const m of w.obligationMappings) {
    checkStrong(m);
    const o = w.obligations.find((o) => o.id === m.obligationId);
    if (!o || mapped.has(o.id) || m.deliverableIds.some((id) => !w.deliverables.some((d) => d.id === id)) || m.milestoneIds.some((id) => !w.milestones.some((d) => d.id === id)) || m.workstreamIds.some((id) => !w.workstreams.some((d) => d.id === id)) || m.reviewIds.some((id) => !w.reviews.some((d) => d.id === id))) throw Error("Obligation mapping references unavailable delivery evidence");
    mapped.add(o.id);
  }
  for (const c of w.changes) {
    const seen = new Set<string>();
    for (const a of c.obligationAmendments ?? []) {
      if (seen.has(a.obligationId) || !w.obligations.some((o) => o.id === a.obligationId) || (a.action === "supersede" && (!a.description.trim() || !a.criteria.trim()))) throw Error("Amendment obligation reference mismatch");
      seen.add(a.obligationId);
    }
  }
  if (w.authorization) validateAuthorization(w);
  if(!w.lifecycleHistory) throw Error("Missing commencement lifecycle history");
  let state="draft",commenced=false;
  unique(w.lifecycleHistory);
  for(const event of w.lifecycleHistory) {
    checkStrong(event);
    if(event.engagementId!==w.engagementId || event.organizationId!==w.organizationId || event.from!==state) throw Error("Lifecycle authorization history mismatch");
    if(event.to==="authorized") commenced=true;
    if(commenced) {
      validateAuthorization(w);
      const authorization=AuthorizationSchema.parse(w.authorization);
      if(event.authorizationValue!==authorization.integrityValue) throw Error("Lifecycle commencement authorization changed");
    } else if(event.authorizationValue) throw Error("Unauthorized commencement history");
    state=event.to;
  }
  for (const o of w.outcomes) {
    const history = o.evidenceHistory;
    if (!history || !o.measurementDefinition || o.workstreamId === undefined) throw Error("Outcome lacks versioned definition or operational scope");
    unique(history.definitions); unique(history.baselines);
    const d = history.definitions.find((d) => d.id === history.currentDefinitionId), b = history.baselines.find((b) => b.id === history.currentBaselineId);
    if (!d || canonical(d.metric) !== canonical(o.measurementDefinition) || d.objective !== o.objective || d.definition !== o.definition || d.target !== o.target || d.targetDescription !== o.targetDescription || d.frequency !== o.frequency || (b?.value ?? null) !== o.baseline || (b?.description ?? "") !== o.baselineDescription || canonical(b?.evidence ?? []) !== canonical(o.baselineEvidence) || d.baselineId !== history.currentBaselineId) throw Error("Outcome definition or baseline content changed");
    for (const def of history.definitions) {
      checkStrong(def); metricFor({type: def.metric.kind === "qualitative" ? "qualitative" : "quantitative", unit: def.metric.unit, direction: def.metric.direction}, def.metric); validateMetric(def.metric, def.target);
      if (def.outcomeId !== o.id || def.engagementId !== w.engagementId || def.organizationId !== w.organizationId || def.number !== history.definitions.indexOf(def) + 1 || (def.previousId && !history.definitions.some((p) => p.id === def.previousId && p.number < def.number)) || (def.baselineId && !history.baselines.some((b) => b.id === def.baselineId))) throw Error("Outcome definition relationship mismatch");
    }
    for (const baseline of history.baselines) {
      checkStrong(baseline); const def = history.definitions.find((d) => d.id === baseline.definitionId);
      if (!def || baseline.outcomeId !== o.id || baseline.engagementId !== w.engagementId || baseline.organizationId !== w.organizationId || baseline.number !== history.baselines.indexOf(baseline) + 1 || (baseline.previousId && !history.baselines.some((b) => b.id === baseline.previousId && b.number < baseline.number)) || timestampInstant(baseline.observedAt) > Date.now()) throw Error("Baseline relationship mismatch");
      validateMetric(def.metric, baseline.value, baseline.unit);
    }
    for (const m of o.measurements) {
      if (!m.binding) throw Error("Observation lacks immutable content binding");
      checkStrong(m.binding); const def = history.definitions.find((d) => d.id === m.binding?.definitionId), baseline = history.baselines.find((b) => b.id === m.binding?.baselineId);
      if (!def || m.binding.measurementId !== m.id || m.binding.engagementId !== w.engagementId || m.binding.organizationId !== w.organizationId || m.binding.outcomeId !== o.id || m.binding.definitionValue !== def.integrityValue || m.binding.baselineId !== def.baselineId || m.binding.baselineValue !== (baseline?.integrityValue ?? "") || canonical(m.binding.content) !== canonical(measurementContent(m)) || (m.binding.supersedesId && !o.measurements.some((p) => p.id === m.binding?.supersedesId && p.id !== m.id))) throw Error("Observation content or baseline binding changed");
      validateMetric(def.metric, m.value, def.metric.unit, o.type === "quantitative");
      if (m.verification) {
        if (!m.verificationBinding) throw Error("Verification lacks exact observation binding");
        checkStrong(m.verificationBinding);
        if (m.verificationBinding.measurementId !== m.id || m.verificationBinding.measurementValue !== m.binding.integrityValue || m.verificationBinding.baselineId !== m.binding.baselineId || m.verificationBinding.baselineValue !== m.binding.baselineValue || m.verificationBinding.definitionId !== m.binding.definitionId || canonical(m.verificationBinding.approval) !== canonical(m.verification)) throw Error("Verification content binding mismatch");
      } else if (m.verificationBinding) throw Error("Verification decision was removed");
    }
  }
  for (const r of w.reviews) {
    if (r.integrityContract !== STRONG_CONTRACT || r.schema !== "aurumi.cia.engagement-review/2" || !r.binding || !r.outcomeEvidence) throw Error("Review lacks exact reviewed evidence");
    checkStrong(r.binding);
    if (r.binding.engagementId !== w.engagementId || r.binding.organizationId !== w.organizationId || r.binding.stateValue !== contentValue(r.binding.state)) throw Error("Review material-state binding mismatch");
    for (const historic of r.outcomeEvidence) {
      const current = w.outcomes.find((o) => o.id === historic.id);
      if (!current?.evidenceHistory || !historic.evidenceHistory || historic.measurements.some((m) => !current.measurements.some((p) => p.id === m.id && canonical(p.binding) === canonical(m.binding))) || historic.evidenceHistory.baselines.some((b) => !current.evidenceHistory?.baselines.some((p) => canonical(p) === canonical(b))) || historic.evidenceHistory.definitions.some((d) => !current.evidenceHistory?.definitions.some((p) => canonical(p) === canonical(d)))) throw Error("Historical review evidence is unavailable or changed");
    }
  }
}

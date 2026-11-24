/** Phase 6 delivery service. Every await ends in a current identity/scope/lifecycle guarded durable commit. */
import { z } from "zod";
import { canonical, deepFreeze } from "@/domain/assessment";
import { can, effectiveScope, AccessDeniedError, type DeliveryAction } from "@/domain/permissions";
import { versionIntegrityProblems, type ProposalVersionRecord } from "@/domain/proposal";
import {
  DELIVERY_SCHEMA,
  TermsSchema,
  WorkstreamSchema,
  MilestoneSchema,
  DeliverableSchema,
  InteractionSchema,
  RiskSchema,
  OutcomeSchema,
  MeasurementSchema,
  ChangeSchema,
  ContinuationSchema,
  SERVICES,
  RESPONSIBILITIES,
  EngagementSchema,
  WorkspaceSchema,
  ProfileSchema,
  checkSeal,
  seal,
  contentValue,
  changeValue,
  workspaceProblems,
  completionProblems,
  today,
  currentAffiliation,
  STRONG_CONTRACT,
  strongSeal,
  sourceObligations,
  obligationStates,
  proposalScopeTerms,
  validateAuthorization,
  lifecycleAuthorizationProblems,
  completionState,
  measurementContent,
  establishOutcomeEvidence,
  historicalSourceValue,
  historicalObligationProblems,
  metricFor,
  validateMetric,
  timestampInstant,
  type DeliveryOutcome,
  type ScopeChange,
  type DeliveryReview,
  type DeliveryWorkspace,
  type Initiation,
  type ScopeVersion,
  type Completion,
  type ProfessionalAssignment,
  type ProfessionalProfile,
  type DeliveryDeliverable,
  type DeliverableReview,
  type DeliveryOperation,
  type ServiceTerms,
} from "@/domain/delivery";
import {
  AuthorizationSchema,
  ObligationMappingSchema,
  ObligationAmendmentSchema,
  type MeasurementDefinition,
} from "@/domain/delivery-evidence";
import { deliveryAdapters, type DeliveryAdapterKind } from "@/integrations/adapters/delivery";
import type { Engagement } from "@/domain/types";
import type { Ctx } from "./repositories";
import { store, newId } from "./store";
import {
  canonicalContext,
  phase6Base,
  phase6Approval,
  phase6Audit,
  assignmentEligible,
  deliveryTick,
} from "./network";
const creationSchema = z.strictObject({
  operationKey: z.string().min(1).max(120),
  title: z.string().min(1),
  origin: z.enum(["proposal", "direct", "follow_on"]),
  customerReference: z.string().min(1),
  customerName: z.string().min(1),
  customerKind: z.enum(["customer", "partner"]),
  partnerAffiliationId: z.string(),
  services: z.array(z.enum(SERVICES)).min(1),
  leadProfessionalId: z.string().min(1),
  terms: TermsSchema,
  authorizationEvidence: z.string().min(1),
  proposalVersionId: z.string(),
  allocationId: z.string(),
  previousEngagementId: z.string(),
  completionCriteria: z.string().trim().min(1).optional(),
});
export type EngagementCreation = z.infer<typeof creationSchema>;
type OperationalTerms = Pick<
  ServiceTerms,
  | "included"
  | "excluded"
  | "assumptions"
  | "customerResponsibilities"
  | "professionalResponsibilities"
  | "start"
  | "end"
  | "cadence"
> &
  Partial<ServiceTerms>;
type ChangeView = Omit<
  ScopeChange,
  "terms" | "commercialImpact" | "revisedProposal" | "approval" | "approvedValue"
> & {
  terms: OperationalTerms;
  commercialImpact?: string;
  revisedProposal?: unknown;
  approval?: ScopeChange["approval"];
  approvedValue?: string;
};
type ReviewView = DeliveryReview;
type PublicWorkspace = Omit<
  DeliveryWorkspace,
  "initiation" | "scopes" | "completion" | "changes" | "reviews"
> & { changes: ChangeView[]; reviews: ReviewView[] };
export interface DeliveryView {
  engagement: Engagement;
  workspace: PublicWorkspace;
  overview: {
    customerName: string;
    customerReference: string;
    services: string[];
    included: string;
    excluded: string;
    assumptions: string;
    customerResponsibilities: string;
    professionalResponsibilities: string;
    start: string;
    end: string;
    cadence: string;
    origin: string;
  };
  initiation: Initiation | null;
  scopes: ScopeVersion[];
  completion: Completion | null;
  commercialVisible: boolean;
  restricted: boolean;
  assurance: "strengthened" | "historical_only";
  obligations: ReturnType<typeof obligationStates>;
  completionBlockers: string[];
  staleReviewIds: string[];
}
function profile(userId: string): ProfessionalProfile | undefined {
  return store.table("networkProfiles").find((p) => p.userId === userId);
}
function restricted(ctx: Ctx) {
  const p = profile(ctx.user.id);
  const relationship = p ? currentAffiliation(p)?.relationship : undefined;
  return (
    ctx.user.affiliation === "partner" ||
    relationship === "independent" ||
    relationship === "reseller" ||
    effectiveScope(ctx.user, "delivery.read") === "self"
  );
}
function activeAssignments(ctx: Ctx, w: DeliveryWorkspace) {
  const day = today();
  return w.assignments.filter(
    (a) =>
      a.userId === ctx.user.id &&
      a.status === "active" &&
      a.start <= day &&
      (!a.end || a.end >= day),
  );
}
function partnerController(ctx: Ctx, e: Engagement, w: DeliveryWorkspace) {
  return (
    ctx.user.roles.includes("partner_manager") &&
    e.ownerId === ctx.user.id &&
    e.teamId === ctx.user.teamId &&
    w.assignments.some(
      (a) =>
        a.responsibility === "lead" &&
        a.affiliation.relationship === "reseller" &&
        a.affiliation.organization === w.initiation.customer.partnerAffiliationId &&
        store
          .table("networkProfiles")
          .some((p) => p.id === a.professionalId && p.teamId === ctx.user.teamId),
    )
  );
}
function authorize(
  ctx: Ctx,
  action: DeliveryAction,
  e?: Engagement,
  w?: DeliveryWorkspace,
  targetWorkstream?: string,
) {
  const c = canonicalContext(ctx);
  if (!can(c.user, `delivery.${action}`, e))
    throw new AccessDeniedError(`delivery.${action}`, e?.id);
  const p = profile(c.user.id);
  if (e && p && p.status !== "active" && !c.user.roles.includes("cia_admin"))
    throw new AccessDeniedError(`delivery.${action}`, e.id);
  if (e && w && restricted(c) && !partnerController(c, e, w)) {
    const assignments = activeAssignments(c, w);
    if (!p || !assignments.length) throw new AccessDeniedError(`delivery.${action}`, e.id);
    const valid = assignments.filter((a) => {
      try {
        const current = assignmentEligible(p, a.service, a.qualificationIds);
        return (
          current.id === a.affiliation.id &&
          current.organization === a.affiliation.organization &&
          current.relationship === a.affiliation.relationship &&
          (current.relationship !== "reseller" ||
            current.organization === w.initiation.customer.partnerAffiliationId)
        );
      } catch {
        return false;
      }
    });
    if (
      !valid.length ||
      (targetWorkstream &&
        !valid.some(
          (a) =>
            a.workstreamId === targetWorkstream ||
            (!a.workstreamId && ["lead", "support", "reviewer"].includes(a.responsibility)),
        ))
    )
      throw new AccessDeniedError(`delivery.${action}`, e.id);
  }
  return c;
}
function raw(id: string) {
  const e = store
    .table("engagements")
    .find((e) => e.id === id && e.deliverySchema === DELIVERY_SCHEMA);
  const w = store.table("deliveryWorkspaces").find((w) => w.engagementId === id);
  if (!e || !w) throw Error("Engagement unavailable");
  EngagementSchema.parse(e);
  const problems = [...workspaceProblems(w), ...lifecycleAuthorizationProblems(e.status, w)];
  if (problems.length) throw Error(problems.join("; "));
  if (
    e.organizationId !== w.organizationId ||
    e.initiationId !== w.initiation.id ||
    e.proposalId !== (w.initiation.source.kind === "proposal" ? w.initiation.source.proposalId : "")
  )
    throw Error("Engagement initiation relationships need recovery");
  if (
    (e.status === "completed") !== !!w.completion ||
    (e.status === "cancelled") !== !!w.cancellation
  )
    throw Error("Engagement lifecycle relationships need recovery");
  const users = [
    ...new Set(w.assignments.filter((a) => a.status === "active").map((a) => a.userId)),
  ].sort();
  if (canonical(users) !== canonical([...e.assignedUserIds].sort()))
    throw Error("Assignment access mirror needs recovery");
  for (const a of w.assignments) {
    const p = store.table("networkProfiles").find((p) => p.id === a.professionalId);
    if (
      !p ||
      p.userId !== a.userId ||
      p.organizationId !== w.organizationId ||
      !p.affiliations.some(
        (f) =>
          f.id === a.affiliation.id &&
          f.organization === a.affiliation.organization &&
          f.relationship === a.affiliation.relationship,
      )
    )
      throw Error("Assignment provenance needs recovery");
  }
  return { e, w };
}
function load(ctx: Ctx, id: string, action: DeliveryAction = "read", ws?: string) {
  const pair = raw(id);
  authorize(ctx, action, pair.e, pair.w, ws);
  return pair;
}
const fingerprint = (e: Engagement, w: DeliveryWorkspace) => contentValue({ e, w });
const editable = [
  "draft",
  "pending_authorization",
  "authorized",
  "mobilizing",
  "active",
  "on_hold",
  "completion_review",
];
function validateCommit(e: Engagement, w: DeliveryWorkspace) {
  EngagementSchema.parse(e);
  WorkspaceSchema.parse(w);
  const p = [...workspaceProblems(w), ...lifecycleAuthorizationProblems(e.status, w)];
  if (p.length) throw Error(p.join("; "));
}
function commit(ctx: Ctx, e: Engagement, w: DeliveryWorkspace, action: string) {
  validateCommit(e, w);
  e.updatedAt = new Date().toISOString();
  e.updatedBy = ctx.user.id;
  w.updatedAt = e.updatedAt;
  w.updatedBy = ctx.user.id;
  store.replace(
    "engagements",
    store.table("engagements").map((x) => (x.id === e.id ? e : x)),
  );
  store.replace(
    "deliveryWorkspaces",
    store.table("deliveryWorkspaces").map((x) => (x.engagementId === e.id ? w : x)),
  );
  phase6Audit(ctx, action, e.id, `Delivery decision ${action} saved`);
}
async function mutate(
  ctx: Ctx,
  id: string,
  action: DeliveryAction,
  edit: (e: Engagement, w: DeliveryWorkspace, c: Ctx) => void,
  targetWorkstream?: string,
  states: readonly string[] = editable,
) {
  const initial = load(ctx, id, action, targetWorkstream);
  if (initial.w.integrityContract !== STRONG_CONTRACT)
    throw Error(
      "Historical Phase 6 record: authorized source-bound revalidation is required before new governed operations",
    );
  if (!states.includes(initial.e.status))
    throw Error("This engagement state does not permit the requested operation");
  const value = fingerprint(initial.e, initial.w);
  await deliveryTick();
  const c = canonicalContext(ctx),
    { e, w } = load(c, id, action, targetWorkstream);
  if (fingerprint(e, w) !== value || !states.includes(e.status))
    throw Error("Engagement changed while this decision waited — refresh and retry");
  edit(e, w, c);
  store.durable(() => commit(c, e, w, `delivery.${action}`));
  return getView(c, id);
}
function currentTerms(w: DeliveryWorkspace) {
  const s = w.scopes.at(-1);
  if (!s) throw Error("Missing authorized scope");
  checkSeal(s);
  return s.terms;
}
function getView(ctx: Ctx, id: string): DeliveryView {
  const c = canonicalContext(ctx),
    { e, w } = load(c, id),
    isRestricted = restricted(c);
  const commercial = can(c.user, "delivery.commercial", e);
  const t = currentTerms(w);
  const { initiation: _initiation, scopes: _scopes, completion: _completion, ...operational } = w;
  let workspace: PublicWorkspace = operational;
  if (isRestricted) {
    const a = activeAssignments(c, w),
      all =
        partnerController(c, e, w) ||
        a.some(
          (a) => !a.workstreamId && ["lead", "support", "reviewer"].includes(a.responsibility),
        );
    const allowed = new Set(a.map((a) => a.workstreamId));
    const includes = (s: string) => all || allowed.has(s);
    workspace = {
      ...operational,
      assignments: w.assignments.filter(
        (a) => a.userId === c.user.id || partnerController(c, e, w),
      ),
      workstreams: w.workstreams.filter((s) => includes(s.id)),
      milestones: w.milestones.filter((m) => includes(m.workstreamId)),
      tasks: w.tasks.filter((t) => includes(t.workstreamId)),
      interactions: w.interactions.filter(
        (i) => includes(i.workstreamId) || i.createdBy === c.user.id,
      ),
      deliverables: w.deliverables.filter((d) => includes(d.workstreamId)),
      changes: [],
      concerns: w.concerns.filter((r) => includes(r.workstreamId) || r.createdBy === c.user.id),
      outcomes: w.outcomes.filter(
        (o) =>
          all ||
          (includes(o.workstreamId ?? "") && o.ownerProfessionalId === profile(c.user.id)?.id),
      ),
      reviews: all ? w.reviews : [],
      continuations: all ? w.continuations : [],
      authorization: null,
      cancellation: null,
    };
  }
  if (!commercial) {
    const {
      lifecycleHistory: _life,
      historicalRevalidation: _historical,
      ...safeWorkspace
    } = workspace;
    workspace = {
      ...safeWorkspace,
      authorization: null,
      cancellation: null,
      changes: workspace.changes.map((change) => ({
        id: change.id,
        organizationId: change.organizationId,
        engagementId: change.engagementId,
        createdAt: change.createdAt,
        createdBy: change.createdBy,
        updatedAt: change.updatedAt,
        updatedBy: change.updatedBy,
        sourceScopeId: change.sourceScopeId,
        requested: change.requested,
        reason: change.reason,
        impact: change.impact,
        scheduleImpact: change.scheduleImpact,
        status: change.status,
        scopeVersionId: change.scopeVersionId,
        revisedProposalVersionId: "",
        terms: operationalTerms(change.terms),
        ...(change.obligationAmendments
          ? { obligationAmendments: change.obligationAmendments }
          : {}),
      })),
      reviews: workspace.reviews.map(({ binding: _binding, ...review }) => review),
    };
  }
  return {
    engagement: e,
    workspace,
    overview: {
      customerName: w.initiation.customer.name,
      customerReference: commercial ? w.initiation.customer.reference : "",
      services: w.initiation.serviceCategories,
      included: t.included,
      excluded: t.excluded,
      assumptions: t.assumptions,
      customerResponsibilities: t.customerResponsibilities,
      professionalResponsibilities: t.professionalResponsibilities,
      start: t.start,
      end: t.end,
      cadence: t.cadence,
      origin: w.initiation.source.kind,
    },
    initiation: commercial ? deepFreeze(structuredClone(w.initiation)) : null,
    scopes: commercial ? deepFreeze(structuredClone(w.scopes)) : [],
    completion: commercial && w.completion ? deepFreeze(structuredClone(w.completion)) : null,
    commercialVisible: commercial,
    restricted: isRestricted,
    assurance: w.integrityContract === STRONG_CONTRACT ? "strengthened" : "historical_only",
    obligations: isRestricted ? [] : obligationStates(w),
    completionBlockers: isRestricted
      ? []
      : [
          ...completionProblems(w),
          ...(w.integrityContract !== STRONG_CONTRACT && e.status === "completed"
            ? historicalObligationProblems(w)
            : []),
        ],
    staleReviewIds: w.reviews
      .filter(
        (r) =>
          r.kind === "completion" &&
          (!r.binding || r.binding.stateValue !== contentValue(completionState(w))),
      )
      .map((r) => r.id),
  };
}
function operationalTerms(t: OperationalTerms): OperationalTerms {
  return {
    included: t.included,
    excluded: t.excluded,
    assumptions: t.assumptions,
    customerResponsibilities: t.customerResponsibilities,
    professionalResponsibilities: t.professionalResponsibilities,
    start: t.start,
    end: t.end,
    cadence: t.cadence,
  };
}
function outcomeOwner(
  ctx: Ctx,
  e: Engagement,
  w: DeliveryWorkspace,
  ownerId: string,
  ws: string,
  action: "measure" | "verify" | "assign" | "plan" | "risk" = "measure",
) {
  authorize(ctx, action, e, w, ws || undefined);
  if (
    restricted(ctx) &&
    !ws &&
    !activeAssignments(ctx, w).some(
      (a) => !a.workstreamId && ["lead", "support", "reviewer"].includes(a.responsibility),
    )
  )
    throw new AccessDeniedError(`delivery.${action}`, e.id);
  if (
    restricted(ctx) &&
    action !== "verify" &&
    ownerId !== profile(ctx.user.id)?.id &&
    !can(ctx.user, "delivery.assign", e)
  )
    throw new AccessDeniedError("delivery.measure", e.id);
  const assignments = w.assignments.filter(
    (a) =>
      a.professionalId === ownerId &&
      a.status === "active" &&
      a.start <= today() &&
      (!a.end || a.end >= today()) &&
      (a.workstreamId === ws ||
        (!a.workstreamId && ["lead", "support", "reviewer"].includes(a.responsibility))),
  );
  if (!assignments.length)
    throw Error("Outcome owner is not part of the current authorized operational scope");
  for (const a of assignments) eligibleProfile(ctx, e, ownerId, a.service, a.qualificationIds);
}
function eligibleProfile(
  ctx: Ctx,
  e: Engagement,
  pid: string,
  service: string,
  qids: readonly string[],
  on = today(),
) {
  const p = store
    .table("networkProfiles")
    .find((p) => p.id === pid && p.organizationId === e.organizationId);
  if (!p) throw Error("Professional identity is unavailable");
  ProfileSchema.parse(p);
  const a = assignmentEligible(p, service, qids, on);
  if (a.relationship === "reseller") {
    const w = store.table("deliveryWorkspaces").find((w) => w.engagementId === e.id);
    if (w && w.initiation.customer.partnerAffiliationId !== a.organization)
      throw Error("Reseller affiliation does not authorize this customer");
  }
  if (e.teamId !== p.teamId && effectiveScope(ctx.user, "delivery.assign") !== "organization")
    throw new AccessDeniedError("delivery.assign", e.id);
  return { p, a };
}
function issuedSource(ctx: Ctx, id: string): ProposalVersionRecord {
  const v = store.table("proposalVersions").find((v) => v.id === id),
    p = v ? store.table("proposals").find((p) => p.id === v.proposalId) : undefined;
  if (
    !v ||
    !p ||
    !can(ctx.user, "proposal.read", p) ||
    v.organizationId !== ctx.user.organizationId ||
    p.currentVersionId !== v.id ||
    v.supersededAt ||
    !v.issue ||
    v.review?.decision !== "approved" ||
    versionIntegrityProblems(v).length
  )
    throw Error("An authorized exact eligible issued proposal version is required");
  if (
    Date.parse(v.issue.effectiveAt) > Date.now() ||
    Date.parse(v.issue.expiresAt) < Date.now() ||
    !Number.isFinite(Date.parse(v.issue.expiresAt))
  )
    throw Error("Issued proposal commercial validity has expired or not started");
  return v;
}
function pinProposalTerms(
  t: ServiceTerms,
  v: ProposalVersionRecord,
  allocation: string,
): ServiceTerms {
  const total = v.document.commercials.summary.totals.find((r) => r.currency === t.currency);
  const amount =
    t.period === "one_time"
      ? total?.initialCost
      : t.period === "monthly"
        ? total?.monthly
        : t.period === "annual"
          ? total?.annual
          : undefined;
  if ((amount === undefined && t.amount !== null) || (amount !== undefined && t.amount !== amount))
    throw Error(
      "Engagement commercials must preserve the issued proposal currency, billing period and authorized amount",
    );
  const authorized = proposalScopeTerms(v);
  if (Object.entries(authorized).some(([key, value]) => t[key as keyof ServiceTerms] !== value))
    throw Error(
      "Engagement scope must preserve the exact issued proposal obligations; use an authorized amendment for material changes",
    );
  return {
    ...t,
    commercialBasis: `Issued proposal v${v.versionNumber}; separately authorized allocation ${allocation}`,
    pricingReference: `proposal-version://${v.id}/${t.period}`,
  };
}
function creationSource(ctx: Ctx, input: EngagementCreation): Initiation["source"] {
  if (input.origin === "proposal") {
    if (!input.allocationId.trim())
      throw Error("A separately authorized service allocation is required");
    const v = issuedSource(ctx, input.proposalVersionId);
    if (
      v.document.recipient.organization !== input.customerName &&
      v.document.recipient.name !== input.customerName
    )
      throw Error("Customer identity must match the issued proposal recipient");
    return {
      kind: "proposal",
      proposalId: v.proposalId,
      versionId: v.id,
      versionNumber: v.versionNumber,
      version: structuredClone(v),
      allocation: input.allocationId,
    };
  }
  if (input.origin === "follow_on") {
    const { e, w } = load(ctx, input.previousEngagementId);
    if (
      w.integrityContract !== STRONG_CONTRACT &&
      (!w.historicalRevalidation ||
        w.historicalRevalidation.sourceValue !== historicalSourceValue(w) ||
        (e.status === "completed" && historicalObligationProblems(w).length))
    )
      throw Error(
        "Historical completion cannot authorize a follow-on without source-bound revalidation",
      );
    if (!["active", "on_hold", "completion_review", "completed"].includes(e.status))
      throw Error("Follow-on source is not eligible");
    if (
      w.initiation.customer.reference !== input.customerReference ||
      w.initiation.customer.name !== input.customerName
    )
      throw Error("Follow-on customer must match the prior engagement");
    return {
      kind: "follow_on",
      previousEngagementId: e.id,
      previousInitiationValue: w.initiation.integrityValue,
      customerReference: input.customerReference,
      ...(w.integrityContract !== STRONG_CONTRACT && w.historicalRevalidation
        ? {
            historicalReview: structuredClone(w.historicalRevalidation),
            historicalSource: structuredClone(w),
          }
        : {}),
    };
  }
  return { kind: "direct", customerReference: input.customerReference };
}
const assignmentInput = z.strictObject({
  professionalId: z.string().min(1),
  responsibility: z.enum(RESPONSIBILITIES),
  workstreamId: z.string(),
  start: z.string(),
  end: z.string().nullable(),
  allocationHours: z.number().finite().nonnegative().max(168),
  qualificationIds: z.array(z.string()),
  service: z.enum(SERVICES),
});
async function external(
  ctx: Ctx,
  id: string,
  key: string,
  kind: DeliveryAdapterKind,
  targetId: string,
  payload: Record<string, unknown>,
  ws: string,
  finish: (w: DeliveryWorkspace, op: DeliveryOperation, c: Ctx) => void,
) {
  const action: DeliveryAction =
    kind === "task" ? "plan" : kind === "continuation" ? "continue" : "risk";
  const initial = load(ctx, id, action, ws);

  if (!["authorized", "mobilizing", "active", "on_hold"].includes(initial.e.status))
    throw Error("Engagement does not permit this handoff");
  if (kind !== "task") authorize(ctx, "commercial", initial.e, initial.w);
  const c = canonicalContext(ctx),
    opId = `delivery:${c.user.organizationId}:${kind}:${key}`;
  const sourceValue = contentValue({ id, kind, targetId, payload, ws });
  let op = store.table("deliveryOperations").find((o) => o.id === opId);
  if (op && (op.sourceValue !== sourceValue || op.actorId !== c.user.id || op.engagementId !== id))
    throw Error("Retry operation is bound to another source or actor");
  if (op?.state === "complete") return getView(c, id);
  if (
    initial.w.integrityContract !== STRONG_CONTRACT &&
    (!op ||
      !initial.w.historicalRevalidation ||
      initial.w.historicalRevalidation.sourceValue !== historicalSourceValue(initial.w))
  )
    throw Error("Historical handoff recovery requires authorized source-bound revalidation");
  if (!op) {
    op = {
      ...phase6Base(opId, c),
      kind,
      key,
      sourceValue,
      engagementId: id,
      actorId: c.user.id,
      state: "pending",
      targetId,
      payload: structuredClone(payload),
      reference: "",
    };
    const pending = op;
    store.durable(() => {
      authorize(c, action, initial.e, initial.w, ws);
      store.replace("deliveryOperations", [...store.table("deliveryOperations"), pending]);
      phase6Audit(c, `delivery.${kind}.intent`, id, "Stable simulated handoff intent saved");
    });
  }
  const initialValue = fingerprint(initial.e, initial.w);
  if (!op.reference) {
    const result = await deliveryAdapters.execute(kind, op.id, id, payload);
    const latest = load(c, id, action, ws);
    if (fingerprint(latest.e, latest.w) !== initialValue)
      throw Error("Engagement or assignment changed during the simulated handoff — retry safely");
    if (kind !== "task") authorize(c, "commercial", latest.e, latest.w);
    if (
      !result.ok ||
      !result.simulated ||
      result.operationId !== op.id ||
      result.sourceReference !== id ||
      !result.reference
    )
      throw Error(result.error || "Invalid simulated handoff result");
    const current = store.table("deliveryOperations").find((o) => o.id === opId);
    if (!current || current.sourceValue !== sourceValue || current.actorId !== c.user.id)
      throw Error("Handoff recovery identity changed");
    if (current.state === "complete") return getView(c, id);
    op = { ...current, state: "external_created", reference: result.reference };
    const withReference = op;
    store.durable(() =>
      store.replace(
        "deliveryOperations",
        store.table("deliveryOperations").map((o) => (o.id === opId ? withReference : o)),
      ),
    );
  }
  const { e, w } = load(c, id, action, ws);
  if (!["authorized", "mobilizing", "active", "on_hold"].includes(e.status))
    throw Error("Engagement changed before handoff commitment");
  if (kind !== "task") authorize(c, "commercial", e, w);
  const current = store.table("deliveryOperations").find((o) => o.id === opId);
  if (!current || current.sourceValue !== sourceValue || !current.reference)
    throw Error("Handoff operation needs recovery");
  if (current.state === "complete") return getView(c, id);
  finish(w, current, c);
  store.durable(() => {
    commit(c, e, w, `delivery.${kind}`);
    store.replace(
      "deliveryOperations",
      store
        .table("deliveryOperations")
        .map((o) => (o.id === opId ? { ...current, state: "complete" } : o)),
    );
  });
  return getView(c, id);
}
export const engagementService = {
  async revalidateHistorical(ctx: Ctx, id: string, evidence: string, comment: string) {
    const initial = load(ctx, id, "authorize");
    if (initial.w.integrityContract === STRONG_CONTRACT)
      throw Error("Current records already use strengthened governance");
    validateAuthorization(initial.w);
    if (initial.e.status === "completed" && historicalObligationProblems(initial.w).length)
      throw Error(historicalObligationProblems(initial.w).join("; "));
    const value = historicalSourceValue(initial.w);
    await deliveryTick();
    const c = canonicalContext(ctx),
      { e, w } = load(c, id, "authorize");
    authorize(c, "commercial", e, w);
    validateAuthorization(w);
    if (
      historicalSourceValue(w) !== value ||
      (e.status === "completed" && historicalObligationProblems(w).length)
    )
      throw Error("Historical source changed during revalidation");
    w.historicalRevalidation = strongSeal({
      engagementId: id,
      organizationId: w.organizationId,
      initiationValue: w.initiation.integrityValue,
      sourceValue: value,
      decision: "revalidated_for_follow_on" as const,
      approval: phase6Approval(c, evidence, comment),
    });
    store.durable(() => commit(c, e, w, "delivery.historical.revalidation"));
    return getView(c, id);
  },
  async mapObligation(
    ctx: Ctx,
    id: string,
    input: {
      obligationId: string;
      deliverableIds: string[];
      milestoneIds: string[];
      workstreamIds: string[];
      reviewIds: string[];
      coverage: string;
      evidence: string[];
      comment: string;
    },
  ) {
    return mutate(ctx, id, "scope", (_e, w, c) => {
      const obligation = w.obligations?.find((o) => o.id === input.obligationId);
      if (
        !obligation ||
        obligationStates(w)
          .find((o) => o.id === obligation.id)
          ?.status.includes("by_amendment")
      )
        throw Error("Applicable source obligation required");
      const { comment, ...body } = input;
      const mapping = ObligationMappingSchema.parse(
        strongSeal({ ...body, approval: phase6Approval(c, input.evidence[0] ?? "", comment) }),
      );
      w.obligationMappings = [
        ...(w.obligationMappings ?? []).filter((m) => m.obligationId !== input.obligationId),
        mapping,
      ];
    });
  },
  async correctBaseline(
    ctx: Ctx,
    id: string,
    outcomeId: string,
    input: {
      value: number | null;
      description: string;
      evidence: string[];
      reason: string;
      approvalEvidence: string;
    },
  ) {
    return mutate(ctx, id, "verify", (e, w, c) => {
      const o = w.outcomes.find((o) => o.id === outcomeId);
      if (!o) throw Error("Outcome unavailable");
      outcomeOwner(c, e, w, o.ownerProfessionalId, o.workstreamId ?? "", "verify");
      if (!input.reason.trim() || !input.evidence.length)
        throw Error("Baseline correction requires reason and evidence");
      o.baseline = input.value;
      o.baselineDescription = input.description;
      o.baselineEvidence = input.evidence;
      establishOutcomeEvidence(
        o,
        phase6Approval(c, input.approvalEvidence, input.reason),
        input.reason,
      );
      o.status = "in_progress";
    });
  },
  async reassignOutcome(
    ctx: Ctx,
    id: string,
    outcomeId: string,
    ownerProfessionalId: string,
    workstreamId: string,
    evidence: string,
    comment: string,
  ) {
    return mutate(ctx, id, "assign", (e, w, c) => {
      const o = w.outcomes.find((o) => o.id === outcomeId);
      if (!o) throw Error("Outcome unavailable");
      phase6Approval(c, evidence, comment);
      outcomeOwner(c, e, w, ownerProfessionalId, workstreamId, "assign");
      o.ownerProfessionalId = ownerProfessionalId;
      o.workstreamId = workstreamId;
    });
  },
  async reviseOutcomeDefinition(
    ctx: Ctx,
    id: string,
    outcomeId: string,
    input: Pick<
      DeliveryOutcome,
      | "objective"
      | "definition"
      | "unit"
      | "type"
      | "target"
      | "targetDescription"
      | "direction"
      | "frequency"
    > & { measurementDefinition: MeasurementDefinition; reason: string; evidence: string },
  ) {
    return mutate(ctx, id, "measure", (e, w, c) => {
      const o = w.outcomes.find((o) => o.id === outcomeId);
      if (!o) throw Error("Outcome unavailable");
      outcomeOwner(c, e, w, o.ownerProfessionalId, o.workstreamId ?? "");
      const { reason, evidence, ...definition } = input;
      const metric = metricFor(definition, definition.measurementDefinition);
      validateMetric(metric, definition.target);
      if (o.unit !== definition.unit || o.type !== definition.type)
        throw Error("Define a separate outcome for incompatible units or measurement types");
      Object.assign(o, definition);
      establishOutcomeEvidence(o, phase6Approval(c, evidence, reason), reason);
      o.status = "in_progress";
    });
  },
  async pendingOperations(ctx: Ctx, id = "") {
    const c = canonicalContext(ctx);
    return store
      .table("deliveryOperations")
      .filter(
        (o) =>
          o.actorId === c.user.id &&
          o.organizationId === c.user.organizationId &&
          o.state !== "complete" &&
          (id ? o.engagementId === id : o.kind === "create"),
      )
      .filter((o) => {
        try {
          if (o.kind === "create") authorize(c, "create");
          else
            load(
              c,
              o.engagementId,
              o.kind === "task" ? "plan" : o.kind === "continuation" ? "continue" : "risk",
              String(o.payload["workstreamId"] ?? ""),
            );
          return true;
        } catch {
          return false;
        }
      });
  },
  async retryOperation(ctx: Ctx, operationId: string) {
    const c = canonicalContext(ctx),
      op = store
        .table("deliveryOperations")
        .find(
          (o) =>
            o.id === operationId &&
            o.actorId === c.user.id &&
            o.organizationId === c.user.organizationId,
        );
    if (!op) throw new AccessDeniedError("delivery.read");
    if (op.kind === "create") return engagementService.create(c, creationSchema.parse(op.payload));
    if (op.kind === "task")
      return engagementService.task(c, op.engagementId, {
        key: op.key,
        workstreamId: String(op.payload["workstreamId"] ?? ""),
        milestoneId: String(op.payload["milestoneId"] ?? ""),
        title: String(op.payload["title"] ?? ""),
      });
    if (op.kind === "continuation")
      return engagementService.handoffContinuation(c, op.engagementId, op.targetId, op.key);
    return engagementService.demand(
      c,
      op.engagementId,
      op.targetId,
      op.key,
      String(op.payload["theme"] ?? ""),
    );
  },
  async list(ctx: Ctx) {
    const c = canonicalContext(ctx);
    if (!can(c.user, "delivery.read")) return [];
    const out: DeliveryView[] = [];
    for (const e of store
      .table("engagements")
      .filter((e) => e.deliverySchema === DELIVERY_SCHEMA)) {
      try {
        out.push(getView(c, e.id));
      } catch (error) {
        if (!(error instanceof AccessDeniedError) && can(c.user, "delivery.read", e)) throw error;
      }
    }
    return out;
  },
  async get(ctx: Ctx, id: string) {
    return getView(ctx, id);
  },
  async candidates(ctx: Ctx, id?: string) {
    const c = canonicalContext(ctx);
    if (id) load(c, id, "assign");
    else authorize(c, "create");
    return store
      .table("networkProfiles")
      .filter(
        (p) =>
          p.organizationId === c.user.organizationId &&
          (effectiveScope(c.user, "delivery.assign") === "organization" ||
            p.teamId === c.user.teamId),
      )
      .map((p) => ({
        id: p.id,
        userId: p.userId,
        displayName: p.displayName,
        title: p.title,
        status: p.status,
        availability: p.availability,
        weeklyCapacity: p.weeklyCapacity,
        services: p.services,
        qualifications: p.qualifications.map((q) => ({
          id: q.id,
          name: q.name,
          status: q.status,
          expiryDate: q.expiryDate,
        })),
        affiliation: currentAffiliation(p)?.relationship ?? "unknown",
      }));
  },
  async proposals(ctx: Ctx) {
    const c = authorize(ctx, "create");
    return store
      .table("proposalVersions")
      .filter((v) => {
        try {
          issuedSource(c, v.id);
          return true;
        } catch {
          return false;
        }
      })
      .map((v) => ({
        id: v.id,
        proposalId: v.proposalId,
        number: v.versionNumber,
        title: v.document.proposal.title,
        customerName: v.document.recipient.organization || v.document.recipient.name,
        terms: can(c.user, "delivery.commercial")
          ? {
              ...proposalScopeTerms(v),
              commercialBasis: "Pinned issued proposal authorization",
              currency: v.document.commercials.summary.totals[0]?.currency ?? "INR",
              amount: v.document.commercials.summary.totals[0]?.initialCost ?? null,
              period: "one_time" as const,
              pricingReference: `proposal-version://${v.id}/one_time`,
              start: today(),
              end: v.issue?.expiresAt.slice(0, 10) ?? today(),
              cadence: "",
            }
          : null,
      }));
  },
  async create(ctx: Ctx, input: EngagementCreation) {
    const data = creationSchema.parse(input),
      c = authorize(ctx, "create");
    if (data.terms.end < data.terms.start) throw Error("Invalid service period");
    if (!data.customerReference.startsWith("mock://shoptalk/"))
      throw Error("A simulated ShopTalk customer or partner reference is required");
    const source = creationSource(c, data),
      sourceValue = contentValue(data),
      opId = `delivery:${c.user.organizationId}:create:${data.operationKey}`,
      id = `engagement_${contentValue(opId)}`;
    let op = store.table("deliveryOperations").find((o) => o.id === opId);
    if (op && (op.sourceValue !== sourceValue || op.actorId !== c.user.id))
      throw Error("Creation retry must reuse the original source and authorized actor");
    if (op?.state === "complete") return getView(c, op.engagementId);
    const e: Engagement = {
      ...phase6Base(id, c),
      ownerId: c.user.id,
      teamId: c.user.teamId,
      assignedUserIds: [],
      proposalId: source.kind === "proposal" ? source.proposalId : "",
      title: data.title,
      status: "draft",
      deliverySchema: DELIVERY_SCHEMA,
      initiationId: `init_${id}`,
    };
    authorize(c, "create", e);
    const { p, a } = eligibleProfile(
      c,
      e,
      data.leadProfessionalId,
      data.services[0] ?? "custom",
      [],
    );
    if (a.relationship === "reseller" && a.organization !== data.partnerAffiliationId)
      throw Error("Reseller customer affiliation does not match");
    if (!op) {
      op = {
        ...phase6Base(opId, c),
        kind: "create",
        key: data.operationKey,
        sourceValue,
        engagementId: id,
        actorId: c.user.id,
        state: "pending",
        targetId: id,
        payload: structuredClone(data),
        reference: "",
      };
      const pending = op;
      store.durable(() => {
        store.replace("deliveryOperations", [...store.table("deliveryOperations"), pending]);
        phase6Audit(c, "delivery.create.intent", id, "Stable engagement creation intent saved");
      });
    }
    await deliveryTick();
    authorize(c, "create", e);
    const currentSource = creationSource(c, data);
    if (canonical(currentSource) !== canonical(source))
      throw Error("Engagement source changed during creation");
    const currentOp = store.table("deliveryOperations").find((o) => o.id === opId);
    if (!currentOp || currentOp.sourceValue !== sourceValue || currentOp.actorId !== c.user.id)
      throw Error("Creation operation changed");
    if (currentOp.state === "complete") return getView(c, id);
    const eligible = eligibleProfile(c, e, p.id, data.services[0] ?? "custom", []);
    if (
      source.kind === "proposal" &&
      store
        .table("deliveryWorkspaces")
        .some(
          (w) =>
            w.initiation.source.kind === "proposal" &&
            w.initiation.source.versionId === source.versionId &&
            w.initiation.source.allocation === source.allocation,
        )
    )
      throw Error("This proposal service allocation already has an engagement");
    const sourceVersion =
      source.kind === "proposal" ? (source.version as ProposalVersionRecord) : null;
    const pinnedTerms: ServiceTerms = sourceVersion
      ? pinProposalTerms(data.terms, sourceVersion, data.allocationId)
      : structuredClone(data.terms);
    const initiationBody = {
      ...phase6Base(e.initiationId ?? `init_${id}`, c),
      schema: "aurumi.cia.engagement-initiation/2" as const,
      engagementId: id,
      customer: {
        reference: data.customerReference,
        name: data.customerName,
        kind: data.customerKind,
        partnerAffiliationId: data.partnerAffiliationId,
      },
      serviceCategories: data.services,
      source: currentSource,
      terms: pinnedTerms,
      deliverables:
        sourceVersion?.document.deliverables.map((d) => ({
          title: d.info.recommendationTitle,
          criteria: d.acceptanceCriterion || "Acceptance criteria to be agreed",
        })) ?? [],
      authorizingEvidence: data.authorizationEvidence,
      ...(data.completionCriteria ? { completionCriteria: data.completionCriteria } : {}),
    };
    const obligations = sourceObligations(initiationBody);
    const initiation = strongSeal({ ...initiationBody, obligations });
    const scope = strongSeal({
      ...phase6Base(`scope_${id}_1`, c),
      schema: "aurumi.cia.engagement-scope/2" as const,
      engagementId: id,
      number: 1,
      obligationIds: obligations.map((o) => o.id),
      terms: pinnedTerms,
      changeId: "",
      approval: phase6Approval(
        c,
        data.authorizationEvidence,
        "Scope prepared for separate commencement authorization",
      ),
    });
    const assignment: ProfessionalAssignment = {
      ...phase6Base(`assignment_${id}_lead`, c),
      engagementId: id,
      professionalId: eligible.p.id,
      userId: eligible.p.userId,
      responsibility: "lead",
      workstreamId: "",
      start: today(),
      end: null,
      status: "active",
      acknowledgedAt: null,
      allocationHours: 0,
      qualificationIds: [],
      service: data.services[0] ?? "custom",
      affiliation: {
        id: eligible.a.id,
        organization: eligible.a.organization,
        relationship: eligible.a.relationship,
        start: eligible.a.start,
        end: eligible.a.end,
      },
    };
    e.assignedUserIds = [assignment.userId];
    const w: DeliveryWorkspace = {
      ...phase6Base(`workspace_${id}`, c),
      engagementId: id,
      initiation,
      authorization: null,
      integrityContract: STRONG_CONTRACT,
      obligations,
      obligationMappings: [],
      lifecycleHistory: [],
      scopes: [scope],
      assignments: [assignment],
      workstreams: [],
      milestones: [],
      tasks: [],
      interactions: [],
      deliverables: [],
      changes: [],
      concerns: [],
      outcomes: [],
      reviews: [],
      continuations: [],
      holdReason: "",
      holdBy: "",
      completion: null,
      cancellation: null,
    };
    validateCommit(e, w);
    store.durable(() => {
      authorize(c, "create", e);
      store.replace("engagements", [...store.table("engagements"), e]);
      store.replace("deliveryWorkspaces", [...store.table("deliveryWorkspaces"), w]);
      store.replace(
        "deliveryOperations",
        store
          .table("deliveryOperations")
          .map((o) => (o.id === opId ? { ...currentOp, state: "complete" } : o)),
      );
      phase6Audit(
        c,
        "delivery.create",
        id,
        "Engagement created; commencement remains separately authorized",
      );
    });
    return getView(c, id);
  },
  async transition(ctx: Ctx, id: string, next: string, evidence: string, comment: string) {
    const action: DeliveryAction = next === "cancelled" ? "cancel" : "authorize";
    return mutate(ctx, id, action, (e, w, c) => {
      const paths: Record<string, readonly string[]> = {
        draft: ["pending_authorization", "cancelled"],
        pending_authorization: ["authorized", "draft", "cancelled"],
        authorized: ["mobilizing", "cancelled"],
        mobilizing: ["active", "on_hold", "cancelled"],
        active: ["on_hold", "completion_review", "cancelled"],
        on_hold: ["active", "cancelled"],
        completion_review: ["active", "cancelled"],
      };
      if (!paths[e.status]?.includes(next)) throw Error("Invalid engagement lifecycle transition");
      const decision = phase6Approval(c, evidence, comment);
      if (["authorized", "mobilizing", "active"].includes(next)) {
        const leads = w.assignments.filter(
          (a) => a.status === "active" && a.responsibility === "lead",
        );
        if (leads.length !== 1) throw Error("Exactly one accountable engagement lead is required");
        for (const a of w.assignments.filter((a) => a.status === "active"))
          eligibleProfile(c, e, a.professionalId, a.service, a.qualificationIds);
        if (!w.authorization && next !== "authorized")
          throw Error("Explicit commencement authorization is required");
        if (next === "authorized") {
          const original = w.scopes[0];
          if (!original) throw Error("Original scope unavailable");
          w.authorization = strongSeal({
            ...decision,
            engagementId: id,
            organizationId: w.organizationId,
            initiationId: w.initiation.id,
            initiationValue: w.initiation.integrityValue,
            scopeId: original.id,
            scopeValue: original.integrityValue,
            commercialValue: contentValue(original.terms),
            authorizationType: w.initiation.source.kind,
          });
        } else validateAuthorization(w);
      }
      if (next === "on_hold") {
        w.holdReason = comment;
        w.holdBy = c.user.id;
      }
      if (next === "cancelled") w.cancellation = decision;
      w.lifecycleHistory?.push(
        strongSeal({
          id: newId("lifecycle"),
          engagementId: id,
          organizationId: w.organizationId,
          from: e.status,
          to: next,
          authorizationValue:
            w.authorization && "integrityValue" in w.authorization
              ? w.authorization.integrityValue
              : "",
          approval: decision,
        }),
      );
      e.status = next as Engagement["status"];
    });
  },
  async assign(ctx: Ctx, id: string, input: z.infer<typeof assignmentInput>) {
    const data = assignmentInput.parse(input);
    return mutate(ctx, id, "assign", (e, w, c) => {
      if (data.workstreamId && !w.workstreams.some((s) => s.id === data.workstreamId))
        throw Error("Workstream is unavailable");
      const { p, a } = eligibleProfile(
        c,
        e,
        data.professionalId,
        data.service,
        data.qualificationIds,
        data.start,
      );
      const candidate: ProfessionalAssignment = {
        ...phase6Base(newId("assignment"), c),
        ...data,
        engagementId: id,
        userId: p.userId,
        status: "active",
        acknowledgedAt: null,
        affiliation: {
          id: a.id,
          organization: a.organization,
          relationship: a.relationship,
          start: a.start,
          end: a.end,
        },
      };
      if (data.end && data.end < data.start) throw Error("Invalid assignment period");
      if (
        w.assignments.some(
          (a) =>
            a.professionalId === p.id &&
            a.status === "active" &&
            a.workstreamId === data.workstreamId,
        )
      )
        throw Error("Professional already has an active assignment for this workstream");
      if (data.responsibility === "lead")
        for (const old of w.assignments.filter(
          (a) => a.status === "active" && a.responsibility === "lead",
        )) {
          old.status = "ended";
          old.end = today();
        }
      w.assignments.push(candidate);
      e.assignedUserIds = [
        ...new Set(w.assignments.filter((a) => a.status === "active").map((a) => a.userId)),
      ];
    });
  },
  async removeAssignment(
    ctx: Ctx,
    id: string,
    assignmentId: string,
    evidence: string,
    comment: string,
  ) {
    return mutate(ctx, id, "assign", (e, w, c) => {
      phase6Approval(c, evidence, comment);
      const a = w.assignments.find((a) => a.id === assignmentId);
      if (!a || a.status !== "active") throw Error("Assignment is unavailable");
      if (a.responsibility === "lead" && ["authorized", "mobilizing", "active"].includes(e.status))
        throw Error("Reassign the accountable lead before removing this assignment");
      a.status = "ended";
      a.end = today();
      e.assignedUserIds = [
        ...new Set(w.assignments.filter((a) => a.status === "active").map((a) => a.userId)),
      ];
    });
  },
  async acknowledge(ctx: Ctx, id: string, assignmentId: string) {
    return mutate(ctx, id, "read", (_e, w, c) => {
      const a = w.assignments.find(
        (a) => a.id === assignmentId && a.userId === c.user.id && a.status === "active",
      );
      if (!a) throw Error("Only the assigned professional may acknowledge");
      a.acknowledgedAt = new Date().toISOString();
    });
  },
  async workstream(
    ctx: Ctx,
    id: string,
    input: Pick<
      z.infer<typeof WorkstreamSchema>,
      "name" | "description" | "ownerProfessionalId" | "start" | "end" | "dependencies"
    >,
  ) {
    const data = WorkstreamSchema.pick({
      name: true,
      description: true,
      ownerProfessionalId: true,
      start: true,
      end: true,
      dependencies: true,
    }).parse(input);
    return mutate(ctx, id, "plan", (_e, w, c) => {
      if (restricted(c)) throw new AccessDeniedError("delivery.plan", id);
      outcomeOwner(c, _e, w, data.ownerProfessionalId, "", "plan");
      if (
        !w.assignments.some(
          (a) => a.professionalId === data.ownerProfessionalId && a.status === "active",
        )
      )
        throw Error("Workstream owner needs an active assignment");
      w.workstreams.push({
        ...phase6Base(newId("workstream"), c),
        ...data,
        engagementId: id,
        status: "planned",
      });
    });
  },
  async milestone(
    ctx: Ctx,
    id: string,
    input: Pick<
      z.infer<typeof MilestoneSchema>,
      | "workstreamId"
      | "title"
      | "description"
      | "ownerProfessionalId"
      | "due"
      | "criteria"
      | "deliverableIds"
      | "dependencies"
      | "required"
    >,
  ) {
    const data = MilestoneSchema.pick({
      workstreamId: true,
      title: true,
      description: true,
      ownerProfessionalId: true,
      due: true,
      criteria: true,
      deliverableIds: true,
      dependencies: true,
      required: true,
    }).parse(input);
    return mutate(
      ctx,
      id,
      "plan",
      (_e, w, c) => {
        outcomeOwner(c, _e, w, data.ownerProfessionalId, data.workstreamId, "plan");
        w.milestones.push({
          ...phase6Base(newId("milestone"), c),
          ...data,
          engagementId: id,
          completedAt: null,
          status: "planned",
          evidence: [],
          exception: null,
        });
      },
      data.workstreamId,
    );
  },
  async milestoneStatus(
    ctx: Ctx,
    id: string,
    milestoneId: string,
    status: "in_progress" | "blocked" | "ready" | "completed" | "cancelled",
    evidence: string[],
    exception?: { evidence: string; comment: string },
  ) {
    const initial = load(ctx, id),
      m = initial.w.milestones.find((m) => m.id === milestoneId);
    if (!m) throw Error("Milestone unavailable");
    return mutate(
      ctx,
      id,
      "plan",
      (_e, w, c) => {
        const item = w.milestones.find((m) => m.id === milestoneId);
        if (!item) throw Error("Milestone unavailable");
        if (["completed", "cancelled"].includes(item.status))
          throw Error("Settled milestones cannot be rewritten");
        if (!["in_progress", "blocked", "ready", "completed", "cancelled"].includes(status))
          throw Error("Invalid milestone state");
        if (exception) {
          authorize(c, "authorize", initial.e, w);
          item.exception = phase6Approval(c, exception.evidence, exception.comment);
        }
        item.status = status;
        item.evidence = evidence;
        item.completedAt = status === "completed" ? new Date().toISOString() : null;
      },
      m.workstreamId,
      ["mobilizing", "active", "on_hold"],
    );
  },
  async deliverable(
    ctx: Ctx,
    id: string,
    input: Pick<
      z.infer<typeof DeliverableSchema>,
      | "workstreamId"
      | "ownerProfessionalId"
      | "title"
      | "description"
      | "criteria"
      | "due"
      | "required"
      | "independentReview"
      | "acceptanceKind"
      | "artifactReference"
    >,
  ) {
    const data = DeliverableSchema.pick({
      workstreamId: true,
      ownerProfessionalId: true,
      title: true,
      description: true,
      criteria: true,
      due: true,
      required: true,
      independentReview: true,
      acceptanceKind: true,
      artifactReference: true,
    }).parse(input);
    return mutate(
      ctx,
      id,
      "plan",
      (_e, w, c) => {
        outcomeOwner(c, _e, w, data.ownerProfessionalId, data.workstreamId, "plan");
        w.deliverables.push({
          ...phase6Base(newId("deliverable"), c),
          ...data,
          engagementId: id,
          status: "draft",
          versions: [],
          reviews: [],
        });
      },
      data.workstreamId,
    );
  },
  async editDeliverable(
    ctx: Ctx,
    id: string,
    deliverableId: string,
    input: Pick<DeliveryDeliverable, "description" | "artifactReference">,
  ) {
    const data = DeliverableSchema.pick({ description: true, artifactReference: true }).parse(
        input,
      ),
      d = load(ctx, id).w.deliverables.find((d) => d.id === deliverableId);
    if (!d) throw Error("Deliverable unavailable");
    return mutate(
      ctx,
      id,
      "submit",
      (_e, w, c) => {
        const item = w.deliverables.find((d) => d.id === deliverableId);
        if (!item) throw Error("Deliverable unavailable");
        if (
          item.status === "accepted" &&
          w.milestones.some((m) => m.status === "completed" && m.deliverableIds.includes(item.id))
        )
          throw Error(
            "An accepted milestone commitment cannot be silently superseded; authorize a scope amendment",
          );
        if (restricted(c) && item.ownerProfessionalId !== profile(c.user.id)?.id)
          throw new AccessDeniedError("delivery.submit", id);
        Object.assign(item, data);
        item.status = "draft";
      },
      d.workstreamId,
    );
  },
  async submitDeliverable(ctx: Ctx, id: string, deliverableId: string) {
    const d = load(ctx, id).w.deliverables.find((d) => d.id === deliverableId);
    if (!d) throw Error("Deliverable unavailable");
    return mutate(
      ctx,
      id,
      "submit",
      (_e, w, c) => {
        const item = w.deliverables.find((d) => d.id === deliverableId);
        if (
          !item ||
          !["draft", "changes_requested"].includes(item.status) ||
          !item.artifactReference
        )
          throw Error("A draft artifact is required");
        if (restricted(c) && item.ownerProfessionalId !== profile(c.user.id)?.id)
          throw new AccessDeniedError("delivery.submit", id);
        const author = profile(c.user.id)?.id ?? item.ownerProfessionalId;
        item.versions.push(
          seal({
            ...phase6Base(`version_${item.id}_${item.versions.length + 1}`, c),
            schema: "aurumi.cia.deliverable-version/1" as const,
            engagementId: id,
            deliverableId: item.id,
            number: item.versions.length + 1,
            description: item.description,
            criteria: item.criteria,
            artifactReference: item.artifactReference,
            authorProfessionalId: author,
            submittedAt: new Date().toISOString(),
          }),
        );
        item.status = "submitted";
      },
      d.workstreamId,
      ["mobilizing", "active", "on_hold"],
    );
  },
  async reviewDeliverable(
    ctx: Ctx,
    id: string,
    deliverableId: string,
    versionId: string,
    kind: DeliverableReview["kind"],
    decision: DeliverableReview["decision"],
    evidence: string,
    comment: string,
  ) {
    const d = load(ctx, id).w.deliverables.find((d) => d.id === deliverableId);
    if (!d) throw Error("Deliverable unavailable");
    const action = kind === "internal_review" ? "review" : "accept";
    return mutate(
      ctx,
      id,
      action,
      (_e, w, c) => {
        const item = w.deliverables.find((d) => d.id === deliverableId),
          v = item?.versions.at(-1);
        if (
          !item ||
          !v ||
          v.id !== versionId ||
          !["submitted", "under_review"].includes(item.status)
        )
          throw Error("Review must bind to the exact current submitted version");
        if (
          item.independentReview &&
          (v.createdBy === c.user.id || v.authorProfessionalId === profile(c.user.id)?.id)
        )
          throw Error("An independent author/reviewer separation is required");
        checkSeal(v);
        const review = seal({
          ...phase6Base(`review_${versionId}_${kind}`, c),
          engagementId: id,
          deliverableId: item.id,
          versionId: v.id,
          versionValue: v.integrityValue,
          kind,
          decision,
          approval: phase6Approval(c, evidence, comment),
        });
        if (item.reviews.some((r) => r.id === review.id))
          throw Error("This version already has that review decision");
        item.reviews.push(review);
        item.status =
          decision === "changes_requested"
            ? "changes_requested"
            : kind === item.acceptanceKind
              ? "accepted"
              : "under_review";
      },
      d.workstreamId,
      ["mobilizing", "active", "on_hold", "completion_review"],
    );
  },
  async interaction(
    ctx: Ctx,
    id: string,
    input: Omit<
      z.infer<typeof InteractionSchema>,
      | "id"
      | "organizationId"
      | "engagementId"
      | "createdAt"
      | "createdBy"
      | "updatedAt"
      | "updatedBy"
    >,
  ) {
    const data = InteractionSchema.omit({
      id: true,
      organizationId: true,
      engagementId: true,
      createdAt: true,
      createdBy: true,
      updatedAt: true,
      updatedBy: true,
    }).parse(input);
    return mutate(
      ctx,
      id,
      "interact",
      (_e, w, c) =>
        w.interactions.push({ ...phase6Base(newId("interaction"), c), ...data, engagementId: id }),
      data.workstreamId || undefined,
      ["mobilizing", "active", "on_hold"],
    );
  },
  async concern(
    ctx: Ctx,
    id: string,
    input: Omit<
      z.infer<typeof RiskSchema>,
      | "id"
      | "organizationId"
      | "engagementId"
      | "createdAt"
      | "createdBy"
      | "updatedAt"
      | "updatedBy"
      | "status"
      | "acknowledgement"
    >,
  ) {
    const data = RiskSchema.omit({
      id: true,
      organizationId: true,
      engagementId: true,
      createdAt: true,
      createdBy: true,
      updatedAt: true,
      updatedBy: true,
      status: true,
      acknowledgement: true,
    }).parse(input);
    return mutate(
      ctx,
      id,
      "risk",
      (_e, w, c) => {
        outcomeOwner(c, _e, w, data.ownerProfessionalId, data.workstreamId, "risk");
        if (data.verification === "verified") authorize(c, "verify", _e, w);
        w.concerns.push({
          ...phase6Base(newId("concern"), c),
          ...data,
          engagementId: id,
          status: "open",
          acknowledgement: null,
        });
      },
      data.workstreamId || undefined,
    );
  },
  async resolveConcern(
    ctx: Ctx,
    id: string,
    concernId: string,
    status: "resolved" | "acknowledged",
    evidence: string,
    comment: string,
  ) {
    const r = load(ctx, id).w.concerns.find((r) => r.id === concernId);
    if (!r) throw Error("Concern unavailable");
    return mutate(
      ctx,
      id,
      "risk",
      (_e, w, c) => {
        const item = w.concerns.find((r) => r.id === concernId);
        if (!item || item.kind === "decision")
          throw Error("Historical decisions cannot be rewritten");
        if (status === "acknowledged") authorize(c, "authorize", _e, w);
        item.status = status;
        item.acknowledgement = phase6Approval(c, evidence, comment);
      },
      r.workstreamId || undefined,
    );
  },
  async reopenConcern(ctx: Ctx, id: string, concernId: string, evidence: string, comment: string) {
    const original = load(ctx, id).w.concerns.find((r) => r.id === concernId);
    if (!original) throw Error("Concern unavailable");
    return mutate(
      ctx,
      id,
      "risk",
      (e, w, c) => {
        const item = w.concerns.find((r) => r.id === concernId);
        if (!item || item.kind === "decision") throw Error("A material concern is required");
        authorize(c, "authorize", e, w, item.workstreamId || undefined);
        phase6Approval(c, evidence, comment);
        item.status = "open";
        item.acknowledgement = null;
        item.response = comment;
      },
      original.workstreamId || undefined,
    );
  },
  async outcome(
    ctx: Ctx,
    id: string,
    input: Omit<
      z.infer<typeof OutcomeSchema>,
      | "id"
      | "organizationId"
      | "engagementId"
      | "createdAt"
      | "createdBy"
      | "updatedAt"
      | "updatedBy"
      | "status"
      | "measurements"
      | "feedback"
      | "evidenceHistory"
    >,
  ) {
    const data = OutcomeSchema.omit({
      id: true,
      organizationId: true,
      engagementId: true,
      createdAt: true,
      createdBy: true,
      updatedAt: true,
      updatedBy: true,
      status: true,
      measurements: true,
      feedback: true,
      evidenceHistory: true,
    }).parse(input);
    return mutate(ctx, id, "measure", (_e, w, c) => {
      const ws =
        data.workstreamId ??
        (restricted(c)
          ? (activeAssignments(c, w).find((a) => a.workstreamId)?.workstreamId ?? "")
          : "");
      if (ws && !w.workstreams.some((s) => s.id === ws))
        throw Error("Outcome workstream unavailable");
      outcomeOwner(c, _e, w, data.ownerProfessionalId, ws);
      const metric = metricFor(data, data.measurementDefinition);
      validateMetric(metric, data.baseline);
      validateMetric(metric, data.target);
      if (data.type === "quantitative" && (data.direction === "qualitative" || !data.unit))
        throw Error("A quantitative measurement needs a unit and direction");
      if (data.baseline !== null && !data.baselineEvidence.length)
        throw Error("A baseline requires supporting evidence");
      const outcome: DeliveryOutcome = {
        ...phase6Base(newId("outcome"), c),
        ...data,
        engagementId: id,
        status:
          data.baseline === null && !data.baselineDescription
            ? "baseline_pending"
            : "baseline_established",
        feedback: "",
        measurements: [],
        workstreamId: ws,
        measurementDefinition: metric,
      };
      establishOutcomeEvidence(
        outcome,
        phase6Approval(
          c,
          data.baselineEvidence[0] ?? "mock://outcome-definition",
          "Outcome definition and baseline established",
        ),
      );
      w.outcomes.push(outcome);
    });
  },
  async measure(
    ctx: Ctx,
    id: string,
    outcomeId: string,
    input: Omit<
      z.infer<typeof MeasurementSchema>,
      | "id"
      | "organizationId"
      | "engagementId"
      | "outcomeId"
      | "createdAt"
      | "createdBy"
      | "updatedAt"
      | "updatedBy"
      | "verification"
      | "binding"
      | "verificationBinding"
    >,
    status: z.infer<typeof OutcomeSchema>["status"],
    feedback: string,
    correction?: { supersedesId: string; reason: string },
  ) {
    const data = MeasurementSchema.omit({
      id: true,
      organizationId: true,
      engagementId: true,
      outcomeId: true,
      createdAt: true,
      createdBy: true,
      updatedAt: true,
      updatedBy: true,
      verification: true,
      binding: true,
      verificationBinding: true,
    }).parse(input);
    return mutate(ctx, id, "measure", (_e, w, c) => {
      const o = w.outcomes.find((o) => o.id === outcomeId);
      if (!o) throw Error("Outcome unavailable");
      outcomeOwner(c, _e, w, o.ownerProfessionalId, o.workstreamId ?? "");
      const metric = metricFor(o, o.measurementDefinition);
      validateMetric(metric, data.value, metric.unit, o.type === "quantitative");
      if (
        correction &&
        (!correction.reason.trim() || !o.measurements.some((m) => m.id === correction.supersedesId))
      )
        throw Error("Observation correction requires its original observation and reason");
      if (timestampInstant(data.observedAt) > Date.now())
        throw Error("A future target is not an observed measurement");
      if (o.type === "qualitative" && !data.qualitative)
        throw Error("Record a qualitative observation");
      if (status === "achieved") {
        if (data.provenance === "estimate" || !data.evidence.length)
          throw Error("Achievement requires observed evidence, not an estimate");
        if (
          o.type === "quantitative" &&
          (data.value === null ||
            o.target === null ||
            (o.direction === "decrease" ? data.value > o.target : data.value < o.target))
        )
          throw Error("Observed result does not meet the target");
      }
      if (
        ["partially_achieved", "not_achieved", "not_measurable", "discontinued"].includes(status) &&
        !feedback.trim()
      )
        throw Error("Record honest results and limitations");
      const measurement = {
        ...phase6Base(newId("measurement"), c),
        ...data,
        engagementId: id,
        outcomeId,
        verification: null,
      };
      const definition = o.evidenceHistory?.definitions.find(
          (d) => d.id === o.evidenceHistory?.currentDefinitionId,
        ),
        baseline = o.evidenceHistory?.baselines.find(
          (b) => b.id === o.evidenceHistory?.currentBaselineId,
        );
      if (!definition) throw Error("Versioned outcome definition required");
      o.measurements.push({
        ...measurement,
        binding: strongSeal({
          measurementId: measurement.id,
          organizationId: w.organizationId,
          engagementId: id,
          outcomeId,
          definitionId: definition.id,
          definitionValue: definition.integrityValue,
          baselineId: baseline?.id ?? "",
          baselineValue: baseline?.integrityValue ?? "",
          content: measurementContent(measurement),
          supersedesId: correction?.supersedesId ?? "",
          reason: correction?.reason ?? "",
        }),
      });
      o.status = status;
      o.feedback = feedback;
    });
  },
  async verifyMeasurement(
    ctx: Ctx,
    id: string,
    outcomeId: string,
    measurementId: string,
    evidence: string,
    comment: string,
  ) {
    return mutate(ctx, id, "verify", (_e, w, c) => {
      const outcome = w.outcomes.find((o) => o.id === outcomeId);
      if (!outcome) throw Error("Outcome unavailable");
      outcomeOwner(c, _e, w, outcome.ownerProfessionalId, outcome.workstreamId ?? "", "verify");
      const m = outcome.measurements.find((m) => m.id === measurementId);
      if (!m || !m.evidence.length || m.provenance === "estimate" || m.createdBy === c.user.id)
        throw Error("Independent observed evidence is required");
      if (!m.binding || m.verification)
        throw Error("An unverified immutable observation is required");
      m.verification = phase6Approval(c, evidence, comment);
      m.verificationBinding = strongSeal({
        measurementId: m.id,
        measurementValue: m.binding.integrityValue,
        baselineId: m.binding.baselineId,
        baselineValue: m.binding.baselineValue,
        definitionId: m.binding.definitionId,
        approval: m.verification,
        decision: "verified" as const,
      });
    });
  },
  async change(
    ctx: Ctx,
    id: string,
    input: Pick<
      z.infer<typeof ChangeSchema>,
      | "requested"
      | "reason"
      | "impact"
      | "scheduleImpact"
      | "commercialImpact"
      | "terms"
      | "revisedProposalVersionId"
    > & { obligationAmendments?: z.infer<typeof ObligationAmendmentSchema>[] },
  ) {
    const data = ChangeSchema.pick({
      requested: true,
      reason: true,
      impact: true,
      scheduleImpact: true,
      commercialImpact: true,
      terms: true,
      revisedProposalVersionId: true,
      obligationAmendments: true,
    }).parse(input);
    return mutate(ctx, id, "change", (_e, w, c) => {
      const scope = w.scopes.at(-1);
      if (!scope) throw Error("Scope unavailable");
      w.changes.push({
        ...phase6Base(newId("change"), c),
        ...data,
        engagementId: id,
        sourceScopeId: scope.id,
        status: "submitted",
        approval: null,
        scopeVersionId: "",
        revisedProposal: null,
        approvedValue: "",
      });
    });
  },
  async approveChange(
    ctx: Ctx,
    id: string,
    changeId: string,
    decision: "approved" | "rejected",
    evidence: string,
    comment: string,
  ) {
    return mutate(ctx, id, "approve_change", (_e, w, c) => {
      const change = w.changes.find((r) => r.id === changeId);
      if (!change || change.status !== "submitted" || change.sourceScopeId !== w.scopes.at(-1)?.id)
        throw Error("Change must reference the current scope");
      if (change.createdBy === c.user.id)
        throw Error("Independent scope change authorization is required");
      const previous = currentTerms(w);
      const commercial =
        canonical({
          currency: previous.currency,
          amount: previous.amount,
          period: previous.period,
          commercialBasis: previous.commercialBasis,
        }) !==
        canonical({
          currency: change.terms.currency,
          amount: change.terms.amount,
          period: change.terms.period,
          commercialBasis: change.terms.commercialBasis,
        });
      if (decision === "approved" && commercial) {
        authorize(c, "commercial", _e, w);
        if (w.initiation.source.kind === "proposal") {
          const v = issuedSource(c, change.revisedProposalVersionId);
          if (
            v.document.recipient.organization !== w.initiation.customer.name &&
            v.document.recipient.name !== w.initiation.customer.name
          )
            throw Error("Revised proposal must belong to this customer");
          change.terms = pinProposalTerms(change.terms, v, change.id);
          change.revisedProposal = structuredClone(v);
        } else if (!evidence.trim())
          throw Error("Separate direct commercial authorization is required");
      }
      change.status = decision;
      change.approval = phase6Approval(c, evidence, comment);
      change.approvedValue = changeValue(change);
    });
  },
  async applyChange(ctx: Ctx, id: string, changeId: string) {
    return mutate(ctx, id, "approve_change", (_e, w, c) => {
      const change = w.changes.find((r) => r.id === changeId);
      if (change?.status === "applied") return;
      if (
        !change ||
        change.status !== "approved" ||
        !change.approval ||
        change.sourceScopeId !== w.scopes.at(-1)?.id
      )
        throw Error("A current authorized amendment is required");
      const previous = currentTerms(w);
      if (
        canonical([
          previous.currency,
          previous.amount,
          previous.period,
          previous.commercialBasis,
          previous.pricingReference,
        ]) !==
        canonical([
          change.terms.currency,
          change.terms.amount,
          change.terms.period,
          change.terms.commercialBasis,
          change.terms.pricingReference,
        ])
      )
        authorize(c, "commercial", _e, w);
      if (change.approvedValue !== changeValue(change))
        throw Error("Approved amendment content changed");
      if (change.revisedProposal) {
        const version = issuedSource(c, change.revisedProposalVersionId);
        if (canonical(version) !== canonical(change.revisedProposal))
          throw Error("Revised issued source changed");
      }
      for (const amendment of change.obligationAmendments ?? []) {
        const prior = w.obligations?.find((o) => o.id === amendment.obligationId);
        if (
          !prior ||
          obligationStates(w)
            .find((o) => o.id === prior.id)
            ?.status.includes("amendment")
        )
          throw Error("Obligation is no longer amendable");
        if (amendment.action === "supersede")
          w.obligations?.push(
            strongSeal({
              ...prior,
              id: `obligation_${change.id}_${contentValue(prior.id)}`,
              description: amendment.description,
              criteria: amendment.criteria,
              amendmentId: change.id,
              replacesId: prior.id,
            }),
          );
      }
      change.status = "applied";
      const s = strongSeal({
        ...phase6Base(`scope_${id}_${w.scopes.length + 1}`, c),
        schema: "aurumi.cia.engagement-scope/2" as const,
        engagementId: id,
        number: w.scopes.length + 1,
        obligationIds: obligationStates(w)
          .filter((o) => !o.status.includes("by_amendment"))
          .map((o) => o.id),
        terms: change.terms,
        changeId: change.id,
        approval: change.approval,
      });
      w.scopes.push(s);
      change.status = "applied";
      change.scopeVersionId = s.id;
    });
  },
  async workstreamStatus(
    ctx: Ctx,
    id: string,
    workstreamId: string,
    status: "active" | "blocked" | "completed" | "cancelled",
  ) {
    return mutate(
      ctx,
      id,
      "plan",
      (e, w, c) => {
        const s = w.workstreams.find((s) => s.id === workstreamId);
        if (
          !s ||
          !["active", "blocked", "completed", "cancelled"].includes(status) ||
          ["completed", "cancelled"].includes(s.status)
        )
          throw Error("Workstream cannot enter that state");
        if (status === "cancelled") authorize(c, "authorize", e, w);
        if (
          status === "completed" &&
          (w.milestones.some(
            (m) =>
              m.workstreamId === s.id && m.required && m.status !== "completed" && !m.exception,
          ) ||
            w.deliverables.some(
              (d) => d.workstreamId === s.id && d.required && d.status !== "accepted",
            ))
        )
          throw Error("Required workstream milestones and deliverables remain incomplete");
        s.status = status;
      },
      workstreamId,
      ["mobilizing", "active", "on_hold"],
    );
  },
  async review(
    ctx: Ctx,
    id: string,
    input: {
      kind: z.infer<typeof import("@/domain/delivery").ReviewSchema>["kind"];
      scheduledAt: string;
      calendarReference: string;
      summary: string;
      customerFeedback: string;
      nextActions: string;
      participants: string[];
      evidence: string;
      comment: string;
      outstandingResponsibilities?: string;
    },
  ) {
    return mutate(
      ctx,
      id,
      "conduct_review",
      (_e, w, c) => {
        validateAuthorization(w);
        if (input.kind === "completion") {
          const responsibilities = input.outstandingResponsibilities ?? input.nextActions;
          if (!responsibilities.trim())
            throw Error("Completion review requires outstanding responsibilities or explicit none");
          w.completionRequirements = {
            customerFeedback: input.customerFeedback,
            outstandingResponsibilities: responsibilities,
          };
        }
        w.reviews.push(
          strongSeal({
            ...phase6Base(newId("engagement_review"), c),
            schema: "aurumi.cia.engagement-review/2" as const,
            engagementId: id,
            kind: input.kind,
            scheduledAt: input.scheduledAt,
            calendarReference: input.calendarReference,
            summary: input.summary,
            customerFeedback: input.customerFeedback,
            nextActions: input.nextActions,
            participants: input.participants,
            milestoneResults: w.milestones.map((m) => ({ id: m.id, status: m.status })),
            deliverableResults: w.deliverables.map((d) => ({
              id: d.id,
              versionId: d.versions.at(-1)?.id ?? "",
              status: d.status,
            })),
            measurementIds: w.outcomes.flatMap((o) => o.measurements.map((m) => m.id)),
            concernIds: w.concerns.map((r) => r.id),
            outcomeEvidence: structuredClone(w.outcomes),
            binding: strongSeal({
              engagementId: id,
              organizationId: w.organizationId,
              state: completionState(w),
              stateValue: contentValue(completionState(w)),
            }),
            approval: phase6Approval(c, input.evidence, input.comment),
          }),
        );
      },
      undefined,
      ["mobilizing", "active", "on_hold", "completion_review"],
    );
  },
  async complete(
    ctx: Ctx,
    id: string,
    input: {
      evidence: string;
      comment: string;
      summary: string;
      customerFeedback: string;
      outstandingResponsibilities: string;
    },
  ) {
    const prior = load(ctx, id, "complete");
    if (prior.e.status === "completed" && prior.w.completion) return getView(ctx, id);
    return mutate(
      ctx,
      id,
      "complete",
      (e, w, c) => {
        validateAuthorization(w);
        const problems = completionProblems(w);
        if (
          input.customerFeedback !== w.completionRequirements?.customerFeedback ||
          input.outstandingResponsibilities !==
            w.completionRequirements?.outstandingResponsibilities
        )
          problems.push(
            "Completion responsibilities or customer acceptance differ from the reviewed state",
          );
        if (problems.length) throw Error(problems.join("; "));
        if (!input.outstandingResponsibilities.trim() || !input.summary.trim())
          throw Error(
            "Completion summary and outstanding responsibilities (or explicit none) are required",
          );
        const finalDecision = phase6Approval(c, input.evidence, input.comment);
        w.lifecycleHistory?.push(
          strongSeal({
            id: `lifecycle_completion_${id}`,
            engagementId: id,
            organizationId: w.organizationId,
            from: e.status,
            to: "completed",
            authorizationValue: AuthorizationSchema.parse(w.authorization).integrityValue,
            approval: finalDecision,
          }),
        );
        w.completion = strongSeal({
          ...phase6Base(`completion_${id}`, c),
          schema: "aurumi.cia.engagement-completion/2" as const,
          engagementId: id,
          initiation: w.initiation,
          authorization: AuthorizationSchema.parse(w.authorization),
          lifecycleHistory: w.lifecycleHistory ?? [],
          obligations: w.obligations ?? [],
          obligationMappings: w.obligationMappings ?? [],
          changes: w.changes,
          ...(w.completionRequirements ? { completionRequirements: w.completionRequirements } : {}),
          scopes: w.scopes,
          assignments: w.assignments,
          workstreams: w.workstreams,
          milestones: w.milestones,
          deliverables: w.deliverables,
          outcomes: w.outcomes,
          concerns: w.concerns,
          reviews: w.reviews,
          continuations: w.continuations,
          customerFeedback: input.customerFeedback,
          outstandingResponsibilities: input.outstandingResponsibilities,
          executiveSummary: input.summary,
          decision: finalDecision,
        });
        e.status = "completed";
      },
      undefined,
      ["completion_review"],
    );
  },
  async task(
    ctx: Ctx,
    id: string,
    input: { key: string; workstreamId: string; milestoneId: string; title: string },
  ) {
    const data = z
      .strictObject({
        key: z.string().min(1),
        workstreamId: z.string().min(1),
        milestoneId: z.string(),
        title: z.string().min(1),
      })
      .parse(input);
    return external(
      ctx,
      id,
      data.key,
      "task",
      `task_${contentValue(data.key)}`,
      data,
      data.workstreamId,
      (w, op, c) => {
        if (w.tasks.some((t) => t.operationId === op.id)) return;
        w.tasks.push({
          ...phase6Base(op.targetId, c),
          engagementId: id,
          workstreamId: data.workstreamId,
          milestoneId: data.milestoneId,
          operationId: op.id,
          reference: op.reference,
          title: data.title,
          status: "open",
          evidence: [],
          simulated: true,
        });
      },
    );
  },
  async taskEvidence(ctx: Ctx, id: string, taskId: string, evidence: string[]) {
    const t = load(ctx, id).w.tasks.find((t) => t.id === taskId);
    if (!t) throw Error("Linked task unavailable");
    return mutate(
      ctx,
      id,
      "plan",
      (_e, w) => {
        const task = w.tasks.find((t) => t.id === taskId);
        if (!task || !evidence.length) throw Error("Task completion evidence is required");
        task.evidence = evidence;
        task.status = "completed";
      },
      t.workstreamId,
      ["active", "on_hold"],
    );
  },
  async continuation(
    ctx: Ctx,
    id: string,
    input: Pick<
      z.infer<typeof ContinuationSchema>,
      "kind" | "recommendation" | "customerNeed" | "evidence"
    >,
  ) {
    const data = ContinuationSchema.pick({
      kind: true,
      recommendation: true,
      customerNeed: true,
      evidence: true,
    }).parse(input);
    return mutate(
      ctx,
      id,
      "continue",
      (_e, w, c) =>
        w.continuations.push({
          ...phase6Base(newId("continuation"), c),
          ...data,
          engagementId: id,
          obligation: false,
          opportunityReference: "",
        }),
      undefined,
      ["active", "on_hold", "completion_review"],
    );
  },
  async handoffContinuation(ctx: Ctx, id: string, continuationId: string, key: string) {
    const r = load(ctx, id).w.continuations.find((r) => r.id === continuationId);
    if (!r || !r.evidence.length) throw Error("Continuation needs customer needs and evidence");
    return external(
      ctx,
      id,
      key,
      "continuation",
      r.id,
      { recommendation: r.recommendation, customerNeed: r.customerNeed },
      "",
      (w, op) => {
        const item = w.continuations.find((r) => r.id === op.targetId);
        if (!item) throw Error("Continuation unavailable");
        if (item.opportunityReference && item.opportunityReference !== op.reference)
          throw Error("Continuation already has a different opportunity");
        item.opportunityReference = op.reference;
      },
    );
  },
  async demand(ctx: Ctx, id: string, concernId: string, key: string, theme: string) {
    const r = load(ctx, id).w.concerns.find((r) => r.id === concernId);
    if (!r || r.kind !== "gap") throw Error("A product capability gap is required");
    if (!theme.trim()) throw Error("A de-identified capability theme is required");
    const w = load(ctx, id).w;
    if (
      theme.toLowerCase().includes(w.initiation.customer.name.toLowerCase()) ||
      theme.includes(w.initiation.customer.reference)
    )
      throw Error("Do not include customer identity in a Demand Studio theme");
    return external(
      ctx,
      id,
      key,
      "demand",
      r.id,
      { theme, verification: r.verification, commitment: false },
      r.workstreamId,
      () => {},
    );
  },
  async signals(ctx: Ctx, id: string) {
    const initial = load(ctx, id),
      value = fingerprint(initial.e, initial.w);
    const signals = await deliveryAdapters.signals(initial.w.initiation.customer.reference);
    const current = load(ctx, id);
    if (fingerprint(current.e, current.w) !== value)
      throw Error("Engagement changed during signal retrieval");
    return signals;
  },
};

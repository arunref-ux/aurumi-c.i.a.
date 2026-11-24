/**
 * C.I.A. Workspace v1.0 — core domain model.
 * Every persisted entity extends BaseRecord: immutable id, audit fields and an
 * organization boundary. Scope fields (ownerId/teamId/assignedUserIds) drive
 * Self/Team/Organization authorization in the service layer.
 */
export type ID = string;
export type ISODate = string;

export interface BaseRecord {
  readonly id: ID;
  readonly organizationId: ID;
  readonly createdAt: ISODate;
  readonly createdBy: ID;
  updatedAt: ISODate;
  updatedBy: ID;
}

export interface ScopedRecord extends BaseRecord {
  ownerId: ID;
  teamId: ID;
  assignedUserIds: ID[];
}

/** §2.2 — every statement carries its epistemic status. */
export type EvidenceStatus =
  | "confirmed_fact"
  | "research_finding"
  | "ai_inference"
  | "recommendation"
  | "commercial_proposal"
  | "approved_commitment"
  /** A professional's working assumption — never presented as fact. */
  | "professional_assumption";

export type ReadinessLevel = "available" | "beta" | "planned" | "not_supported" | "unknown";
export type AcquisitionChannel =
  "direct" | "website_self" | "website_boss" | "partner_referral" | "existing_tenant";

// ---------- Core / Assessments ----------
export type AssessmentType = "tenant" | "partner";
/**
 * Lifecycle: draft → in_progress → under_review → approved | returned.
 * Generic updates may only move between draft/in_progress (and out of returned);
 * every other transition goes through the dedicated workflow in assessment-studio.ts.
 * "completed" is a legacy Phase 1 status kept for existing records.
 */
export type AssessmentStatus =
  "draft" | "in_progress" | "under_review" | "returned" | "approved" | "completed" | "archived";

export interface Assessment extends ScopedRecord {
  type: AssessmentType;
  title: string;
  subjectName: string;
  status: AssessmentStatus;
  channel: AcquisitionChannel;
  crmReferenceId?: ID;
  tenantReferenceId?: ID;
  scenarioCode?: string;
}
export interface AssessmentParticipant extends BaseRecord {
  assessmentId: ID;
  name: string;
  role: string;
  email?: string;
  isDecisionMaker: boolean;
}
export interface BusinessProfile extends BaseRecord {
  assessmentId: ID;
  industry: string;
  country: string;
  employeeBand: string;
  locations: number;
  summary: string;
}
export interface BusinessFunction extends BaseRecord {
  assessmentId: ID;
  name: string;
  owner?: string;
}
export interface WorkflowObservation extends BaseRecord {
  assessmentId: ID;
  businessFunctionId: ID;
  description: string;
  isManual: boolean;
  status: EvidenceStatus;
}
export interface ExistingSystem extends BaseRecord {
  assessmentId: ID;
  name: string;
  vendor?: string;
  category: string;
  /** Present only when the product exists in Aurumi's catalog. */
  catalogCapabilityId?: ID;
  externalSoftwareReferenceId?: ID;
  connectorReadiness: ReadinessLevel;
}
export interface ExternalSoftwareReference extends BaseRecord {
  name: string;
  vendor: string;
  website?: string;
  category: string;
  integrationReadiness: ReadinessLevel;
  evidenceIds: ID[];
}
// ---------- Research provenance (shared by evidence records and the research adapter) ----------
export type SourceType =
  | "vendor_site"
  | "vendor_documentation"
  | "third_party"
  | "curated_catalog"
  | "interview"
  | "ai_model";
export interface SourceProvenance {
  title: string;
  url?: string;
  publisher?: string;
  sourceType: SourceType;
  /** When the source was fetched/consulted (research time, not record time). */
  retrievedAt: ISODate;
  /** When the stated fact was observed or published at the source, if known. */
  observedAt?: ISODate;
}
/** Confidence with explicit unknown semantics — never a silent default. */
export type Confidence =
  | { level: "high" | "medium" | "low"; score?: number; rationale?: string }
  | { level: "unknown"; reason: string };
export type Verification =
  | { state: "unverified" }
  | { state: "verified"; verifiedBy: ID; verifiedAt: ISODate; method: string }
  | { state: "disputed"; reviewedBy: ID; reviewedAt: ISODate; note: string };
export interface ResearchFinding {
  /** Which attribute the finding is about, e.g. "vendor" or "integration_readiness". */
  attribute: string;
  statement: string;
  status: EvidenceStatus;
  sources: SourceProvenance[];
  /** When the research was performed — distinct from BaseRecord.createdAt. */
  researchedAt: ISODate;
  confidence: Confidence;
  verification: Verification;
  /** Required for ai_inference: the model/system that produced it. */
  generatedBy?: string;
}
export interface ResearchEvidence extends BaseRecord, ResearchFinding {
  subjectId: ID;
}
export interface BusinessChallenge extends BaseRecord {
  assessmentId: ID;
  title: string;
  impact: "low" | "medium" | "high";
  status: EvidenceStatus;
}
export interface DesiredOutcome extends BaseRecord {
  assessmentId: ID;
  title: string;
  metric?: string;
  target?: string;
}

// ---------- Solutions ----------
export interface SolutionRecommendation extends ScopedRecord {
  assessmentId: ID;
  title: string;
  category: "native_app" | "connector" | "ai_capability" | "process_change" | "future_capability";
  rationale: string;
  status: EvidenceStatus;
  capabilityReferenceId?: ID;
  readiness: ReadinessLevel;
}
export interface RecommendedOffering extends BaseRecord {
  recommendationId: ID;
  capabilityReferenceId: ID;
  quantity?: number;
}
export interface IntegrationAssessment extends BaseRecord {
  existingSystemId: ID;
  readiness: ReadinessLevel;
  notes: string;
  evidenceIds: ID[];
}
export interface ValueAssumption extends BaseRecord {
  recommendationId: ID;
  description: string;
  estimatedValue?: number;
  currency?: string;
  status: EvidenceStatus;
}
export interface SolutionPackage extends ScopedRecord {
  assessmentId: ID;
  name: string;
  recommendationIds: ID[];
}

// ---------- Proposals ----------
export type ProposalTrack =
  "tenant_solution" | "tenant_commercial" | "reseller_partner" | "strategic_partner";
/** "shared" is the issued state; "changes_requested" is set only by Proposal Studio review. */
export type ProposalStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "shared"
  | "accepted"
  | "declined"
  | "expired";

export interface Proposal extends ScopedRecord {
  assessmentId: ID;
  title: string;
  track: ProposalTrack;
  status: ProposalStatus;
  currentVersionId?: ID;
  includesPricing: boolean;
  /** Proposal Studio records only: the pinned approved solution snapshot. */
  source?: import("./proposal").ProposalSource;
  /** Proposal Studio records only: working revision (increments on rebase / revise). */
  revision?: number;
}
/** Immutable snapshot — issued documents never change when sources are edited. */
export interface ProposalVersion extends BaseRecord {
  proposalId: ID;
  versionNumber: number;
  snapshot: Readonly<Record<string, unknown>>;
  note?: string;
}
export interface ProposalSection extends BaseRecord {
  proposalVersionId: ID;
  key: string;
  title: string;
  body: string;
  order: number;
}
export interface CommercialScenario extends BaseRecord {
  proposalId: ID;
  kind: "indicative_published" | "proposed_partner_terms";
  /** Proposed terms never alter published pricing (Pricing Studio stays authoritative). */
  status: EvidenceStatus;
  currency: string;
}
export interface CommercialLineItem extends BaseRecord {
  scenarioId: ID;
  description: string;
  pricingReferenceId?: ID;
  quantity: number;
  unitAmount: number;
}
export interface PricingReference extends BaseRecord {
  catalogItemId: ID;
  priceBookVersion: string;
  quoteReference?: string;
  retrievedAt: ISODate;
}
export interface ProposalApproval extends BaseRecord {
  proposalVersionId: ID;
  reviewerId: ID;
  decision: "pending" | "approved" | "changes_requested";
  comment?: string;
}
export interface ProposalShare extends BaseRecord {
  proposalVersionId: ID;
  recipientEmail: string;
  sharedAt: ISODate;
  expiresAt?: ISODate;
}

// ---------- Engagements ----------
export type EngagementStatus =
  | "planned"
  | "draft"
  | "pending_authorization"
  | "authorized"
  | "mobilizing"
  | "active"
  | "on_hold"
  | "completion_review"
  | "completed"
  | "cancelled";
export interface Engagement extends ScopedRecord {
  proposalId: ID;
  title: string;
  status: EngagementStatus;
  tenantSuccessReferenceId?: ID;
  /** Phase 6 rows are governed exclusively by the delivery service. Legacy seed rows remain unchanged. */
  deliverySchema?: "aurumi.cia.engagement/1";
  initiationId?: ID;
}
export interface EngagementMilestone extends BaseRecord {
  engagementId: ID;
  title: string;
  dueDate: ISODate;
  done: boolean;
}
export interface OutcomeRegisterEntry extends BaseRecord {
  engagementId: ID;
  outcome: string;
  baseline?: string;
  current?: string;
}
export interface EngagementAssignment extends BaseRecord {
  engagementId: ID;
  professionalId: ID;
  role: string;
}

// ---------- C.I.A. Network ----------
export type CertificationLevel = "associate" | "professional" | "senior" | "principal";
export interface CIAProfessional extends BaseRecord {
  userId: ID;
  displayName: string;
  title: string;
  region: string;
  certificationLevel: CertificationLevel;
  affiliationId?: ID;
}
export interface CIAAffiliation extends BaseRecord {
  name: string;
  kind: "aurumi" | "partner";
}
export interface CIACertification extends BaseRecord {
  professionalId: ID;
  level: CertificationLevel;
  issuedAt: ISODate;
  expiresAt?: ISODate;
}
export interface CIAAssignment extends BaseRecord {
  professionalId: ID;
  resourceType: ResourceType;
  resourceId: ID;
}

// ---------- Integration references ----------
export interface CRMReference extends BaseRecord {
  kind: "organization" | "contact" | "lead" | "deal";
  externalId: string;
  displayName: string;
}
export interface TenantReference extends BaseRecord {
  externalTenantId: string;
  displayName: string;
}
export interface CapabilityReference extends BaseRecord {
  source: "devharmony" | "ai_studio" | "connector_catalog";
  externalId: string;
  name: string;
  readiness: ReadinessLevel;
}
export interface SubscriptionReference extends BaseRecord {
  externalSubscriptionId: string;
  status: string;
}
export interface IntegrationSyncRecord extends BaseRecord {
  adapter: string;
  operation: string;
  outcome: "success" | "failure";
  message?: string;
}

// ---------- Platform ----------
export type ResourceType = "assessment" | "proposal" | "engagement" | "solution" | "professional";

export interface Team extends BaseRecord {
  name: string;
}
export interface User {
  id: ID;
  organizationId: ID;
  name: string;
  email: string;
  teamId: ID;
  roles: RoleKey[];
  affiliation: "aurumi" | "partner";
}
export type RoleKey =
  | "cia_admin"
  | "cia_manager"
  | "cia_professional"
  | "partner_manager"
  | "proposal_reviewer"
  | "public_visitor";

export interface AuditEvent {
  id: ID;
  at: ISODate;
  /** Scope metadata so audit reads can be filtered by organization/team/owner. */
  organizationId: ID;
  teamId?: ID;
  ownerId?: ID;
  actorId: ID;
  action: string;
  resourceType: ResourceType | "system";
  resourceId?: ID;
  summary: string;
  outcome: "allowed" | "denied";
}

// ---------- Write inputs (runtime allowlists live in src/data/repositories.ts) ----------
type Assignable = { ownerId?: ID; teamId?: ID; assignedUserIds?: ID[] };
export type AssessmentCreateInput = Assignable &
  Pick<Assessment, "type" | "title" | "subjectName" | "channel"> &
  Partial<Pick<Assessment, "status" | "crmReferenceId" | "tenantReferenceId" | "scenarioCode">>;
export type AssessmentUpdateInput = Assignable &
  Partial<
    Pick<
      Assessment,
      "title" | "subjectName" | "status" | "channel" | "crmReferenceId" | "tenantReferenceId"
    >
  >;
export type ProposalCreateInput = Assignable &
  Pick<Proposal, "assessmentId" | "title" | "track"> &
  Partial<Pick<Proposal, "status" | "includesPricing">>;
export type ProposalUpdateInput = Assignable &
  Partial<Pick<Proposal, "title" | "status" | "includesPricing">>;
export type EngagementCreateInput = Assignable &
  Pick<Engagement, "proposalId" | "title"> &
  Partial<Pick<Engagement, "status" | "tenantSuccessReferenceId">>;
export type EngagementUpdateInput = Assignable &
  Partial<Pick<Engagement, "title" | "status" | "tenantSuccessReferenceId">>;

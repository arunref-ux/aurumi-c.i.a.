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
  | "approved_commitment";

export type ReadinessLevel = "available" | "beta" | "planned" | "not_supported" | "unknown";
export type AcquisitionChannel = "direct" | "website_self" | "website_boss" | "partner_referral" | "existing_tenant";

// ---------- Core / Assessments ----------
export type AssessmentType = "tenant" | "partner";
export type AssessmentStatus = "draft" | "in_progress" | "under_review" | "completed" | "archived";

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
export interface ResearchEvidence extends BaseRecord {
  subjectId: ID;
  statement: string;
  status: EvidenceStatus;
  sourceUrl?: string;
  sourceTitle?: string;
  verifiedBy?: ID;
  verifiedAt?: ISODate;
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
export type ProposalTrack = "tenant_solution" | "tenant_commercial" | "reseller_partner" | "strategic_partner";
export type ProposalStatus = "draft" | "in_review" | "approved" | "shared" | "accepted" | "declined" | "expired";

export interface Proposal extends ScopedRecord {
  assessmentId: ID;
  title: string;
  track: ProposalTrack;
  status: ProposalStatus;
  currentVersionId?: ID;
  includesPricing: boolean;
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
export type EngagementStatus = "planned" | "active" | "on_hold" | "completed";
export interface Engagement extends ScopedRecord {
  proposalId: ID;
  title: string;
  status: EngagementStatus;
  tenantSuccessReferenceId?: ID;
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
  actorId: ID;
  action: string;
  resourceType: ResourceType | "system";
  resourceId?: ID;
  summary: string;
  outcome: "allowed" | "denied";
}

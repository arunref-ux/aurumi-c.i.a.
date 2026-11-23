/**
 * Assessment Studio domain (Phase 2). One working document per assessment holds
 * its child records; children carry their own stable ids and audit fields but
 * inherit authorization from the parent assessment.
 */
import type {
  Assessment,
  AssessmentType,
  BaseRecord,
  EvidenceStatus,
  ID,
  ISODate,
  ResearchFinding,
} from "./types";

export type SectionKey =
  | "overview"
  | "profile"
  | "partner"
  | "systems"
  | "processes"
  | "requirements"
  | "evidence"
  | "findings"
  | "questions"
  | "review";

/** Child records keep the BaseRecord shape (stable id + audit) without their own scope fields. */
export type ChildRecord = BaseRecord;

export interface OverviewData {
  primaryContact: string;
  purpose: string;
  scope: string;
  summary: string;
}

export const PROFILE_FIELDS = [
  ["businessName", "Business name"],
  ["industry", "Industry"],
  ["geography", "Geography & locations"],
  ["businessSize", "Business size"],
  ["employees", "Employee count or range"],
  ["businessModel", "Business model"],
  ["departments", "Departments / functions"],
  ["operations", "Primary operational activities"],
  ["stakeholders", "Key stakeholders"],
  ["digitalMaturity", "Existing digital maturity"],
  ["constraints", "Regulatory or operating constraints"],
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number][0];
/** Empty string = not yet assessed; listed in `unknown` = explicitly unknown. Nothing is invented. */
export type ProfileData = Record<ProfileField, string> & { unknown: ProfileField[] };

export const PARTNER_FIELDS = [
  ["partnerCategory", "Partner category"],
  ["products", "Software products / platforms"],
  ["customerSegments", "Customer segments"],
  ["geographicCoverage", "Geographic coverage"],
  ["installedBase", "Installed customer base (if known)"],
  ["apiPossibilities", "APIs & integration possibilities"],
  ["objectives", "Partnership objectives"],
  ["distribution", "Distribution / reseller capabilities"],
  ["dependencies", "Technical & commercial dependencies"],
  ["useCases", "Potential use cases for Aurumi"],
  ["openTechnicalQuestions", "Open technical questions"],
] as const;
export type PartnerField = (typeof PARTNER_FIELDS)[number][0];
/**
 * Partner extension. `relationshipStatus` is always "prospective" in V1.0:
 * no partnership, connector or commercial agreement is implied.
 */
export type PartnerExtension = Record<PartnerField, string> & {
  relationshipStatus: "prospective";
};

export const SYSTEM_CLASSIFICATIONS = {
  commercial: "Commercial third-party software",
  custom: "Custom-built software",
  spreadsheet: "Spreadsheets",
  manual: "Manual / paper process",
  legacy: "Legacy / on-premise system",
  unknown: "Unknown / uncatalogued",
} as const;
export type SystemClassification = keyof typeof SYSTEM_CLASSIFICATIONS;
export const DEPLOYMENTS = {
  cloud: "Cloud / SaaS",
  on_premise: "On-premise",
  hybrid: "Hybrid",
  desktop: "Desktop",
  paper: "Paper / offline",
  unknown: "Unknown",
} as const;
export const SATISFACTION = {
  unknown: "Unknown",
  low: "Low",
  medium: "Medium",
  high: "High",
} as const;
export const API_AVAILABILITY = {
  unknown: "Unknown",
  available: "Available",
  partial: "Partial",
  none: "Not available",
} as const;
/**
 * Connector compatibility with Aurumi — separate from inventory membership.
 * Anything other than unknown/not_supported needs linked verified evidence.
 */
export const COMPATIBILITY = {
  unknown: "Unknown — not assessed",
  not_supported: "Not supported",
  planned: "Planned (verified)",
  beta: "Beta (verified)",
  supported: "Supported (verified)",
} as const;
export type CompatibilityStatus = keyof typeof COMPATIBILITY;
export const POSITIVE_COMPATIBILITY: CompatibilityStatus[] = ["planned", "beta", "supported"];

export interface InventorySystem extends ChildRecord {
  name: string;
  vendor: string;
  category: string;
  classification: SystemClassification;
  deployment: keyof typeof DEPLOYMENTS;
  departments: string;
  processesSupported: string;
  userCount: string;
  usage: string;
  satisfaction: keyof typeof SATISFACTION;
  limitations: string;
  integrationNeeds: string;
  apiAvailability: keyof typeof API_AVAILABILITY;
  notes: string;
  evidenceIds: ID[];
  compatibility: { status: CompatibilityStatus; evidenceIds: ID[]; note: string };
}

export const LEVELS = { low: "Low", medium: "Medium", high: "High", critical: "Critical" } as const;
export type Level = keyof typeof LEVELS;
export const FREQUENCY = {
  unknown: "Unknown",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  occasional: "Occasional",
} as const;

export interface ProcessRecord extends ChildRecord {
  department: string;
  name: string;
  currentProcess: string;
  relatedSystemIds: ID[];
  evidenceIds: ID[];
}
export interface PainPoint extends ChildRecord {
  processId: ID;
  description: string;
  impact: string;
  frequency: keyof typeof FREQUENCY;
  severity: Level;
  priority: Level;
  desiredOutcome: string;
  workaround: string;
  relatedSystemIds: ID[];
  evidenceIds: ID[];
}

export const REQUIREMENT_CATEGORIES = {
  objective: "Business objective",
  required_capability: "Required capability",
  preferred_capability: "Preferred capability",
  workflow: "Workflow requirement",
  reporting: "Reporting & intelligence",
  ai: "AI / conversational",
  security: "Security / privacy",
  integration: "Integration",
  budget: "Budget expectation",
  timeline: "Timeline expectation",
  constraint: "Constraint / dependency",
} as const;
export interface Requirement extends ChildRecord {
  category: keyof typeof REQUIREMENT_CATEGORIES;
  statement: string;
  /** Confirmed by the business vs. a working assumption — kept separate everywhere. */
  basis: "confirmed" | "assumption";
  priority: Level;
  evidenceIds: ID[];
}

export type EvidenceLinkKind = "system" | "process" | "pain_point" | "requirement" | "finding";
export interface EvidenceRecord extends ChildRecord, ResearchFinding {
  links: { kind: EvidenceLinkKind; id: ID }[];
  notes: string;
}
/** The four classes users must be able to tell apart (§4F). */
export const EVIDENCE_CLASSES: Partial<Record<EvidenceStatus, string>> = {
  confirmed_fact: "Verified fact",
  research_finding: "Unverified reported information",
  ai_inference: "AI-generated inference",
  professional_assumption: "Professional assumption",
};
export function evidenceLabel(e: Pick<ResearchFinding, "status" | "verification">): string {
  if (e.status === "research_finding" && e.verification.state === "verified")
    return "Verified research finding";
  return EVIDENCE_CLASSES[e.status] ?? e.status;
}

export const FINDING_FIELDS = [
  ["environment", "Current operating environment"],
  ["problems", "Major business problems"],
  ["landscape", "Existing software landscape"],
  ["opportunities", "Key opportunities"],
  ["constraints", "Important constraints"],
  ["missingInformation", "Missing information"],
  ["risks", "Risks & dependencies"],
  ["nextSteps", "Recommended next investigative steps"],
] as const;
export type FindingField = (typeof FINDING_FIELDS)[number][0];
export type FindingsData = Record<FindingField, string>;

export interface QuestionTemplate {
  id: ID;
  assessmentTypes: AssessmentType[];
  /** Business category this applies to; "general" applies to all. */
  category: string;
  section: SectionKey;
  prompt: string;
  required: boolean;
}
export interface CustomQuestion
  extends ChildRecord, Omit<QuestionTemplate, "assessmentTypes" | "id"> {}
export type AnswerState = "unanswered" | "answered" | "not_applicable";
export interface Answer {
  questionId: ID;
  state: AnswerState;
  value: string;
  answeredBy?: ID;
  answeredAt?: ISODate;
  verifiedBy?: ID;
  verifiedAt?: ISODate;
}
export interface OpenQuestion extends ChildRecord {
  text: string;
  resolved: boolean;
}
export interface ReviewComment extends ChildRecord {
  kind: "comment" | "submitted" | "returned" | "approved" | "reopened";
  body: string;
}

export interface AssessmentWorkspace extends BaseRecord {
  assessmentId: ID;
  category: string;
  overview: OverviewData;
  profile: ProfileData;
  partner?: PartnerExtension;
  systems: InventorySystem[];
  processes: ProcessRecord[];
  painPoints: PainPoint[];
  requirements: Requirement[];
  evidence: EvidenceRecord[];
  findings: FindingsData;
  customQuestions: CustomQuestion[];
  answers: Answer[];
  openQuestions: OpenQuestion[];
  reviewerId?: ID;
  reviewComments: ReviewComment[];
}

/** Versioned, immutable hand-off for Solution Studio (Phase 3 consumer). */
export const HANDOFF_SCHEMA = "aurumi.cia.assessment-handoff/1" as const;
export interface AssessmentHandoffSnapshot {
  readonly schema: typeof HANDOFF_SCHEMA;
  readonly id: ID;
  readonly organizationId: ID;
  readonly assessmentId: ID;
  readonly version: number;
  readonly createdAt: ISODate;
  readonly approval: {
    readonly approvedBy: ID;
    readonly approvedAt: ISODate;
    readonly comment: string;
  };
  readonly assessment: Readonly<
    Pick<Assessment, "id" | "type" | "title" | "subjectName" | "channel" | "crmReferenceId">
  >;
  readonly overview: Readonly<OverviewData>;
  readonly profile: Readonly<ProfileData>;
  readonly partner?: Readonly<PartnerExtension>;
  readonly systems: readonly InventorySystem[];
  readonly processes: readonly ProcessRecord[];
  readonly painPoints: readonly PainPoint[];
  readonly requirements: readonly Requirement[];
  readonly evidence: readonly EvidenceRecord[];
  readonly findings: Readonly<FindingsData>;
  readonly answers: readonly Answer[];
  readonly outstandingQuestions: readonly OpenQuestion[];
}

const emptyOf = <K extends string>(fields: readonly (readonly [K, string])[]) =>
  Object.fromEntries(fields.map(([k]) => [k, ""])) as Record<K, string>;
export const emptyProfile = (businessName = ""): ProfileData => ({
  ...emptyOf(PROFILE_FIELDS),
  businessName,
  unknown: [],
});
export const emptyPartner = (): PartnerExtension => ({
  ...emptyOf(PARTNER_FIELDS),
  relationshipStatus: "prospective",
});
export const emptyFindings = (): FindingsData => emptyOf(FINDING_FIELDS);

// ---------- Questions ----------
export function questionsFor(
  ws: Pick<AssessmentWorkspace, "category" | "customQuestions">,
  type: AssessmentType,
  bank: readonly QuestionTemplate[],
): (QuestionTemplate | CustomQuestion)[] {
  const fromBank = bank.filter(
    (q) =>
      q.assessmentTypes.includes(type) && (q.category === "general" || q.category === ws.category),
  );
  return [...fromBank, ...ws.customQuestions];
}

// ---------- Completeness & readiness (derived, never stored) ----------
export interface SectionStatus {
  key: SectionKey;
  label: string;
  complete: boolean;
  missing: string[];
}
const filled = (s: string | undefined) => !!s && s.trim().length > 0;

export function sectionStatuses(
  a: Pick<Assessment, "type">,
  ws: AssessmentWorkspace,
  bank: readonly QuestionTemplate[],
): SectionStatus[] {
  const out: SectionStatus[] = [];
  const add = (key: SectionKey, label: string, missing: string[]) =>
    out.push({ key, label, complete: missing.length === 0, missing });

  add(
    "overview",
    "Overview",
    [
      !filled(ws.overview.purpose) && "Purpose",
      !filled(ws.overview.scope) && "Scope",
      !filled(ws.overview.primaryContact) && "Primary contact",
    ].filter(Boolean) as string[],
  );
  const coreProfile: ProfileField[] = [
    "businessName",
    "industry",
    "geography",
    "employees",
    "businessModel",
  ];
  add(
    "profile",
    "Business profile",
    coreProfile
      .filter((f) => !filled(ws.profile[f]) && !ws.profile.unknown.includes(f))
      .map((f) => PROFILE_FIELDS.find(([k]) => k === f)![1]),
  );
  if (a.type === "partner") {
    const p = ws.partner;
    const core: PartnerField[] = ["partnerCategory", "products", "objectives"];
    add(
      "partner",
      "Partner details",
      core.filter((f) => !p || !filled(p[f])).map((f) => PARTNER_FIELDS.find(([k]) => k === f)![1]),
    );
  }
  add(
    "systems",
    "Software & systems",
    ws.systems.length ? [] : ["At least one system or process tool"],
  );
  add(
    "processes",
    "Processes & pain points",
    [
      !ws.processes.length && "At least one process",
      !ws.painPoints.length && "At least one pain point",
    ].filter(Boolean) as string[],
  );
  add(
    "requirements",
    "Goals & requirements",
    ws.requirements.some((r) => r.basis === "confirmed")
      ? []
      : ["At least one confirmed requirement"],
  );
  add("evidence", "Research & evidence", ws.evidence.length ? [] : ["At least one evidence entry"]);
  add(
    "findings",
    "Findings & summary",
    (["environment", "problems", "opportunities", "nextSteps"] as FindingField[])
      .filter((f) => !filled(ws.findings[f]))
      .map((f) => FINDING_FIELDS.find(([k]) => k === f)![1]),
  );
  const unanswered = questionsFor(ws, a.type, bank).filter(
    (q) =>
      q.required &&
      (ws.answers.find((x) => x.questionId === q.id)?.state ?? "unanswered") === "unanswered",
  );
  add(
    "questions",
    "Questions",
    unanswered.map((q) => q.prompt),
  );
  return out;
}

export function completeness(statuses: SectionStatus[]): number {
  if (!statuses.length) return 0;
  return Math.round((statuses.filter((s) => s.complete).length / statuses.length) * 100);
}

/** Claims that matter for hand-off but nobody has verified yet. */
export function unverifiedCriticalClaims(ws: AssessmentWorkspace): EvidenceRecord[] {
  return ws.evidence.filter(
    (e) =>
      e.verification.state !== "verified" &&
      (e.status === "research_finding" || e.status === "ai_inference") &&
      e.links.some((l) => l.kind === "system" || l.kind === "requirement"),
  );
}

export type Readiness = "incomplete" | "ready_for_review" | "in_review" | "returned" | "approved";
export function readiness(a: Pick<Assessment, "status">, statuses: SectionStatus[]): Readiness {
  if (a.status === "approved") return "approved";
  if (a.status === "under_review") return "in_review";
  if (a.status === "returned") return "returned";
  return statuses.every((s) => s.complete) ? "ready_for_review" : "incomplete";
}

/** Deep-freezes a value so a snapshot cannot be mutated through any reference. */
export function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

export function buildHandoffSnapshot(
  a: Assessment,
  ws: AssessmentWorkspace,
  meta: { id: ID; version: number; approvedBy: ID; approvedAt: ISODate; comment: string },
): AssessmentHandoffSnapshot {
  const c = structuredClone(ws);
  const snap: AssessmentHandoffSnapshot = {
    schema: HANDOFF_SCHEMA,
    id: meta.id,
    organizationId: a.organizationId,
    assessmentId: a.id,
    version: meta.version,
    createdAt: meta.approvedAt,
    approval: { approvedBy: meta.approvedBy, approvedAt: meta.approvedAt, comment: meta.comment },
    assessment: {
      id: a.id,
      type: a.type,
      title: a.title,
      subjectName: a.subjectName,
      channel: a.channel,
      ...(a.crmReferenceId ? { crmReferenceId: a.crmReferenceId } : {}),
    },
    overview: c.overview,
    profile: c.profile,
    ...(c.partner ? { partner: c.partner } : {}),
    systems: c.systems,
    processes: c.processes,
    painPoints: c.painPoints,
    requirements: c.requirements,
    evidence: c.evidence,
    findings: c.findings,
    answers: c.answers,
    outstandingQuestions: c.openQuestions.filter((q) => !q.resolved),
  };
  return deepFreeze(snap);
}

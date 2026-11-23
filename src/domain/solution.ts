/**
 * Solution Studio domain (Phase 3). A solution design is built only from an
 * immutable, approved assessment hand-off snapshot (schema /2) and never from
 * mutable assessment drafts. One working document per solution holds its child
 * records; children inherit the parent's authorization.
 */
import {
  HANDOFF_SCHEMA,
  materialEvidenceKey,
  type AssessmentHandoffSnapshot,
  type EvidenceRecord,
} from "./assessment";
import type { BaseRecord, ID, ISODate, ScopedRecord } from "./types";

// ---------- Catalog (read-only, versioned; owned by other Aurumi apps) ----------
export const CATALOG_KINDS = {
  native_app: "Native app / feature (DevHarmony)",
  connector: "Connector (connector registry)",
  ai_capability: "AI capability / Business Skill (AI Studio)",
  roadmap: "Roadmap / custom — proposed, not published",
} as const;
export type CatalogKind = keyof typeof CATALOG_KINDS;
export const CATALOG_READINESS = {
  available: "Available",
  beta: "Implemented — beta / not fully validated",
  planned: "Planned",
  proposed: "Proposed only (not committed)",
  not_supported: "Not supported",
} as const;
export type CatalogReadiness = keyof typeof CATALOG_READINESS;
export interface CatalogItem {
  /** Stable identity — display names may change, ids never do. */
  id: ID;
  kind: CatalogKind;
  provider: string;
  product: string;
  capability: string;
  version: string;
  readiness: CatalogReadiness;
  useCases: string[];
  dependencies: ID[];
  actions: string[];
  limitations: string[];
  source: string;
  verifiedAt: ISODate;
  /** Connector scope: which external systems, data directions and operations it supports. */
  connector?: ConnectorSpec;
}
export interface ConnectorSpec {
  /** Lower-case fragments matched against the assessed system's name / vendor. */
  systemMatch: string[];
  /** inbound = system → Aurumi, outbound = Aurumi → system. */
  directions: ("inbound" | "outbound")[];
  operations: ("read" | "write")[];
}
export interface CatalogSnapshot {
  catalogVersion: string;
  retrievedAt: ISODate;
  items: CatalogItem[];
}
/** A pinned catalog reference: id + the version and name seen when it was chosen. */
export interface CatalogRef {
  itemId: ID;
  catalogVersion: string;
  nameAtSelection: string;
}

// ---------- Solution record ----------
export type SolutionStatus = "draft" | "in_review" | "approved" | "returned";
export const SOLUTION_STATUS_LABEL: Record<SolutionStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  returned: "Returned for revision",
};
export interface SolutionBaseline {
  snapshotId: ID;
  snapshotVersion: number;
  schema: string;
  approvedAt: ISODate;
}
export interface SolutionDesign extends ScopedRecord {
  assessmentId: ID;
  kind: "tenant" | "partner";
  title: string;
  /** Distinguishes intentional alternatives for the same assessment. */
  optionLabel: string;
  subjectName: string;
  status: SolutionStatus;
  baseline: SolutionBaseline;
  /** Increments on every rebase; earlier revisions are preserved in the workspace. */
  revision: number;
}

// ---------- Children ----------
export const NEED_SOURCES = {
  pain_point: "Pain point",
  requirement: "Requirement",
  process: "Business process",
  system: "Existing system",
  finding: "Finding",
  risk: "Critical risk / unverified claim",
} as const;
export type NeedSource = keyof typeof NEED_SOURCES;
export const DISPOSITIONS = {
  addressed: "Addressed",
  deferred: "Deferred",
  excluded: "Excluded",
} as const;
export const PRIORITIES = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
} as const;
export type Priority = keyof typeof PRIORITIES;
export interface SolutionNeed extends BaseRecord {
  source: { kind: NeedSource; id: ID; label: string };
  priority: Priority;
  impact: string;
  outcome: string;
  successCriterion: string;
  disposition: keyof typeof DISPOSITIONS;
  dispositionNote: string;
  /** Set by a rebase when the source item no longer exists or changed. */
  sourceStatus: "current" | "changed" | "missing";
}

export const REC_CATEGORIES = {
  native_app: "Aurumi native app",
  connector: "Aurumi connector",
  ai: "AI capability / conversational workflow",
  process_change: "Process or operating-model change",
  third_party: "External third-party solution",
  custom: "Custom integration or development",
  future: "Future capability",
  defer: "No change / defer",
} as const;
export type RecCategory = keyof typeof REC_CATEGORIES;
/** Professional recommendation status — separate from product availability and from facts. */
export const REC_STATUS = {
  proposed: "Proposed",
  recommended: "Recommended",
  optional: "Optional",
  not_recommended: "Not recommended",
} as const;
/** Derived product availability — never typed in by hand. */
export type Availability =
  "available" | "conditional" | "proposed" | "unsupported" | "not_applicable";
export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: "Available",
  conditional: "Conditional",
  proposed: "Proposed / future",
  unsupported: "Unsupported",
  not_applicable: "No Aurumi product",
};
export const PROVENANCE = {
  verified_assessment_fact: "Verified assessment fact",
  verified_catalog_capability: "Verified catalog capability",
  professional_judgment: "Professional judgment",
  ai_suggestion: "AI-generated suggestion",
  unverified_external: "Unverified external information",
  customer_assumption: "Customer assumption",
  future_development: "Proposed / future development",
} as const;
export type Provenance = keyof typeof PROVENANCE;
export interface Recommendation extends BaseRecord {
  category: RecCategory;
  title: string;
  description: string;
  needIds: ID[];
  rationale: string;
  approach: string;
  expectedOutcome: string;
  status: keyof typeof REC_STATUS;
  provenance: Provenance;
  /** Evidence ids from the baseline snapshot, with the content key they were justified against. */
  evidenceRefs: { evidenceId: ID; materialKey: string }[];
  catalogRefs: CatalogRef[];
  dependsOn: ID[];
  mandatory: boolean;
  dependencies: string;
  assumptions: string;
  risks: string;
  fallback: string;
  ownerId: ID;
  responsibilities: { customer: string; aurumi: string; partner: string };
  /** Set when a rebase invalidated the justification; cleared only by re-saving with valid support. */
  justificationStale: boolean;
}

export const FEASIBILITY = {
  confirmed_working: "Confirmed working Aurumi integration",
  implemented_unvalidated: "Implemented, not fully validated",
  planned: "Planned integration",
  possible_uncommitted: "Technically possible, uncommitted",
  unknown: "Unknown feasibility",
  not_supported: "Not supported",
} as const;
export type Feasibility = keyof typeof FEASIBILITY;
export const SPECULATIVE: Feasibility[] = ["planned", "possible_uncommitted", "unknown"];
export interface IntegrationDesign extends BaseRecord {
  systemId: ID;
  systemName: string;
  vendor: string;
  deployment: string;
  dataRequired: string;
  direction: "inbound" | "outbound" | "bidirectional" | "unknown";
  access: "read" | "write" | "read_write" | "unknown";
  mechanism: string;
  proposal: { kind: "connector" | "custom" | "none"; catalogRef?: CatalogRef };
  authNotes: string;
  securityNotes: string;
  technicalDependencies: string;
  feasibility: Feasibility;
  evidenceIds: ID[];
  validationOwner: string;
  openQuestions: string;
}

export interface AIDesign extends BaseRecord {
  recommendationId: ID;
  exampleQuestions: string[];
  intent: string;
  /** Only catalog-represented capabilities may be mapped. */
  capabilityRefs: CatalogRef[];
  businessSkills: string;
  actionsAndWorkflows: string;
  rolesAndScopes: string;
  mode: "read" | "write";
  humanConfirmation: boolean;
  sensitiveDataRisks: string;
  fallback: string;
}

export interface ValueItem extends BaseRecord {
  kind: "measurable" | "qualitative";
  description: string;
  baseline: string;
  target: string;
  method: string;
  timeToValue: string;
  confidence: "low" | "medium" | "high" | "unknown";
  assumptionSource: string;
  /** Optional, always an estimate, never computed by the app. */
  estimate?: { amount: number; currency: string; assumptions: string; source: string };
  risks: string;
}

export const ROADMAP_STAGES = {
  foundation: "Foundation / prerequisites",
  initial: "Initial deployment",
  integrations: "Integrations and validation",
  ai: "AI / conversational enablement",
  onboarding: "User onboarding and adoption",
  optimization: "Optimization and expansion",
} as const;
export interface RoadmapPhase extends BaseRecord {
  stage: keyof typeof ROADMAP_STAGES;
  deliverables: string;
  dependencies: string;
  owners: string;
  indicativeDuration: string;
  acceptanceCriteria: string;
  risks: string;
  customerActions: string;
  /** Always a planning assumption — never a committed date. */
  status: "planning_assumption";
}

export const APPROACHES = {
  aurumi_led: "Aurumi-led",
  optimize_existing: "Existing software optimization",
  third_party: "External third-party tool",
  custom: "Custom integration",
  hybrid: "Hybrid approach",
  defer: "Defer / no change",
} as const;
export const CRITERIA = [
  ["functionalFit", "Functional fit"],
  ["effort", "Implementation effort"],
  ["integrationRisk", "Integration risk"],
  ["operationalImpact", "Operational impact"],
  ["dataSecurity", "Data / security"],
  ["expectedValue", "Expected value"],
  ["timeToValue", "Time to value"],
  ["costUncertainty", "Cost uncertainty"],
  ["reversibility", "Reversibility"],
] as const;
export type Criterion = (typeof CRITERIA)[number][0];
export interface Alternative extends BaseRecord {
  approach: keyof typeof APPROACHES;
  summary: string;
  criteria: Partial<Record<Criterion, string>>;
  limitations: string;
  preferred: boolean;
}

export interface SolutionOverview {
  objectives: string;
  executiveSummary: string;
  constraints: string;
  outstandingQuestions: string;
  assumptions: string;
  preferredRationale: string;
}
export const PARTNER_SOLUTION_FIELDS = [
  ["hypothesis", "Partnership hypothesis"],
  ["prerequisites", "Integration prerequisites"],
  ["partnerProducts", "Relevant partner products"],
  ["customerBenefit", "Customer benefit"],
  ["commercialDependencies", "Commercial dependencies (no invented terms)"],
  ["technicalValidation", "Technical validation needed"],
  ["jointResponsibilities", "Joint responsibilities"],
  ["unverifiedAssumptions", "Unverified partnership assumptions"],
] as const;
export type PartnerSolutionField = (typeof PARTNER_SOLUTION_FIELDS)[number][0];
export type PartnerSolution = Record<PartnerSolutionField, string> & {
  /** A design never implies an agreed partnership. */
  partnershipStatus: "not_agreed";
};

export interface SolutionComment extends BaseRecord {
  kind: "comment" | "submitted" | "returned" | "approved" | "reopened" | "rebased";
  body: string;
}
export interface SolutionRevision {
  revision: number;
  baseline: SolutionBaseline;
  archivedAt: ISODate;
  archivedBy: ID;
  reason: string;
  workspace: Omit<SolutionWorkspace, "revisions">;
}

export interface SolutionWorkspace extends BaseRecord {
  solutionId: ID;
  overview: SolutionOverview;
  partner?: PartnerSolution;
  needs: SolutionNeed[];
  recommendations: Recommendation[];
  integrations: IntegrationDesign[];
  aiDesigns: AIDesign[];
  values: ValueItem[];
  roadmap: RoadmapPhase[];
  alternatives: Alternative[];
  reviewerId?: ID;
  comments: SolutionComment[];
  revisions: SolutionRevision[];
}

export const emptyOverview = (): SolutionOverview => ({
  objectives: "",
  executiveSummary: "",
  constraints: "",
  outstandingQuestions: "",
  assumptions: "",
  preferredRationale: "",
});
export const emptyPartnerSolution = (): PartnerSolution => ({
  ...(Object.fromEntries(PARTNER_SOLUTION_FIELDS.map(([k]) => [k, ""])) as Record<
    PartnerSolutionField,
    string
  >),
  partnershipStatus: "not_agreed",
});

// ---------- Baseline compatibility ----------
export function snapshotCompatibility(
  s: Pick<AssessmentHandoffSnapshot, "schema"> & { questions?: unknown },
): { ok: true } | { ok: false; reason: string } {
  if (s.schema !== HANDOFF_SCHEMA)
    return {
      ok: false,
      reason: `Snapshot schema "${s.schema}" is not supported (needs ${HANDOFF_SCHEMA}). Reopen and re-approve the assessment to produce a compatible snapshot; missing question definitions are never invented.`,
    };
  if (!Array.isArray(s.questions))
    return { ok: false, reason: "Snapshot has no question definitions." };
  return { ok: true };
}

/** Selectable needs, copied as labelled references from the immutable snapshot. */
export function needCandidates(s: AssessmentHandoffSnapshot) {
  const out: { kind: NeedSource; id: ID; label: string }[] = [];
  s.painPoints.forEach((p) => out.push({ kind: "pain_point", id: p.id, label: p.description }));
  s.requirements.forEach((r) => out.push({ kind: "requirement", id: r.id, label: r.statement }));
  s.processes.forEach((p) => out.push({ kind: "process", id: p.id, label: p.name }));
  s.systems.forEach((x) => out.push({ kind: "system", id: x.id, label: x.name }));
  Object.entries(s.findings).forEach(([k, v]) => {
    if (typeof v === "string" && v.trim()) out.push({ kind: "finding", id: k, label: v });
  });
  s.evidence
    .filter(
      (e) =>
        e.verification.state !== "verified" &&
        (e.status === "research_finding" || e.status === "ai_inference") &&
        e.links.some((l) => l.kind === "system" || l.kind === "requirement"),
    )
    .forEach((e) => out.push({ kind: "risk", id: e.id, label: `Unverified: ${e.statement}` }));
  return out;
}
export function findSource(s: AssessmentHandoffSnapshot, kind: NeedSource, id: ID) {
  return needCandidates(s).find((c) => c.kind === kind && c.id === id);
}

// ---------- Catalog claim applicability ----------
/** Catalog kind that must back the claimed functionality of a recommendation category. */
export const CATEGORY_CATALOG_KIND: Partial<Record<RecCategory, CatalogKind>> = {
  native_app: "native_app",
  connector: "connector",
  ai: "ai_capability",
};
/**
 * Mixed selections are allowed (dependencies), but the claimed functionality
 * itself needs at least one selected item of the applicable kind.
 */
export function categoryProblems(
  r: Pick<Recommendation, "category" | "catalogRefs">,
  catalog: CatalogSnapshot,
): string[] {
  const kind = CATEGORY_CATALOG_KIND[r.category];
  if (!kind || !r.catalogRefs.length) return [];
  const kinds = r.catalogRefs.map((c) => catalog.items.find((i) => i.id === c.itemId)?.kind);
  return kinds.includes(kind)
    ? []
    : [
        `a ${REC_CATEGORIES[r.category]} recommendation needs a selected ${CATALOG_KINDS[kind]}; the selected items do not provide that capability`,
      ];
}

// ---------- Derived availability ----------
export function availabilityOf(
  r: Pick<Recommendation, "category" | "catalogRefs">,
  catalog: CatalogSnapshot,
): Availability {
  if (["process_change", "third_party", "defer"].includes(r.category) && !r.catalogRefs.length)
    return "not_applicable";
  if (r.category === "future" || r.category === "custom") return "proposed";
  if (!r.catalogRefs.length) return "unsupported";
  if (categoryProblems(r, catalog).length) return "unsupported";
  const levels = r.catalogRefs.map(
    (ref) => catalog.items.find((i) => i.id === ref.itemId)?.readiness,
  );
  if (levels.some((l) => !l || l === "not_supported")) return "unsupported";
  if (levels.every((l) => l === "available")) return "available";
  if (levels.some((l) => l === "proposed" || l === "planned")) return "proposed";
  return "conditional";
}

const isVerified = (e: EvidenceRecord | undefined) =>
  !!e &&
  e.verification.state === "verified" &&
  (e.status === "confirmed_fact" || e.status === "research_finding");

/**
 * Checks that a recommendation's claimed provenance is actually supported.
 * A label alone never makes something verified.
 */
export function provenanceProblems(
  r: Pick<Recommendation, "provenance" | "evidenceRefs" | "catalogRefs" | "category">,
  snap: AssessmentHandoffSnapshot,
  catalog: CatalogSnapshot,
): string[] {
  const p: string[] = [];
  for (const ref of r.evidenceRefs) {
    const e = snap.evidence.find((x) => x.id === ref.evidenceId);
    if (!e) p.push(`evidence "${ref.evidenceId}" is not in the baseline snapshot`);
    else if (materialEvidenceKey(e) !== ref.materialKey)
      p.push(`evidence "${ref.evidenceId}" changed since it was cited`);
  }
  if (r.provenance === "verified_assessment_fact") {
    const ok = r.evidenceRefs.some((ref) => {
      const e = snap.evidence.find((x) => x.id === ref.evidenceId);
      return isVerified(e) && materialEvidenceKey(e!) === ref.materialKey;
    });
    if (!ok) p.push("“Verified assessment fact” needs cited verified evidence from the baseline");
  }
  p.push(...categoryProblems(r, catalog));
  if (r.provenance === "verified_catalog_capability") {
    const ok =
      r.catalogRefs.length > 0 &&
      !categoryProblems(r, catalog).length &&
      r.catalogRefs.every(
        (ref) => catalog.items.find((i) => i.id === ref.itemId)?.readiness === "available",
      );
    if (!ok) p.push("“Verified catalog capability” needs catalog items that are Available");
  }
  return p;
}

/** Integration feasibility claims must be backed by the catalog and, for confirmed, verified connector evidence. */
export function feasibilityProblems(
  i: Pick<
    IntegrationDesign,
    "feasibility" | "proposal" | "evidenceIds" | "systemId" | "direction" | "access"
  >,
  snap: AssessmentHandoffSnapshot,
  catalog: CatalogSnapshot,
): string[] {
  const item = i.proposal.catalogRef
    ? catalog.items.find((c) => c.id === i.proposal.catalogRef!.itemId)
    : undefined;
  const connectorEvidence = i.evidenceIds
    .map((id) => snap.evidence.find((e) => e.id === id))
    .filter(
      (e) =>
        isVerified(e) &&
        e!.applicability === "connector_supported" &&
        e!.links.some((l) => l.kind === "system" && l.id === i.systemId),
    );
  const sys = snap.systems.find((x) => x.id === i.systemId);
  /** Exact system / direction / operation scope of the selected connector. */
  const scope = (): string[] => {
    if (!item) return [];
    const spec = item.connector;
    if (!spec) return [`${item.product} does not declare which systems and operations it supports`];
    const p: string[] = [];
    const hay = `${sys?.name ?? ""} ${sys?.vendor ?? ""}`.toLowerCase();
    if (!sys || !spec.systemMatch.some((m) => hay.includes(m)))
      p.push(`${item.product} does not apply to ${sys?.name ?? "this system"}`);
    const dirs = i.direction === "bidirectional" ? ["inbound", "outbound"] : [i.direction];
    if (i.direction === "unknown") p.push("the data direction is unknown");
    else if (!dirs.every((d) => spec.directions.includes(d as never)))
      p.push(`${item.product} does not support ${i.direction} data flow`);
    const ops = i.access === "read_write" ? ["read", "write"] : [i.access];
    if (i.access === "unknown") p.push("the required read/write operations are unknown");
    else if (!ops.every((o) => spec.operations.includes(o as never)))
      p.push(`${item.product} does not support ${i.access.replace("_", "/")} operations`);
    return p;
  };
  switch (i.feasibility) {
    case "confirmed_working": {
      if (item?.kind !== "connector" || item.readiness !== "available")
        return ["Confirmed working needs a connector the catalog lists as Available"];
      const p = scope().map((m) => `Confirmed working not allowed: ${m}`);
      if (!connectorEvidence.length)
        p.push(
          "Confirmed working needs verified “connector tested & supported” evidence linked to this system (an external API is not enough)",
        );
      else if (!connectorEvidence.some((e) => e!.connectorItemId === item.id))
        p.push(
          `Confirmed working needs supporting evidence that names the selected connector (${item.id}); evidence about another or an unnamed connector does not count`,
        );
      return p;
    }
    case "implemented_unvalidated":
      if (
        item?.kind !== "connector" ||
        (item.readiness !== "beta" && item.readiness !== "available")
      )
        return ["Implemented needs a connector the catalog lists as Beta or Available"];
      return scope().map((m) => `Implemented not allowed: ${m}`);
    case "planned":
      return item?.kind === "connector" && ["planned", "beta", "available"].includes(item.readiness)
        ? []
        : ["Planned needs a connector the catalog lists as Planned or later"];
    default:
      return [];
  }
}

// ---------- Dependencies ----------
export type DependencySourceKind = "recommendation" | "integration" | "aiDesign";
export interface DependencyReport {
  missing: { from: ID; to: ID }[];
  cycles: ID[][];
  /** A selected component needs a catalog item (directly or transitively) that is not selected. */
  catalogGaps: {
    source: { kind: DependencySourceKind; id: ID };
    /** Kept for recommendation sources. */
    recommendationId?: ID;
    itemId: ID;
    needs: ID;
    path: ID[];
  }[];
  /** A required dependency that is unknown to the catalog or marked not supported. */
  unsupported: { itemId: ID; needs: ID; reason: string }[];
  catalogCycles: ID[][];
}
type DepRec = Pick<Recommendation, "id" | "dependsOn" | "catalogRefs"> &
  Partial<Pick<Recommendation, "status">>;
export interface DependencyInput {
  recommendations: DepRec[];
  integrations?: Pick<IntegrationDesign, "id" | "proposal">[];
  aiDesigns?: Pick<AIDesign, "id" | "recommendationId" | "capabilityRefs">[];
}
/** Rejected (not recommended) components never satisfy or create dependencies. */
const selected = (r: DepRec) => r.status !== "not_recommended";

export function analyzeDependencies(
  input: DepRec[] | DependencyInput,
  catalog: CatalogSnapshot,
): DependencyReport {
  const d: DependencyInput = Array.isArray(input) ? { recommendations: input } : input;
  const recs = d.recommendations.filter(selected);
  const ids = new Set(recs.map((r) => r.id));
  const missing = recs.flatMap((r) =>
    r.dependsOn.filter((x) => !ids.has(x)).map((to) => ({ from: r.id, to })),
  );
  const cycles: ID[][] = [];
  const state = new Map<ID, 1 | 2>();
  const stack: ID[] = [];
  const visit = (id: ID) => {
    state.set(id, 1);
    stack.push(id);
    for (const x of recs.find((r) => r.id === id)?.dependsOn ?? []) {
      if (!ids.has(x)) continue;
      if (state.get(x) === 1) cycles.push([...stack.slice(stack.indexOf(x)), x]);
      else if (!state.has(x)) visit(x);
    }
    stack.pop();
    state.set(id, 2);
  };
  recs.forEach((r) => !state.has(r.id) && visit(r.id));

  // Every selected catalog reference, from recommendations, integrations and AI designs.
  const sources: { kind: DependencySourceKind; id: ID; itemIds: ID[] }[] = [
    ...recs.map((r) => ({
      kind: "recommendation" as const,
      id: r.id,
      itemIds: r.catalogRefs.map((c) => c.itemId),
    })),
    ...(d.integrations ?? [])
      .filter((i) => i.proposal.kind === "connector" && i.proposal.catalogRef)
      .map((i) => ({
        kind: "integration" as const,
        id: i.id,
        itemIds: [i.proposal.catalogRef!.itemId],
      })),
    ...(d.aiDesigns ?? [])
      .filter((a) => ids.has(a.recommendationId))
      .map((a) => ({
        kind: "aiDesign" as const,
        id: a.id,
        itemIds: a.capabilityRefs.map((c) => c.itemId),
      })),
  ];
  const chosen = new Set(sources.flatMap((x) => x.itemIds));
  const find = (id: ID) => catalog.items.find((i) => i.id === id);
  const catalogGaps: DependencyReport["catalogGaps"] = [];
  const unsupported: DependencyReport["unsupported"] = [];
  const catalogCycles: ID[][] = [];
  const seenGap = new Set<string>();
  const seenUnsup = new Set<string>();
  const seenCycle = new Set<string>();
  for (const src of sources)
    for (const root of src.itemIds) {
      const walk = (itemId: ID, path: ID[]) => {
        for (const needs of find(itemId)?.dependencies ?? []) {
          if (path.includes(needs)) {
            const c = [...path.slice(path.indexOf(needs)), needs];
            if (!seenCycle.has(c.join(">"))) {
              seenCycle.add(c.join(">"));
              catalogCycles.push(c);
            }
            continue;
          }
          const dep = find(needs);
          if ((!dep || dep.readiness === "not_supported") && !seenUnsup.has(`${itemId}>${needs}`)) {
            seenUnsup.add(`${itemId}>${needs}`);
            unsupported.push({
              itemId,
              needs,
              reason: dep ? "marked not supported in the catalog" : "not in the catalog",
            });
          }
          const key = `${src.kind}:${src.id}:${needs}`;
          if (!chosen.has(needs) && !seenGap.has(key)) {
            seenGap.add(key);
            catalogGaps.push({
              source: { kind: src.kind, id: src.id },
              ...(src.kind === "recommendation" ? { recommendationId: src.id } : {}),
              itemId: root,
              needs,
              path: [...path, needs],
            });
          }
          walk(needs, [...path, needs]);
        }
      };
      walk(root, [root]);
    }
  return { missing, cycles, catalogGaps, unsupported, catalogCycles };
}
export const dependencyInput = (
  ws: Pick<SolutionWorkspace, "recommendations" | "integrations" | "aiDesigns">,
): DependencyInput => ({
  recommendations: ws.recommendations,
  integrations: ws.integrations,
  aiDesigns: ws.aiDesigns,
});

// ---------- Readiness (derived, never stored) ----------
export interface ReadinessItem {
  key: string;
  label: string;
  ok: boolean;
  detail: string[];
}
export function solutionReadiness(
  sol: SolutionDesign,
  ws: SolutionWorkspace,
  snap: AssessmentHandoffSnapshot | undefined,
  catalog: CatalogSnapshot,
): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  const add = (key: string, label: string, detail: string[]) =>
    items.push({ key, label, ok: detail.length === 0, detail });
  add(
    "baseline",
    "Approved assessment snapshot linked",
    snap && snapshotCompatibility(snap).ok ? [] : ["Baseline snapshot missing or incompatible"],
  );
  const high = ws.needs.filter((n) => n.priority === "high" || n.priority === "critical");
  const covered = (n: SolutionNeed) => ws.recommendations.some((r) => r.needIds.includes(n.id));
  add("needs", "Priority needs mapped or explicitly excluded", [
    ...(ws.needs.length ? [] : ["Select at least one need"]),
    ...high
      .filter((n) => n.disposition === "addressed" && !covered(n))
      .map((n) => `High-priority need not covered: ${n.source.label.slice(0, 60)}`),
    ...ws.needs
      .filter((n) => n.disposition !== "addressed" && !n.dispositionNote.trim())
      .map((n) => `Give a reason for ${n.disposition} need: ${n.source.label.slice(0, 40)}`),
    ...ws.needs
      .filter((n) => n.sourceStatus !== "current")
      .map((n) => `Source ${n.sourceStatus}: ${n.source.label.slice(0, 40)}`),
  ]);
  add("justified", "Recommendations justified", [
    ...(ws.recommendations.length ? [] : ["Add at least one recommendation"]),
    ...ws.recommendations
      .filter((r) => !r.rationale.trim() || !r.needIds.length)
      .map((r) => `${r.title}: needs a rationale and at least one linked need`),
    ...ws.recommendations
      .filter((r) => r.justificationStale)
      .map((r) => `${r.title}: justification needs review after rebase`),
  ]);
  add(
    "catalog",
    "Offering and capability references validated",
    ws.recommendations.flatMap((r) => [
      ...r.catalogRefs
        .filter((c) => !catalog.items.some((i) => i.id === c.itemId))
        .map((c) => `${r.title}: unknown catalog item ${c.itemId}`),
      ...categoryProblems(r, catalog).map((m) => `${r.title}: ${m}`),
    ]),
  );
  add(
    "integrations",
    "Integration feasibility clearly classified",
    snap
      ? ws.integrations.flatMap((i) => [
          ...feasibilityProblems(i, snap, catalog).map((m) => `${i.systemName}: ${m}`),
          ...(i.feasibility !== "confirmed_working" && !i.validationOwner.trim()
            ? [`${i.systemName}: name who validates this integration`]
            : []),
        ])
      : [],
  );
  const aiRecs = ws.recommendations.filter((r) => r.category === "ai");
  add("ai", "AI permissions and data dependencies considered", [
    ...aiRecs
      .filter((r) => !ws.aiDesigns.some((d) => d.recommendationId === r.id))
      .map((r) => `${r.title}: describe the AI / conversational design`),
    ...ws.aiDesigns
      .filter((d) => !d.rolesAndScopes.trim() || !d.sensitiveDataRisks.trim())
      .map(() => "AI design: roles/scopes and sensitive-data risks are required"),
  ]);
  add("value", "Value assumptions documented", [
    ...(ws.values.length ? [] : ["Record at least one expected benefit"]),
    ...ws.values
      .filter((v) => !v.assumptionSource.trim())
      .map((v) => `${v.description.slice(0, 40)}: state the source of the assumption`),
  ]);
  const dep = analyzeDependencies(dependencyInput(ws), catalog);
  add("roadmap", "Roadmap and dependencies complete", [
    ...(ws.roadmap.length ? [] : ["Add at least one roadmap phase"]),
    ...dep.missing.map((m) => `Missing dependency ${m.to}`),
    ...dep.cycles.map((c) => `Circular dependency: ${c.join(" → ")}`),
  ]);
  add("dependencies", "Mandatory catalog prerequisites resolved", [
    ...dep.catalogGaps.map(
      (g) => `${g.path.join(" → ")}: ${g.needs} is required but not selected in the solution`,
    ),
    ...dep.unsupported.map((u) => `${u.itemId} needs ${u.needs}, which is ${u.reason}`),
    ...dep.catalogCycles.map((c) => `Circular catalog dependency: ${c.join(" → ")}`),
  ]);
  add(
    "unknowns",
    "High-risk unknowns identified",
    ws.integrations.some((i) => SPECULATIVE.includes(i.feasibility)) &&
      !ws.overview.outstandingQuestions.trim()
      ? ["Speculative integrations exist — list them under outstanding questions"]
      : [],
  );
  add("alternatives", "Alternatives considered", [
    ...(ws.alternatives.length >= 2 ? [] : ["Compare at least two approaches"]),
    ...(ws.alternatives.filter((a) => a.preferred).length === 1
      ? []
      : ["Mark exactly one preferred approach"]),
    ...(ws.overview.preferredRationale.trim()
      ? []
      : ["Record why the preferred approach was chosen"]),
  ]);
  add(
    "claims",
    "Unsubstantiated claims flagged",
    snap
      ? ws.recommendations.flatMap((r) =>
          provenanceProblems(r, snap, catalog).map((m) => `${r.title}: ${m}`),
        )
      : [],
  );
  if (sol.kind === "partner")
    add(
      "partner",
      "Partner hypothesis and validation needs recorded",
      ws.partner?.hypothesis.trim() && ws.partner.technicalValidation.trim()
        ? []
        : ["Record the partnership hypothesis and technical validation needed"],
    );
  return items;
}
export const readinessPercent = (items: ReadinessItem[]) =>
  items.length ? Math.round((items.filter((i) => i.ok).length / items.length) * 100) : 0;

// ---------- Rebase ----------
export interface RebaseDiff {
  from: SolutionBaseline;
  to: SolutionBaseline;
  added: { kind: NeedSource; id: ID; label: string }[];
  removed: { kind: NeedSource; id: ID; label: string }[];
  changed: { kind: NeedSource; id: ID; before: string; after: string }[];
  evidenceChanged: ID[];
  affectedNeeds: ID[];
  affectedRecommendations: ID[];
}
export function diffSnapshots(
  from: AssessmentHandoffSnapshot,
  to: AssessmentHandoffSnapshot,
  ws: Pick<SolutionWorkspace, "needs" | "recommendations">,
): RebaseDiff {
  const a = needCandidates(from);
  const b = needCandidates(to);
  const key = (x: { kind: string; id: string }) => `${x.kind}:${x.id}`;
  const added = b.filter((x) => !a.some((y) => key(y) === key(x)));
  const removed = a.filter((x) => !b.some((y) => key(y) === key(x)));
  const changed = a.flatMap((x) => {
    const y = b.find((z) => key(z) === key(x));
    return y && y.label !== x.label
      ? [{ kind: x.kind, id: x.id, before: x.label, after: y.label }]
      : [];
  });
  const evidenceChanged = from.evidence
    .filter((e) => {
      const n = to.evidence.find((x) => x.id === e.id);
      return (
        !n ||
        materialEvidenceKey(n) !== materialEvidenceKey(e) ||
        n.verification.state !== e.verification.state
      );
    })
    .map((e) => e.id);
  const touched = new Set([...removed, ...changed].map(key));
  const affectedNeeds = ws.needs.filter((n) => touched.has(key(n.source))).map((n) => n.id);
  const affectedRecommendations = ws.recommendations
    .filter((r) => r.evidenceRefs.some((e) => evidenceChanged.includes(e.evidenceId)))
    .map((r) => r.id);
  const meta = (s: AssessmentHandoffSnapshot): SolutionBaseline => ({
    snapshotId: s.id,
    snapshotVersion: s.version,
    schema: s.schema,
    approvedAt: s.approval.approvedAt,
  });
  return {
    from: meta(from),
    to: meta(to),
    added,
    removed,
    changed,
    evidenceChanged,
    affectedNeeds,
    affectedRecommendations,
  };
}

// ---------- Hand-off snapshot ----------
/** /2 embeds the full source assessment snapshot and the catalog dependency closure. */
export const SOLUTION_HANDOFF_SCHEMA = "aurumi.cia.solution-handoff/2" as const;
export interface SolutionHandoffSnapshot {
  readonly schema: typeof SOLUTION_HANDOFF_SCHEMA;
  readonly id: ID;
  readonly organizationId: ID;
  readonly solutionId: ID;
  readonly version: number;
  readonly revision: number;
  readonly createdAt: ISODate;
  readonly approval: {
    readonly approvedBy: ID;
    readonly approvedAt: ISODate;
    readonly comment: string;
  };
  readonly solution: Readonly<
    Pick<
      SolutionDesign,
      | "id"
      | "title"
      | "optionLabel"
      | "kind"
      | "subjectName"
      | "assessmentId"
      | "ownerId"
      | "assignedUserIds"
    >
  >;
  readonly baseline: Readonly<SolutionBaseline>;
  readonly overview: Readonly<SolutionOverview>;
  readonly partner?: Readonly<PartnerSolution>;
  readonly needs: readonly SolutionNeed[];
  readonly recommendations: readonly (Recommendation & { availability: Availability })[];
  readonly integrations: readonly IntegrationDesign[];
  readonly aiDesigns: readonly AIDesign[];
  readonly values: readonly ValueItem[];
  readonly roadmap: readonly RoadmapPhase[];
  readonly alternatives: readonly Alternative[];
  /** The complete immutable source assessment snapshot (requirements, processes, systems, evidence, questions, answers, findings). */
  readonly sourceAssessment: AssessmentHandoffSnapshot;
  /** Full copies of every referenced catalog item and its transitive dependencies, as seen at approval. */
  readonly catalog: {
    readonly catalogVersion: string;
    readonly retrievedAt: ISODate;
    readonly items: readonly CatalogItem[];
  };
  /** Baseline evidence cited by recommendations or integrations. */
  readonly evidence: readonly EvidenceRecord[];
  readonly dependencies: Readonly<DependencyReport>;
}

/** Every reference in a hand-off that does not resolve inside the hand-off itself (should be empty). */
export function unresolvedHandoffRefs(h: SolutionHandoffSnapshot): string[] {
  const src = h.sourceAssessment;
  const out: string[] = [];
  const items = new Set(h.catalog.items.map((i) => i.id));
  const ev = new Set(src.evidence.map((e) => e.id));
  const sets: Record<string, Set<ID>> = {
    system: new Set(src.systems.map((x) => x.id)),
    process: new Set(src.processes.map((x) => x.id)),
    pain_point: new Set(src.painPoints.map((x) => x.id)),
    requirement: new Set(src.requirements.map((x) => x.id)),
    finding: new Set(Object.keys(src.findings)),
  };
  if (src.id !== h.baseline.snapshotId) out.push("source assessment is not the baseline");
  h.needs.forEach((n) => {
    if (!findSource(src, n.source.kind, n.source.id)) out.push(`need source ${n.source.id}`);
  });
  src.evidence.forEach((e) =>
    e.links.forEach((l) => {
      if (!sets[l.kind]?.has(l.id)) out.push(`evidence ${e.id} target ${l.kind}:${l.id}`);
    }),
  );
  src.painPoints.forEach((p) => {
    if (p.processId && !sets["process"]!.has(p.processId)) out.push(`process ${p.processId}`);
  });
  src.answers.forEach((a) => {
    if (!src.questions.some((q) => q.id === a.questionId)) out.push(`question ${a.questionId}`);
  });
  h.recommendations.forEach((r) => {
    r.evidenceRefs.forEach((e) => !ev.has(e.evidenceId) && out.push(`evidence ${e.evidenceId}`));
    r.catalogRefs.forEach((c) => !items.has(c.itemId) && out.push(`catalog ${c.itemId}`));
  });
  h.integrations.forEach((i) => {
    if (!sets["system"]!.has(i.systemId)) out.push(`system ${i.systemId}`);
    i.evidenceIds.forEach((e) => !ev.has(e) && out.push(`evidence ${e}`));
    const c = i.proposal.catalogRef?.itemId;
    if (c && !items.has(c)) out.push(`catalog ${c}`);
  });
  h.aiDesigns.forEach((a) =>
    a.capabilityRefs.forEach((c) => !items.has(c.itemId) && out.push(`catalog ${c.itemId}`)),
  );
  h.catalog.items.forEach((i) =>
    i.dependencies.forEach((d) => !items.has(d) && out.push(`catalog dependency ${d}`)),
  );
  return [...new Set(out)];
}

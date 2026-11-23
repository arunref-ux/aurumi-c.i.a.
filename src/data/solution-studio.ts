/**
 * Solution Studio service (Phase 3). Promise-based so a production API can
 * replace the simulated store. Authorization reuses Phase 1 `can()`; every
 * child write is checked against the parent solution. Lifecycle changes go only
 * through the workflow methods below. Assessment facts are read from the
 * immutable baseline snapshot and can never be edited here.
 */
import { z } from "zod";
import {
  deepFreeze,
  materialEvidenceKey,
  type AssessmentHandoffSnapshot,
} from "@/domain/assessment";
import { AccessDeniedError, can, type Permission } from "@/domain/permissions";
import {
  analyzeDependencies,
  dependencyInput,
  unresolvedHandoffRefs,
  availabilityOf,
  diffSnapshots,
  emptyOverview,
  emptyPartnerSolution,
  feasibilityProblems,
  findSource,
  needCandidates,
  PARTNER_SOLUTION_FIELDS,
  provenanceProblems,
  readinessPercent,
  snapshotCompatibility,
  SOLUTION_HANDOFF_SCHEMA,
  solutionReadiness,
  type Availability,
  type CatalogRef,
  type CatalogSnapshot,
  type DependencyReport,
  type RebaseDiff,
  type ReadinessItem,
  type SolutionBaseline,
  type SolutionDesign,
  type SolutionHandoffSnapshot,
  type SolutionStatus,
  type SolutionWorkspace,
} from "@/domain/solution";
import type { ID } from "@/domain/types";
import { solutionCatalog } from "@/integrations/adapters/solution-catalog";
import { _internal, directory, ValidationError, type Ctx } from "./repositories";
import { newId, store } from "./store";

const { audit, denyWith } = _internal;
const clone = <T>(v: T): T => structuredClone(v);
const now = () => new Date().toISOString();
export const solutionConfig = { latencyMs: 120 };
const tick = () =>
  new Promise<void>((r) =>
    solutionConfig.latencyMs ? setTimeout(r, solutionConfig.latencyMs) : r(),
  );
const EDITABLE: SolutionStatus[] = ["draft", "returned"];

// ---------- Result types ----------
export interface SolutionListItem {
  solution: SolutionDesign;
  ownerName: string;
  assigneeNames: string[];
  readiness: number;
}
export interface SolutionCandidate {
  assessmentId: ID;
  assessmentTitle: string;
  subjectName: string;
  type: "tenant" | "partner";
  snapshots: {
    id: ID;
    version: number;
    approvedAt: string;
    compatible: boolean;
    reason?: string;
    existingSolutions: { id: ID; title: string; optionLabel: string }[];
  }[];
}
export interface SolutionPermissions {
  canEdit: boolean;
  canAssign: boolean;
  canApprove: boolean;
  canSubmit: boolean;
  canReopen: boolean;
  canRebase: boolean;
}
export interface SolutionView {
  solution: SolutionDesign;
  workspace: SolutionWorkspace;
  baseline: AssessmentHandoffSnapshot | undefined;
  /** Newer compatible approved snapshot, offered for a controlled rebase (never applied automatically). */
  newerSnapshot: { id: ID; version: number; approvedAt: string } | undefined;
  catalog: CatalogSnapshot;
  readiness: ReadinessItem[];
  readinessPercent: number;
  availability: Record<ID, Availability>;
  dependencies: DependencyReport;
  snapshots: SolutionHandoffSnapshot[];
  permissions: SolutionPermissions;
  names: Record<ID, string>;
}

// ---------- Input schemas (strict) ----------
const str = z.string().max(4000);
const ids = z.array(z.string()).max(200);
const childId = z.string().optional();
const priority = z.enum(["low", "medium", "high", "critical"]);
const catIds = z.array(z.string()).max(50);

const CreateInput = z.strictObject({
  assessmentId: z.string().min(1),
  snapshotId: z.string().min(1),
  title: z.string().trim().min(1, "Solution name is required").max(200),
  optionLabel: z.string().trim().max(100).default(""),
  /** Must be true to create another solution on the same snapshot. */
  asAlternative: z.boolean().default(false),
});
export type CreateSolutionInput = z.input<typeof CreateInput>;
const OverviewInput = z.strictObject({
  objectives: str.optional(),
  executiveSummary: str.optional(),
  constraints: str.optional(),
  outstandingQuestions: str.optional(),
  assumptions: str.optional(),
  preferredRationale: str.optional(),
});
const PartnerInput = z.strictObject(
  Object.fromEntries(PARTNER_SOLUTION_FIELDS.map(([k]) => [k, str.optional()])),
);

const CHILD = {
  needs: z.strictObject({
    id: childId,
    source: z.strictObject({
      kind: z.enum(["pain_point", "requirement", "process", "system", "finding", "risk"]),
      id: z.string().min(1),
    }),
    priority: priority.default("medium"),
    impact: str.default(""),
    outcome: str.default(""),
    successCriterion: str.default(""),
    disposition: z.enum(["addressed", "deferred", "excluded"]).default("addressed"),
    dispositionNote: str.default(""),
  }),
  recommendations: z.strictObject({
    id: childId,
    category: z.enum([
      "native_app",
      "connector",
      "ai",
      "process_change",
      "third_party",
      "custom",
      "future",
      "defer",
    ]),
    title: z.string().trim().min(1, "Title is required").max(200),
    description: str.default(""),
    needIds: ids.default([]),
    rationale: str.default(""),
    approach: str.default(""),
    expectedOutcome: str.default(""),
    status: z.enum(["proposed", "recommended", "optional", "not_recommended"]).default("proposed"),
    provenance: z
      .enum([
        "verified_assessment_fact",
        "verified_catalog_capability",
        "professional_judgment",
        "ai_suggestion",
        "unverified_external",
        "customer_assumption",
        "future_development",
      ])
      .default("professional_judgment"),
    evidenceIds: ids.default([]),
    catalogItemIds: catIds.default([]),
    dependsOn: ids.default([]),
    mandatory: z.boolean().default(true),
    dependencies: str.default(""),
    assumptions: str.default(""),
    risks: str.default(""),
    fallback: str.default(""),
    ownerId: z.string().optional(),
    responsibilities: z
      .strictObject({
        customer: str.default(""),
        aurumi: str.default(""),
        partner: str.default(""),
      })
      .default({ customer: "", aurumi: "", partner: "" }),
  }),
  integrations: z.strictObject({
    id: childId,
    systemId: z.string().min(1, "Choose a system from the assessment"),
    dataRequired: str.default(""),
    direction: z.enum(["inbound", "outbound", "bidirectional", "unknown"]).default("unknown"),
    access: z.enum(["read", "write", "read_write", "unknown"]).default("unknown"),
    mechanism: str.default(""),
    proposalKind: z.enum(["connector", "custom", "none"]).default("none"),
    catalogItemId: z.string().optional(),
    authNotes: str.default(""),
    securityNotes: str.default(""),
    technicalDependencies: str.default(""),
    feasibility: z
      .enum([
        "confirmed_working",
        "implemented_unvalidated",
        "planned",
        "possible_uncommitted",
        "unknown",
        "not_supported",
      ])
      .default("unknown"),
    evidenceIds: ids.default([]),
    validationOwner: str.default(""),
    openQuestions: str.default(""),
  }),
  aiDesigns: z.strictObject({
    id: childId,
    recommendationId: z.string().min(1, "Choose the AI recommendation"),
    exampleQuestions: z.array(z.string().max(500)).max(20).default([]),
    intent: str.default(""),
    capabilityItemIds: catIds.default([]),
    businessSkills: str.default(""),
    actionsAndWorkflows: str.default(""),
    rolesAndScopes: str.default(""),
    mode: z.enum(["read", "write"]).default("read"),
    humanConfirmation: z.boolean().default(false),
    sensitiveDataRisks: str.default(""),
    fallback: str.default(""),
  }),
  values: z.strictObject({
    id: childId,
    kind: z.enum(["measurable", "qualitative"]).default("qualitative"),
    description: z.string().trim().min(1, "Describe the benefit").max(1000),
    baseline: str.default(""),
    target: str.default(""),
    method: str.default(""),
    timeToValue: str.default(""),
    confidence: z.enum(["low", "medium", "high", "unknown"]).default("unknown"),
    assumptionSource: str.default(""),
    estimate: z
      .strictObject({
        amount: z.number().finite().nonnegative(),
        currency: z.string().trim().min(1).max(10),
        assumptions: z.string().trim().min(1, "An estimate needs its assumptions"),
        source: z.string().trim().min(1, "An estimate needs a source"),
      })
      .optional(),
    risks: str.default(""),
  }),
  roadmap: z.strictObject({
    id: childId,
    stage: z.enum(["foundation", "initial", "integrations", "ai", "onboarding", "optimization"]),
    deliverables: str.default(""),
    dependencies: str.default(""),
    owners: str.default(""),
    indicativeDuration: str.default(""),
    acceptanceCriteria: str.default(""),
    risks: str.default(""),
    customerActions: str.default(""),
  }),
  alternatives: z.strictObject({
    id: childId,
    approach: z.enum([
      "aurumi_led",
      "optimize_existing",
      "third_party",
      "custom",
      "hybrid",
      "defer",
    ]),
    summary: str.default(""),
    criteria: z.record(z.string(), z.string().max(500)).default({}),
    limitations: str.default(""),
    preferred: z.boolean().default(false),
  }),
} as const;
export type SolutionChildKind = keyof typeof CHILD;
export type SolutionChildInput<K extends SolutionChildKind> = z.input<(typeof CHILD)[K]>;
const PREFIX: Record<SolutionChildKind, string> = {
  needs: "need",
  recommendations: "rec",
  integrations: "int",
  aiDesigns: "ai",
  values: "val",
  roadmap: "rm",
  alternatives: "alt",
};

// ---------- Helpers ----------
function reject(ctx: Ctx, msg: string, id?: ID): never {
  audit(ctx, {
    action: "solution.write",
    resourceType: "solution",
    ...(id ? { resourceId: id } : {}),
    teamId: ctx.user.teamId,
    ownerId: ctx.user.id,
    summary: `Rejected write: ${msg}`,
    outcome: "denied",
  });
  throw new ValidationError(msg);
}
function parse<S extends z.ZodType>(ctx: Ctx, schema: S, input: unknown, id?: ID): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success)
    return reject(
      ctx,
      r.error.issues
        .map((i) => (i.path.length ? `${i.path.join(".")}: ` : "") + i.message)
        .join("; "),
      id,
    );
  return r.data;
}
const deny = (ctx: Ctx, p: Permission, id?: ID): never => denyWith(ctx, "solution", p, id);
/** Unknown and unauthorized ids look the same. */
function parent(ctx: Ctx, id: ID, p: Permission): SolutionDesign {
  const row = store.table("solutions").find((s) => s.id === id);
  if (!row || !can(ctx.user, "solution.read", row) || !can(ctx.user, p, row))
    return deny(ctx, p, id);
  return row;
}
function editable(ctx: Ctx, s: SolutionDesign) {
  if (!EDITABLE.includes(s.status))
    reject(
      ctx,
      `solution is ${s.status.replace("_", " ")}; it cannot be edited until returned or reopened`,
      s.id,
    );
}
function workspaceOf(s: SolutionDesign): SolutionWorkspace {
  return (
    store.table("solutionWorkspaces").find((w) => w.solutionId === s.id) ??
    blankWorkspace(s, s.createdBy, s.createdAt)
  );
}
function blankWorkspace(s: SolutionDesign, by: ID, at: string): SolutionWorkspace {
  return {
    id: `sws_${s.id}`,
    organizationId: s.organizationId,
    createdAt: at,
    createdBy: by,
    updatedAt: at,
    updatedBy: by,
    solutionId: s.id,
    overview: emptyOverview(),
    ...(s.kind === "partner" ? { partner: emptyPartnerSolution() } : {}),
    needs: [],
    recommendations: [],
    integrations: [],
    aiDesigns: [],
    values: [],
    roadmap: [],
    alternatives: [],
    comments: [],
    revisions: [],
  };
}
function snapshotById(id: ID) {
  return store.table("snapshots").find((s) => s.id === id);
}
function baselineOf(s: SolutionDesign) {
  return snapshotById(s.baseline.snapshotId);
}
function persist(
  ctx: Ctx,
  s: SolutionDesign,
  ws: SolutionWorkspace,
  summary: string,
  action = "solution.update",
  patch: Partial<SolutionDesign> = {},
) {
  const at = now();
  store.replace("solutionWorkspaces", [
    ...store.table("solutionWorkspaces").filter((w) => w.solutionId !== s.id),
    { ...ws, updatedAt: at, updatedBy: ctx.user.id },
  ]);
  store.replace(
    "solutions",
    store
      .table("solutions")
      .map((r) => (r.id === s.id ? { ...r, ...patch, updatedAt: at, updatedBy: ctx.user.id } : r)),
  );
  audit(ctx, {
    action,
    resourceType: "solution",
    resourceId: s.id,
    teamId: s.teamId,
    ownerId: s.ownerId,
    summary,
    outcome: "allowed",
  });
}
function stamp<T extends object>(
  ctx: Ctx,
  s: SolutionDesign,
  prefix: string,
  data: T,
  existing?: { id: ID; createdAt: string; createdBy: ID },
) {
  const at = now();
  return {
    ...data,
    id: existing?.id ?? newId(prefix),
    organizationId: s.organizationId,
    createdAt: existing?.createdAt ?? at,
    createdBy: existing?.createdBy ?? ctx.user.id,
    updatedAt: at,
    updatedBy: ctx.user.id,
  };
}
async function catalogNow(): Promise<CatalogSnapshot> {
  const r = await solutionCatalog.getSnapshot();
  if (!r.ok) throw new ValidationError(`Catalog unavailable: ${r.error}`);
  return r.data;
}
/** Pins catalog ids; keeps the original pin when the same item was already referenced. */
function pin(
  ctx: Ctx,
  sid: ID,
  catalog: CatalogSnapshot,
  itemIds: ID[],
  prev: CatalogRef[] = [],
  allowed?: string[],
): CatalogRef[] {
  return [...new Set(itemIds)].map((itemId) => {
    const item = catalog.items.find((i) => i.id === itemId);
    if (!item) return reject(ctx, `unknown catalog item "${itemId}"`, sid);
    if (allowed && !allowed.includes(item.kind))
      return reject(ctx, `catalog item "${itemId}" is a ${item.kind}, not allowed here`, sid);
    return (
      prev.find((p) => p.itemId === itemId) ?? {
        itemId,
        catalogVersion: catalog.catalogVersion,
        nameAtSelection: `${item.product} — ${item.capability}`,
      }
    );
  });
}
function permissionsFor(ctx: Ctx, s: SolutionDesign): SolutionPermissions {
  const mine = s.ownerId === ctx.user.id || s.assignedUserIds.includes(ctx.user.id);
  const upd = can(ctx.user, "solution.update", s);
  return {
    canEdit: upd && EDITABLE.includes(s.status),
    canAssign: can(ctx.user, "solution.assign", s),
    canApprove: can(ctx.user, "solution.approve", s) && !mine && s.status === "in_review",
    canSubmit: upd && EDITABLE.includes(s.status),
    canReopen: upd && s.status === "approved",
    canRebase: upd && EDITABLE.includes(s.status),
  };
}
function latestCompatible(assessmentId: ID) {
  return store
    .table("snapshots")
    .filter((x) => x.assessmentId === assessmentId && snapshotCompatibility(x).ok)
    .sort((a, b) => b.version - a.version)[0];
}
const meta = (s: AssessmentHandoffSnapshot): SolutionBaseline => ({
  snapshotId: s.id,
  snapshotVersion: s.version,
  schema: s.schema,
  approvedAt: s.approval.approvedAt,
});

// ---------- Service ----------
export interface SolutionStudioService {
  list(ctx: Ctx): Promise<SolutionListItem[]>;
  candidates(ctx: Ctx): Promise<SolutionCandidate[]>;
  get(ctx: Ctx, id: ID): Promise<SolutionView>;
  create(ctx: Ctx, input: CreateSolutionInput): Promise<SolutionDesign>;
  saveOverview(ctx: Ctx, id: ID, input: z.input<typeof OverviewInput>): Promise<void>;
  savePartner(ctx: Ctx, id: ID, input: Partial<Record<string, string>>): Promise<void>;
  upsertChild<K extends SolutionChildKind>(
    ctx: Ctx,
    id: ID,
    kind: K,
    input: SolutionChildInput<K>,
  ): Promise<ID>;
  removeChild(ctx: Ctx, id: ID, kind: SolutionChildKind, childId: ID): Promise<void>;
  assign(ctx: Ctx, id: ID, input: { ownerId?: ID; assignedUserIds?: ID[] }): Promise<void>;
  assignReviewer(ctx: Ctx, id: ID, reviewerId: ID): Promise<void>;
  addComment(ctx: Ctx, id: ID, body: string): Promise<void>;
  submitForReview(ctx: Ctx, id: ID, note?: string): Promise<void>;
  approve(ctx: Ctx, id: ID, comment?: string): Promise<SolutionHandoffSnapshot>;
  returnForRevision(ctx: Ctx, id: ID, comment: string): Promise<void>;
  reopen(ctx: Ctx, id: ID, reason: string): Promise<void>;
  previewRebase(ctx: Ctx, id: ID, targetSnapshotId?: ID): Promise<RebaseDiff>;
  rebase(ctx: Ctx, id: ID, targetSnapshotId: ID, reason: string): Promise<void>;
  reviewerCandidates(ctx: Ctx, id: ID): Promise<{ id: ID; name: string }[]>;
}

export const solutionStudio: SolutionStudioService = {
  async list(ctx) {
    await tick();
    const catalog = await catalogNow();
    return store
      .table("solutions")
      .filter((s) => can(ctx.user, "solution.read", s))
      .map((s) => ({
        solution: s,
        ownerName: directory.displayName(ctx, s.ownerId),
        assigneeNames: s.assignedUserIds.map((u) => directory.displayName(ctx, u)),
        readiness: readinessPercent(solutionReadiness(s, workspaceOf(s), baselineOf(s), catalog)),
      }));
  },

  async candidates(ctx) {
    await tick();
    if (!can(ctx.user, "solution.create")) return [];
    const sols = store.table("solutions").filter((s) => can(ctx.user, "solution.read", s));
    return store
      .table("assessments")
      .filter((a) => can(ctx.user, "assessment.read", a))
      .map((a) => ({
        assessmentId: a.id,
        assessmentTitle: a.title,
        subjectName: a.subjectName,
        type: a.type,
        snapshots: store
          .table("snapshots")
          .filter((s) => s.assessmentId === a.id)
          .sort((x, y) => y.version - x.version)
          .map((s) => {
            const c = snapshotCompatibility(s);
            return {
              id: s.id,
              version: s.version,
              approvedAt: s.approval?.approvedAt ?? s.createdAt,
              compatible: c.ok,
              ...(c.ok ? {} : { reason: c.reason }),
              existingSolutions: sols
                .filter((x) => x.baseline.snapshotId === s.id)
                .map((x) => ({ id: x.id, title: x.title, optionLabel: x.optionLabel })),
            };
          }),
      }))
      .filter((c) => c.snapshots.length > 0);
  },

  async get(ctx, id) {
    await tick();
    const s = parent(ctx, id, "solution.read");
    const ws = workspaceOf(s);
    const baseline = baselineOf(s);
    const catalog = await catalogNow();
    const latest = latestCompatible(s.assessmentId);
    const readiness = solutionReadiness(s, ws, baseline, catalog);
    const people = new Set<ID>([s.ownerId, s.createdBy, s.updatedBy, ...s.assignedUserIds]);
    if (ws.reviewerId) people.add(ws.reviewerId);
    ws.comments.forEach((c) => people.add(c.createdBy));
    ws.recommendations.forEach((r) => people.add(r.ownerId));
    const snaps = store
      .table("solutionSnapshots")
      .filter((x) => x.solutionId === s.id)
      .sort((a, b) => b.version - a.version)
      .map((x) => deepFreeze(x));
    snaps.forEach((x) => people.add(x.approval.approvedBy));
    return {
      solution: s,
      workspace: ws,
      baseline,
      newerSnapshot:
        latest && latest.version > s.baseline.snapshotVersion
          ? { id: latest.id, version: latest.version, approvedAt: latest.approval.approvedAt }
          : undefined,
      catalog,
      readiness,
      readinessPercent: readinessPercent(readiness),
      availability: Object.fromEntries(
        ws.recommendations.map((r) => [r.id, availabilityOf(r, catalog)]),
      ),
      dependencies: analyzeDependencies(dependencyInput(ws), catalog),
      snapshots: snaps,
      permissions: permissionsFor(ctx, s),
      names: Object.fromEntries([...people].map((p) => [p, directory.displayName(ctx, p)])),
    };
  },

  async create(ctx, input) {
    await tick();
    if (!can(ctx.user, "solution.create")) deny(ctx, "solution.create");
    const d = parse(ctx, CreateInput, input);
    const a = store.table("assessments").find((x) => x.id === d.assessmentId);
    if (!a || !can(ctx.user, "assessment.read", a))
      return deny(ctx, "assessment.read", d.assessmentId);
    const snap = snapshotById(d.snapshotId);
    if (!snap || snap.assessmentId !== a.id)
      return reject(ctx, "choose an approved snapshot of this assessment");
    const compat = snapshotCompatibility(snap);
    if (!compat.ok) return reject(ctx, compat.reason);
    const existing = store.table("solutions").filter((s) => s.baseline.snapshotId === snap.id);
    if (existing.length && !d.asAlternative)
      reject(
        ctx,
        "a solution already exists for this snapshot; create it intentionally as a separate option",
      );
    if (d.asAlternative) {
      if (!d.optionLabel) reject(ctx, "name the alternative option");
      if (existing.some((s) => s.optionLabel.toLowerCase() === d.optionLabel.toLowerCase()))
        reject(ctx, `an option called "${d.optionLabel}" already exists`);
    }
    const at = now();
    const sol: SolutionDesign = {
      id: newId("sol"),
      organizationId: ctx.user.organizationId,
      createdAt: at,
      createdBy: ctx.user.id,
      updatedAt: at,
      updatedBy: ctx.user.id,
      ownerId: ctx.user.id,
      teamId: ctx.user.teamId,
      assignedUserIds: [],
      assessmentId: a.id,
      kind: snap.assessment.type,
      title: d.title,
      optionLabel: d.optionLabel || "Option A",
      subjectName: snap.assessment.subjectName,
      status: "draft",
      baseline: meta(snap),
      revision: 1,
    };
    if (!can(ctx.user, "solution.create", sol)) deny(ctx, "solution.create");
    store.replace("solutions", [...store.table("solutions"), sol]);
    store.replace("solutionWorkspaces", [
      ...store.table("solutionWorkspaces"),
      blankWorkspace(sol, ctx.user.id, at),
    ]);
    audit(ctx, {
      action: "solution.create",
      resourceType: "solution",
      resourceId: sol.id,
      teamId: sol.teamId,
      ownerId: sol.ownerId,
      summary: `Created solution from ${snap.id} v${snap.version}`,
      outcome: "allowed",
    });
    return sol;
  },

  async saveOverview(ctx, id, input) {
    await tick();
    const s = parent(ctx, id, "solution.update");
    editable(ctx, s);
    const d = parse(ctx, OverviewInput, input, id);
    const ws = workspaceOf(s);
    const clean = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
    persist(ctx, s, { ...ws, overview: { ...ws.overview, ...clean } }, "Saved overview");
  },
  async savePartner(ctx, id, input) {
    await tick();
    const s = parent(ctx, id, "solution.update");
    if (s.kind !== "partner") reject(ctx, "partner details apply only to partner solutions", id);
    editable(ctx, s);
    const d = parse(ctx, PartnerInput, input, id);
    const ws = workspaceOf(s);
    const clean = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
    persist(
      ctx,
      s,
      {
        ...ws,
        partner: {
          ...(ws.partner ?? emptyPartnerSolution()),
          ...clean,
          partnershipStatus: "not_agreed",
        },
      },
      "Saved partner details",
    );
  },

  async upsertChild(ctx, id, kind, input) {
    await tick();
    const s = parent(ctx, id, "solution.update");
    editable(ctx, s);
    const schema = CHILD[kind];
    if (!schema) reject(ctx, `unknown section "${String(kind)}"`, id);
    const d = parse(ctx, schema, input, id) as Record<string, unknown> & { id?: string };
    const ws = clone(workspaceOf(s));
    const snap = baselineOf(s);
    if (!snap) return reject(ctx, "baseline snapshot is missing", id);
    const catalog = await catalogNow();
    const list = ws[kind] as unknown as ({ id: ID; createdAt: string; createdBy: ID } & Record<
      string,
      unknown
    >)[];
    const existing = d.id ? list.find((x) => x.id === d.id) : undefined;
    if (d.id && !existing) reject(ctx, `unknown ${kind} record`, id);
    const { id: _ignored, ...data } = d;
    let record: Record<string, unknown> = data;
    let action = "solution.update";

    if (kind === "needs") {
      const src = data["source"] as { kind: string; id: string };
      const found = findSource(snap, src.kind as never, src.id);
      if (!found) reject(ctx, "that item is not in the approved assessment snapshot", id);
      if (
        ws.needs.some(
          (n) => n.id !== existing?.id && n.source.kind === src.kind && n.source.id === src.id,
        )
      )
        reject(ctx, "that need is already selected", id);
      record = { ...data, source: found, sourceStatus: "current" };
    }
    if (kind === "recommendations") {
      const needIds = data["needIds"] as ID[];
      if (!needIds.every((n) => ws.needs.some((x) => x.id === n)))
        reject(ctx, "unknown need reference", id);
      const deps = data["dependsOn"] as ID[];
      if (existing && deps.includes(existing.id))
        reject(ctx, "a recommendation cannot depend on itself", id);
      if (!deps.every((x) => ws.recommendations.some((r) => r.id === x)))
        reject(ctx, "unknown recommendation dependency", id);
      const prev = existing as unknown as { catalogRefs?: CatalogRef[] } | undefined;
      const catalogRefs = pin(ctx, id, catalog, data["catalogItemIds"] as ID[], prev?.catalogRefs);
      const evidenceRefs = (data["evidenceIds"] as ID[]).map((eid) => {
        const e = snap.evidence.find((x) => x.id === eid);
        if (!e) return reject(ctx, `evidence "${eid}" is not in the baseline snapshot`, id);
        return { evidenceId: eid, materialKey: materialEvidenceKey(e) };
      });
      const ownerId =
        (data["ownerId"] as ID | undefined) ??
        (existing?.["ownerId"] as ID | undefined) ??
        ctx.user.id;
      if (
        !store.table("users").some((u) => u.id === ownerId && u.organizationId === s.organizationId)
      )
        reject(ctx, "unknown recommendation owner", id);
      const { evidenceIds: _e, catalogItemIds: _c, ...rest } = data;
      record = { ...rest, catalogRefs, evidenceRefs, ownerId, justificationStale: false };
      const probs = provenanceProblems(record as never, snap, catalog);
      if (probs.length) reject(ctx, probs.join("; "), id);
      const before = existing as unknown as
        { category?: string; catalogRefs?: CatalogRef[] } | undefined;
      const catChanged =
        JSON.stringify((before?.catalogRefs ?? []).map((c) => c.itemId)) !==
        JSON.stringify(catalogRefs.map((c) => c.itemId));
      action = catChanged ? "solution.catalog_ref" : "solution.recommendation";
    }
    if (kind === "integrations") {
      const sys = snap.systems.find((x) => x.id === data["systemId"]);
      if (!sys) return reject(ctx, "that system is not in the approved assessment snapshot", id);
      if (!(data["evidenceIds"] as ID[]).every((e) => snap.evidence.some((x) => x.id === e)))
        reject(ctx, "unknown evidence reference", id);
      const pk = data["proposalKind"] as "connector" | "custom" | "none";
      const itemId = data["catalogItemId"] as string | undefined;
      const prev = (existing as unknown as { proposal?: { catalogRef?: CatalogRef } } | undefined)
        ?.proposal?.catalogRef;
      const catalogRef =
        pk === "connector" && itemId
          ? pin(ctx, id, catalog, [itemId], prev ? [prev] : [], ["connector"])[0]
          : undefined;
      if (pk === "connector" && !catalogRef) reject(ctx, "choose the catalog connector", id);
      const { proposalKind: _p, catalogItemId: _i, ...rest } = data;
      record = {
        ...rest,
        systemName: sys.name,
        vendor: sys.vendor,
        deployment: sys.deployment,
        proposal: { kind: pk, ...(catalogRef ? { catalogRef } : {}) },
      };
      const probs = feasibilityProblems(record as never, snap, catalog);
      if (probs.length) reject(ctx, probs.join("; "), id);
    }
    if (kind === "aiDesigns") {
      const rec = ws.recommendations.find((r) => r.id === data["recommendationId"]);
      if (!rec || rec.category !== "ai")
        reject(ctx, "AI designs attach to an AI / conversational recommendation", id);
      if (data["mode"] === "write" && !data["humanConfirmation"])
        reject(ctx, "write/action behaviour requires human confirmation", id);
      const prev = (existing as unknown as { capabilityRefs?: CatalogRef[] } | undefined)
        ?.capabilityRefs;
      const capabilityRefs = pin(ctx, id, catalog, data["capabilityItemIds"] as ID[], prev, [
        "ai_capability",
        "native_app",
        "connector",
      ]);
      const { capabilityItemIds: _c, ...rest } = data;
      record = {
        ...rest,
        exampleQuestions: (rest["exampleQuestions"] as string[])
          .map((q) => q.trim())
          .filter(Boolean),
        capabilityRefs,
      };
    }
    if (kind === "roadmap") record = { ...data, status: "planning_assumption" };
    if (kind === "alternatives" && data["preferred"])
      ws.alternatives.forEach((x) => (x.preferred = false));

    const stamped = stamp(ctx, s, PREFIX[kind], record, existing);
    (ws as unknown as Record<string, unknown>)[kind] = existing
      ? (ws[kind] as unknown as { id: ID }[]).map((x) => (x.id === existing.id ? stamped : x))
      : [...(ws[kind] as unknown as { id: ID }[]), stamped];
    persist(ctx, s, ws, `${existing ? "Updated" : "Added"} ${kind} record`, action);
    return stamped.id;
  },

  async removeChild(ctx, id, kind, childId) {
    await tick();
    const s = parent(ctx, id, "solution.update");
    editable(ctx, s);
    if (!(kind in CHILD)) reject(ctx, `unknown section "${String(kind)}"`, id);
    const ws = clone(workspaceOf(s));
    const list = ws[kind] as unknown as { id: ID }[];
    if (!list.some((x) => x.id === childId)) reject(ctx, `unknown ${kind} record`, id);
    (ws as unknown as Record<string, unknown>)[kind] = list.filter((x) => x.id !== childId);
    ws.recommendations.forEach((r) => {
      r.needIds = r.needIds.filter((x) => x !== childId);
      r.dependsOn = r.dependsOn.filter((x) => x !== childId);
    });
    if (kind === "recommendations")
      ws.aiDesigns = ws.aiDesigns.filter((d) => d.recommendationId !== childId);
    persist(
      ctx,
      s,
      ws,
      `Removed ${kind} record`,
      kind === "recommendations" ? "solution.recommendation" : "solution.update",
    );
  },

  async assign(ctx, id, input) {
    await tick();
    const s = parent(ctx, id, "solution.assign");
    const users = store.table("users");
    const valid = (u: ID) =>
      users.some(
        (x) => x.id === u && x.organizationId === s.organizationId && can(x, "solution.update"),
      );
    if (input.ownerId && !valid(input.ownerId))
      reject(ctx, "owner must be a professional who can work on solutions", id);
    if (input.assignedUserIds && !input.assignedUserIds.every(valid))
      reject(ctx, "unknown assignee", id);
    persist(ctx, s, workspaceOf(s), "Changed assignment", "solution.assign", {
      ...(input.ownerId ? { ownerId: input.ownerId } : {}),
      ...(input.assignedUserIds ? { assignedUserIds: [...new Set(input.assignedUserIds)] } : {}),
    });
  },
  async reviewerCandidates(ctx, id) {
    await tick();
    const s = parent(ctx, id, "solution.read");
    return store
      .table("users")
      .filter(
        (u) =>
          u.organizationId === s.organizationId &&
          u.id !== s.ownerId &&
          !s.assignedUserIds.includes(u.id) &&
          can(u, "solution.approve", s),
      )
      .map((u) => ({ id: u.id, name: directory.displayName(ctx, u.id) }));
  },
  async assignReviewer(ctx, id, reviewerId) {
    await tick();
    const s = parent(ctx, id, "solution.update");
    const r = store.table("users").find((u) => u.id === reviewerId);
    if (
      !r ||
      r.organizationId !== s.organizationId ||
      r.id === s.ownerId ||
      s.assignedUserIds.includes(r.id) ||
      !can(r, "solution.approve", s)
    )
      reject(
        ctx,
        "reviewer must be able to approve this solution and must not own or be assigned to it",
        id,
      );
    persist(ctx, s, { ...workspaceOf(s), reviewerId }, `Assigned reviewer ${reviewerId}`);
  },
  async addComment(ctx, id, body) {
    await tick();
    const s = parent(ctx, id, "solution.read");
    if (!can(ctx.user, "solution.update", s) && !can(ctx.user, "solution.approve", s))
      deny(ctx, "solution.update", id);
    if (!body.trim()) reject(ctx, "comment is empty", id);
    const ws = clone(workspaceOf(s));
    ws.comments.push(stamp(ctx, s, "sc", { kind: "comment" as const, body: body.slice(0, 4000) }));
    persist(ctx, s, ws, "Added review comment");
  },
  async submitForReview(ctx, id, note) {
    await tick();
    const s = parent(ctx, id, "solution.update");
    if (!EDITABLE.includes(s.status))
      reject(ctx, `cannot submit a solution that is ${s.status}`, id);
    const ws = clone(workspaceOf(s));
    ws.comments.push(
      stamp(ctx, s, "sc", {
        kind: "submitted" as const,
        body: note?.trim() || "Submitted for review.",
      }),
    );
    persist(ctx, s, ws, "Submitted for review", "solution.status.in_review", {
      status: "in_review",
    });
  },
  async approve(ctx, id, comment = "") {
    await tick();
    const s = parent(ctx, id, "solution.approve");
    if (s.ownerId === ctx.user.id || s.assignedUserIds.includes(ctx.user.id))
      deny(ctx, "solution.approve", id);
    if (s.status !== "in_review")
      reject(ctx, `only solutions in review can be approved (is ${s.status})`, id);
    const ws = clone(workspaceOf(s));
    const snap = baselineOf(s);
    const catalog = await catalogNow();
    const failing = solutionReadiness(s, ws, snap, catalog).filter((i) => !i.ok);
    if (failing.length) reject(ctx, `not ready: ${failing.map((f) => f.label).join(", ")}`, id);
    const at = now();
    const used = new Set([
      ...ws.recommendations.flatMap((r) => r.catalogRefs.map((c) => c.itemId)),
      ...ws.integrations.flatMap((i) =>
        i.proposal.catalogRef ? [i.proposal.catalogRef.itemId] : [],
      ),
      ...ws.aiDesigns.flatMap((d) => d.capabilityRefs.map((c) => c.itemId)),
    ]);
    const cited = new Set([
      ...ws.recommendations.flatMap((r) => r.evidenceRefs.map((e) => e.evidenceId)),
      ...ws.integrations.flatMap((i) => i.evidenceIds),
    ]);
    // Reference closure: selected items plus their transitive catalog dependencies.
    const closure = new Set<ID>();
    const close = (itemId: ID) => {
      if (closure.has(itemId)) return;
      closure.add(itemId);
      catalog.items.find((i) => i.id === itemId)?.dependencies.forEach(close);
    };
    used.forEach(close);
    const approved = s;
    const version = store.table("solutionSnapshots").filter((x) => x.solutionId === id).length + 1;
    const out: SolutionHandoffSnapshot = deepFreeze({
      schema: SOLUTION_HANDOFF_SCHEMA,
      id: newId("ssnap"),
      organizationId: s.organizationId,
      solutionId: s.id,
      version,
      revision: approved.revision,
      createdAt: at,
      approval: { approvedBy: ctx.user.id, approvedAt: at, comment },
      solution: {
        id: approved.id,
        title: approved.title,
        optionLabel: approved.optionLabel,
        kind: approved.kind,
        subjectName: approved.subjectName,
        assessmentId: approved.assessmentId,
        ownerId: approved.ownerId,
        assignedUserIds: approved.assignedUserIds,
      },
      baseline: approved.baseline,
      overview: ws.overview,
      ...(ws.partner ? { partner: ws.partner } : {}),
      needs: ws.needs,
      recommendations: ws.recommendations.map((r) => ({
        ...r,
        availability: availabilityOf(r, catalog),
      })),
      integrations: ws.integrations,
      aiDesigns: ws.aiDesigns,
      values: ws.values,
      roadmap: ws.roadmap,
      alternatives: ws.alternatives,
      catalog: {
        catalogVersion: catalog.catalogVersion,
        retrievedAt: catalog.retrievedAt,
        items: catalog.items.filter((i) => closure.has(i.id)).map((i) => clone(i)),
      },
      sourceAssessment: clone(snap!),
      evidence: (snap?.evidence ?? []).filter((e) => cited.has(e.id)).map((e) => clone(e)),
      dependencies: analyzeDependencies(dependencyInput(ws), catalog),
    });
    const unresolved = unresolvedHandoffRefs(out);
    if (unresolved.length)
      reject(ctx, `hand-off would not be self-contained: ${unresolved.join(", ")}`, id);
    ws.comments.push(
      stamp(ctx, s, "sc", { kind: "approved" as const, body: comment.trim() || "Approved." }),
    );
    persist(ctx, s, ws, "Approved — ready for Proposal Studio", "solution.status.approved", {
      status: "approved",
    });
    store.replace("solutionSnapshots", [...store.table("solutionSnapshots"), out]);
    audit(ctx, {
      action: "solution.snapshot",
      resourceType: "solution",
      resourceId: id,
      teamId: s.teamId,
      ownerId: s.ownerId,
      summary: `Generated solution hand-off snapshot v${version}`,
      outcome: "allowed",
    });
    return deepFreeze(clone(out));
  },
  async returnForRevision(ctx, id, comment) {
    await tick();
    const s = parent(ctx, id, "solution.approve");
    if (s.ownerId === ctx.user.id || s.assignedUserIds.includes(ctx.user.id))
      deny(ctx, "solution.approve", id);
    if (s.status !== "in_review")
      reject(ctx, `only solutions in review can be returned (is ${s.status})`, id);
    if (!comment.trim()) reject(ctx, "say what needs revising", id);
    const ws = clone(workspaceOf(s));
    ws.comments.push(stamp(ctx, s, "sc", { kind: "returned" as const, body: comment.trim() }));
    persist(ctx, s, ws, "Returned for revision", "solution.status.returned", {
      status: "returned",
    });
  },
  async reopen(ctx, id, reason) {
    await tick();
    const s = parent(ctx, id, "solution.update");
    if (s.status !== "approved") reject(ctx, "only approved solutions can be reopened", id);
    if (!reason.trim()) reject(ctx, "give a reason for reopening", id);
    const ws = clone(workspaceOf(s));
    ws.comments.push(stamp(ctx, s, "sc", { kind: "reopened" as const, body: reason.trim() }));
    persist(ctx, s, ws, "Reopened for revision", "solution.status.draft", { status: "draft" });
  },

  async previewRebase(ctx, id, targetSnapshotId) {
    await tick();
    const s = parent(ctx, id, "solution.read");
    const from = baselineOf(s);
    const to = targetSnapshotId ? snapshotById(targetSnapshotId) : latestCompatible(s.assessmentId);
    if (!from || !to || to.assessmentId !== s.assessmentId)
      return reject(ctx, "no snapshot to compare with", id);
    return diffSnapshots(from, to, workspaceOf(s));
  },
  async rebase(ctx, id, targetSnapshotId, reason) {
    await tick();
    const s = parent(ctx, id, "solution.update");
    editable(ctx, s);
    if (!reason.trim()) reject(ctx, "give a reason for rebasing", id);
    const from = baselineOf(s);
    const to = snapshotById(targetSnapshotId);
    if (!from || !to || to.assessmentId !== s.assessmentId)
      return reject(ctx, "choose an approved snapshot of the same assessment", id);
    const c = snapshotCompatibility(to);
    if (!c.ok) return reject(ctx, c.reason, id);
    if (to.id === from.id) reject(ctx, "the solution is already on that snapshot", id);
    const catalog = await catalogNow();
    const ws = clone(workspaceOf(s));
    const diff = diffSnapshots(from, to, ws);
    const { revisions, ...current } = ws;
    ws.revisions = [
      ...revisions,
      {
        revision: s.revision,
        baseline: s.baseline,
        archivedAt: now(),
        archivedBy: ctx.user.id,
        reason: reason.trim(),
        workspace: clone(current),
      },
    ];
    // Re-evaluate everything that depended on the old baseline.
    ws.needs.forEach((n) => {
      const src = findSource(to, n.source.kind, n.source.id);
      n.sourceStatus = !src ? "missing" : src.label !== n.source.label ? "changed" : "current";
    });
    ws.recommendations.forEach((r) => {
      const affected = r.evidenceRefs.some((e) => diff.evidenceChanged.includes(e.evidenceId));
      if (affected) {
        r.justificationStale = true;
        if (r.provenance === "verified_assessment_fact") r.provenance = "professional_judgment";
      }
    });
    ws.integrations.forEach((i) => {
      if (!to.systems.some((x) => x.id === i.systemId)) {
        i.feasibility = "unknown";
        i.openQuestions =
          `${i.openQuestions}\nSystem no longer in the approved assessment (rebase).`.trim();
      } else if (feasibilityProblems(i, to, catalog).length) {
        i.feasibility = "unknown";
        i.openQuestions =
          `${i.openQuestions}\nFeasibility reset on rebase: supporting evidence changed.`.trim();
      }
    });
    ws.comments.push(
      stamp(ctx, s, "sc", {
        kind: "rebased" as const,
        body: `Rebased from snapshot v${from.version} to v${to.version}: ${reason.trim()}`,
      }),
    );
    persist(ctx, s, ws, `Rebased baseline v${from.version} → v${to.version}`, "solution.rebase", {
      baseline: meta(to),
      revision: s.revision + 1,
    });
  },
};

export { AccessDeniedError, ValidationError };
export { needCandidates };

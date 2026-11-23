/**
 * Assessment Studio service (Phase 2). Promise-based so a production API can
 * replace the simulated store without touching screens. Authorization reuses
 * Phase 1 `can()`; every child record inherits access from its parent
 * assessment, and lifecycle transitions only happen through the dedicated
 * workflow methods below (generic repository updates cannot set them).
 */
import { z } from "zod";
import {
  buildHandoffSnapshot,
  deepFreeze,
  completeness,
  emptyFindings,
  emptyPartner,
  emptyProfile,
  FINDING_FIELDS,
  PARTNER_FIELDS,
  materialEvidenceKey,
  POSITIVE_COMPATIBILITY,
  PROFILE_FIELDS,
  supportsCompatibility,
  type CompatibilityStatus,
  readiness,
  sectionStatuses,
  type AssessmentHandoffSnapshot,
  type FindingField,
  type PartnerField,
  type ProfileField,
  type AssessmentWorkspace,
  type EvidenceRecord,
  type Readiness,
  type SectionStatus,
} from "@/domain/assessment";
import { AccessDeniedError, can, type Permission } from "@/domain/permissions";
import { validateFinding } from "@/domain/research";
import type { AcquisitionChannel, Assessment, AssessmentType, ID } from "@/domain/types";
import { crm } from "@/integrations/adapters/mock";
import { QUESTION_BANK, QUESTION_BANK_REF } from "./question-bank";
import { _internal, directory, repos, ValidationError, type Ctx } from "./repositories";
import { newId, store } from "./store";

const { audit, denyWith } = _internal;
const clone = <T>(v: T): T => structuredClone(v);
const now = () => new Date().toISOString();
/** Drops undefined values so a partial save never blanks fields it didn't send. */
const defined = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };

/** Simulated network latency; tests set it to 0. */
export const studioConfig = { latencyMs: 120 };
const tick = () =>
  new Promise<void>((r) => (studioConfig.latencyMs ? setTimeout(r, studioConfig.latencyMs) : r()));

const EDITABLE_STATUSES = ["draft", "in_progress", "returned"];

// ---------- Public result types ----------
export interface AssessmentListItem {
  assessment: Assessment;
  businessName: string;
  ownerName: string;
  assigneeNames: string[];
  completeness: number;
}
export interface StudioPermissions {
  canEdit: boolean;
  canAssign: boolean;
  canApprove: boolean;
  canSubmit: boolean;
  canReopen: boolean;
}
export interface WorkspaceView {
  assessment: Assessment;
  workspace: AssessmentWorkspace;
  sections: SectionStatus[];
  completeness: number;
  readiness: Readiness;
  snapshots: AssessmentHandoffSnapshot[];
  permissions: StudioPermissions;
  names: Record<ID, string>;
}

// ---------- Input schemas (strict: unknown fields are rejected) ----------
const str = z.string().max(4000);
const ids = z.array(z.string()).max(200);
const level = z.enum(["low", "medium", "high", "critical"]);
const childId = z.string().optional();

const profileShape = Object.fromEntries(PROFILE_FIELDS.map(([k]) => [k, str.optional()]));
const ProfileInput = z.strictObject({
  ...profileShape,
  unknown: z.array(z.enum(PROFILE_FIELDS.map(([k]) => k) as [string, ...string[]])).optional(),
});
const PartnerInput = z.strictObject(
  Object.fromEntries(PARTNER_FIELDS.map(([k]) => [k, str.optional()])),
);
const FindingsInput = z.strictObject(
  Object.fromEntries(FINDING_FIELDS.map(([k]) => [k, str.optional()])),
);
const OverviewInput = z.strictObject({
  primaryContact: str.optional(),
  purpose: str.optional(),
  scope: str.optional(),
  summary: str.optional(),
  category: z.string().max(60).optional(),
});

const CHILD_SCHEMAS = {
  systems: z.strictObject({
    id: childId,
    name: z.string().trim().min(1, "Product/system name is required").max(200),
    vendor: str.default(""),
    category: str.default(""),
    classification: z.enum(["commercial", "custom", "spreadsheet", "manual", "legacy", "unknown"]),
    deployment: z
      .enum(["cloud", "on_premise", "hybrid", "desktop", "paper", "unknown"])
      .default("unknown"),
    departments: str.default(""),
    processesSupported: str.default(""),
    userCount: str.default(""),
    usage: str.default(""),
    satisfaction: z.enum(["unknown", "low", "medium", "high"]).default("unknown"),
    limitations: str.default(""),
    integrationNeeds: str.default(""),
    apiAvailability: z.enum(["unknown", "available", "partial", "none"]).default("unknown"),
    notes: str.default(""),
    evidenceIds: ids.default([]),
    compatibility: z
      .strictObject({
        status: z.enum(["unknown", "not_supported", "planned", "beta", "supported"]),
        evidenceIds: ids.default([]),
        note: str.default(""),
      })
      .default({ status: "unknown", evidenceIds: [], note: "" }),
  }),
  processes: z.strictObject({
    id: childId,
    department: str.default(""),
    name: z.string().trim().min(1, "Process name is required").max(200),
    currentProcess: str.default(""),
    relatedSystemIds: ids.default([]),
    evidenceIds: ids.default([]),
  }),
  painPoints: z.strictObject({
    id: childId,
    processId: z.string().min(1, "Choose the process this pain point belongs to"),
    description: z.string().trim().min(1, "Describe the pain point").max(2000),
    impact: str.default(""),
    frequency: z.enum(["unknown", "daily", "weekly", "monthly", "occasional"]).default("unknown"),
    severity: level.default("medium"),
    priority: level.default("medium"),
    desiredOutcome: str.default(""),
    workaround: str.default(""),
    relatedSystemIds: ids.default([]),
    evidenceIds: ids.default([]),
  }),
  requirements: z.strictObject({
    id: childId,
    category: z.enum([
      "objective",
      "required_capability",
      "preferred_capability",
      "workflow",
      "reporting",
      "ai",
      "security",
      "integration",
      "budget",
      "timeline",
      "constraint",
    ]),
    statement: z.string().trim().min(1, "Statement is required").max(2000),
    basis: z.enum(["confirmed", "assumption"]),
    priority: level.default("medium"),
    evidenceIds: ids.default([]),
  }),
  evidence: z.strictObject({
    id: childId,
    attribute: z.string().max(200),
    statement: z.string().max(4000),
    status: z.enum([
      "confirmed_fact",
      "research_finding",
      "ai_inference",
      "professional_assumption",
    ]),
    sources: z
      .array(
        z.strictObject({
          title: z.string().max(300),
          url: z.string().max(1000).optional(),
          publisher: z.string().max(300).optional(),
          sourceType: z.enum([
            "vendor_site",
            "vendor_documentation",
            "third_party",
            "curated_catalog",
            "interview",
            "ai_model",
          ]),
          retrievedAt: z.string(),
          observedAt: z.string().optional(),
        }),
      )
      .max(20),
    researchedAt: z.string(),
    confidence: z.union([
      z.strictObject({
        level: z.enum(["high", "medium", "low"]),
        score: z.number().optional(),
        rationale: z.string().max(1000).optional(),
      }),
      z.strictObject({ level: z.literal("unknown"), reason: z.string().max(1000) }),
    ]),
    /** Only the requested state is accepted; who/when is set by the service, never the caller. */
    verification: z.discriminatedUnion("state", [
      z.strictObject({ state: z.literal("unverified") }),
      z.strictObject({ state: z.literal("verified"), method: z.string().max(500) }),
      z.strictObject({ state: z.literal("disputed"), note: z.string().max(1000) }),
    ]),
    generatedBy: z.string().max(200).optional(),
    links: z
      .array(
        z.strictObject({
          kind: z.enum(["system", "process", "pain_point", "requirement", "finding"]),
          id: z.string(),
        }),
      )
      .max(50)
      .default([]),
    notes: str.default(""),
    applicability: z
      .enum([
        "general",
        "external_api",
        "integration_possible",
        "connector_planned",
        "connector_implemented",
        "connector_supported",
      ])
      .default("general"),
  }),
  openQuestions: z.strictObject({
    id: childId,
    text: z.string().trim().min(1, "Question text is required").max(1000),
    resolved: z.boolean().default(false),
  }),
  customQuestions: z.strictObject({
    id: childId,
    category: z.string().max(60).default("general"),
    section: z.enum([
      "overview",
      "profile",
      "partner",
      "systems",
      "processes",
      "requirements",
      "evidence",
      "findings",
      "questions",
    ]),
    prompt: z.string().trim().min(1, "Question text is required").max(1000),
    required: z.boolean().default(false),
  }),
} as const;
export type ChildKind = keyof typeof CHILD_SCHEMAS;
export type ChildInput<K extends ChildKind> = z.input<(typeof CHILD_SCHEMAS)[K]>;
const ID_PREFIX: Record<ChildKind, string> = {
  systems: "sys",
  processes: "proc",
  painPoints: "pain",
  requirements: "req",
  evidence: "ev",
  openQuestions: "oq",
  customQuestions: "cq",
};

const CreateInput = z.strictObject({
  type: z.enum(["tenant", "partner"]),
  title: z.string().trim().min(1, "Assessment name is required").max(200),
  subjectName: z.string().trim().min(1, "Organization / business is required").max(200),
  channel: z.enum([
    "direct",
    "website_self",
    "website_boss",
    "partner_referral",
    "existing_tenant",
  ]),
  category: z.string().max(60).default("general"),
  crmReferenceId: z.string().max(100).optional(),
});
export type CreateAssessmentInput = z.input<typeof CreateInput>;

const AnswerInput = z.strictObject({
  questionId: z.string().min(1),
  state: z.enum(["unanswered", "answered", "not_applicable"]),
  value: z.string().max(4000).default(""),
});

// ---------- Internal helpers ----------
function parse<S extends z.ZodType>(ctx: Ctx, schema: S, input: unknown, id?: ID): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const msg = r.error.issues
      .map((i) => (i.path.length ? `${i.path.join(".")}: ` : "") + i.message)
      .join("; ");
    return reject(ctx, msg, id);
  }
  return r.data;
}
function reject(ctx: Ctx, msg: string, id?: ID): never {
  audit(ctx, {
    action: "assessment.write",
    resourceType: "assessment",
    ...(id ? { resourceId: id } : {}),
    teamId: ctx.user.teamId,
    ownerId: ctx.user.id,
    summary: `Rejected write: ${msg}`,
    outcome: "denied",
  });
  throw new ValidationError(msg);
}
function deny(ctx: Ctx, p: Permission, id?: ID): never {
  return denyWith(ctx, "assessment", p, id);
}

/** Loads the parent and enforces the permission on it; unknown and unauthorized ids look the same. */
function parent(ctx: Ctx, id: ID, p: Permission): Assessment {
  const row = store.table("assessments").find((a) => a.id === id);
  if (!row || !can(ctx.user, "assessment.read", row) || !can(ctx.user, p, row))
    return deny(ctx, p, id);
  return row;
}
function workspaceOf(a: Assessment): AssessmentWorkspace {
  const ws = store.table("workspaces").find((w) => w.assessmentId === a.id);
  return ws ?? blankWorkspace(a, a.createdBy, a.createdAt, "general");
}
function blankWorkspace(a: Assessment, by: ID, at: string, category: string): AssessmentWorkspace {
  return {
    id: `ws_${a.id}`,
    organizationId: a.organizationId,
    createdAt: at,
    createdBy: by,
    updatedAt: at,
    updatedBy: by,
    assessmentId: a.id,
    category,
    overview: { primaryContact: "", purpose: "", scope: "", summary: "" },
    profile: emptyProfile(a.subjectName),
    ...(a.type === "partner" ? { partner: emptyPartner() } : {}),
    systems: [],
    processes: [],
    painPoints: [],
    requirements: [],
    evidence: [],
    findings: emptyFindings(),
    customQuestions: [],
    answers: [],
    openQuestions: [],
    reviewComments: [],
  };
}
function editable(ctx: Ctx, a: Assessment) {
  if (!EDITABLE_STATUSES.includes(a.status))
    reject(
      ctx,
      `assessment is ${a.status.replace("_", " ")}; it cannot be edited until returned or reopened`,
      a.id,
    );
}
function persist(
  ctx: Ctx,
  a: Assessment,
  ws: AssessmentWorkspace,
  summary: string,
  status?: Assessment["status"],
) {
  const at = now();
  const next: AssessmentWorkspace = { ...ws, updatedAt: at, updatedBy: ctx.user.id };
  const all = store.table("workspaces").filter((w) => w.assessmentId !== a.id);
  store.replace("workspaces", [...all, next]);
  // Workspace edits move a draft to in progress; a returned assessment stays returned until resubmitted.
  const nextStatus = status ?? (a.status === "draft" ? "in_progress" : a.status);
  store.replace(
    "assessments",
    store
      .table("assessments")
      .map((r) =>
        r.id === a.id ? { ...r, status: nextStatus, updatedAt: at, updatedBy: ctx.user.id } : r,
      ),
  );
  audit(ctx, {
    action: status ? `assessment.status.${status}` : "assessment.update",
    resourceType: "assessment",
    resourceId: a.id,
    teamId: a.teamId,
    ownerId: a.ownerId,
    summary,
    outcome: "allowed",
  });
}
function stamp<T extends object>(
  ctx: Ctx,
  a: Assessment,
  prefix: string,
  data: T,
  existing?: { id: ID; createdAt: string; createdBy: ID },
) {
  const at = now();
  return {
    ...data,
    id: existing?.id ?? newId(prefix),
    organizationId: a.organizationId,
    createdAt: existing?.createdAt ?? at,
    createdBy: existing?.createdBy ?? ctx.user.id,
    updatedAt: at,
    updatedBy: ctx.user.id,
  };
}
/**
 * Positive connector compatibility needs verified evidence in this assessment
 * that is about exactly that connector status and linked to that system.
 */
function checkCompatibility(
  ctx: Ctx,
  a: Assessment,
  ws: AssessmentWorkspace,
  c: { status: string; evidenceIds: ID[] },
  systemId: ID | undefined,
) {
  const status = c.status as CompatibilityStatus;
  if (!POSITIVE_COMPATIBILITY.includes(status)) return;
  if (!systemId)
    reject(
      ctx,
      `compatibility "${status}" requires verified evidence linked to a saved system; save the system first`,
      a.id,
    );
  if (!c.evidenceIds.length)
    reject(ctx, `compatibility "${status}" requires linked verified evidence`, a.id);
  for (const eid of c.evidenceIds) {
    if (
      !supportsCompatibility(
        ws.evidence.find((e) => e.id === eid),
        status,
        systemId,
      )
    )
      reject(
        ctx,
        `compatibility "${status}" requires verified evidence about that exact connector status, linked to this system; "${eid}" does not qualify`,
        a.id,
      );
  }
}
/** When evidence loses verification, applicability or its link, unsupported compatibility claims fall back to unknown. */
function downgradeUnsupported(ws: AssessmentWorkspace) {
  for (const s of ws.systems) {
    const c = s.compatibility;
    if (!POSITIVE_COMPATIBILITY.includes(c.status)) continue;
    const ok =
      c.evidenceIds.length > 0 &&
      c.evidenceIds.every((id) =>
        supportsCompatibility(
          ws.evidence.find((e) => e.id === id),
          c.status,
          s.id,
        ),
      );
    if (!ok)
      s.compatibility = {
        status: "unknown",
        evidenceIds: [],
        note: "Reset: supporting evidence no longer verified or applicable.",
      };
  }
}

/**
 * Decides the stored verification for an evidence save. A verification is kept
 * only when nothing material changed and the same method is requested; any
 * material change clears it (a confirmed fact falls back to reported
 * information) and a person must verify again explicitly.
 */
function resolveVerification(
  ctx: Ctx,
  data: Record<string, unknown>,
  prev: EvidenceRecord | undefined,
): { record: Record<string, unknown>; note: string } {
  const v = data["verification"] as { state: string; method?: string; note?: string };
  const material =
    !!prev && materialEvidenceKey(prev) !== materialEvidenceKey(data as unknown as EvidenceRecord);
  const pv = prev?.verification;
  if (prev && material && pv && pv.state !== "unverified") {
    const status = data["status"] === "confirmed_fact" ? "research_finding" : data["status"];
    return {
      record: { ...data, status, verification: { state: "unverified" } },
      note: ` (material change cleared ${pv.state === "verified" ? "verification" : "dispute"}; re-verify explicitly)`,
    };
  }
  let verification;
  if (v.state === "verified") {
    verification =
      pv?.state === "verified" && pv.method === (v.method ?? "") && !material
        ? pv
        : {
            state: "verified" as const,
            verifiedBy: ctx.user.id,
            verifiedAt: now(),
            method: v.method ?? "",
          };
  } else if (v.state === "disputed") {
    verification =
      pv?.state === "disputed" && pv.note === (v.note ?? "") && !material
        ? pv
        : {
            state: "disputed" as const,
            reviewedBy: ctx.user.id,
            reviewedAt: now(),
            note: v.note ?? "",
          };
  } else verification = { state: "unverified" as const };
  return { record: { ...data, verification }, note: "" };
}
function checkRefs(
  ctx: Ctx,
  a: Assessment,
  ws: AssessmentWorkspace,
  kind: ChildKind,
  d: Record<string, unknown>,
) {
  const has = (list: { id: ID }[], v: unknown) =>
    typeof v === "string" && list.some((x) => x.id === v);
  const all = (list: { id: ID }[], v: unknown) => !Array.isArray(v) || v.every((x) => has(list, x));
  if ("evidenceIds" in d && !all(ws.evidence, d["evidenceIds"]))
    reject(ctx, "unknown evidence reference", a.id);
  if ("relatedSystemIds" in d && !all(ws.systems, d["relatedSystemIds"]))
    reject(ctx, "unknown system reference", a.id);
  if (kind === "painPoints" && !has(ws.processes, d["processId"]))
    reject(ctx, "unknown process for pain point", a.id);
  if (kind === "evidence") {
    const lists = {
      system: ws.systems,
      process: ws.processes,
      pain_point: ws.painPoints,
      requirement: ws.requirements,
    };
    for (const l of d["links"] as { kind: string; id: ID }[]) {
      if (l.kind === "finding") {
        if (!FINDING_FIELDS.some(([k]) => k === l.id))
          reject(ctx, `unknown finding "${l.id}"`, a.id);
      } else if (!has(lists[l.kind as keyof typeof lists], l.id))
        reject(ctx, `unknown ${l.kind} "${l.id}"`, a.id);
    }
  }
}

function permissionsFor(ctx: Ctx, a: Assessment): StudioPermissions {
  const isOwnerOrAssignee = a.ownerId === ctx.user.id || a.assignedUserIds.includes(ctx.user.id);
  return {
    canEdit: can(ctx.user, "assessment.update", a) && EDITABLE_STATUSES.includes(a.status),
    canAssign: can(ctx.user, "assessment.assign", a),
    canApprove:
      can(ctx.user, "assessment.approve", a) && !isOwnerOrAssignee && a.status === "under_review",
    canSubmit: can(ctx.user, "assessment.update", a) && EDITABLE_STATUSES.includes(a.status),
    canReopen: can(ctx.user, "assessment.update", a) && a.status === "approved",
  };
}

function snapshotsOf(a: Assessment) {
  // Snapshots are returned deep-frozen; the store keeps its own copy, so neither can be altered.
  return store
    .table("snapshots")
    .filter((s) => s.assessmentId === a.id)
    .sort((x, y) => y.version - x.version)
    .map((s) => deepFreeze(s));
}

// ---------- Service ----------
export interface AssessmentStudioService {
  list(ctx: Ctx): Promise<AssessmentListItem[]>;
  get(ctx: Ctx, id: ID): Promise<WorkspaceView>;
  create(ctx: Ctx, input: CreateAssessmentInput): Promise<Assessment>;
  saveOverview(ctx: Ctx, id: ID, input: z.input<typeof OverviewInput>): Promise<void>;
  saveProfile(
    ctx: Ctx,
    id: ID,
    input: Partial<Record<ProfileField, string>> & { unknown?: ProfileField[] },
  ): Promise<void>;
  savePartner(ctx: Ctx, id: ID, input: Partial<Record<PartnerField, string>>): Promise<void>;
  saveFindings(ctx: Ctx, id: ID, input: Partial<Record<FindingField, string>>): Promise<void>;
  upsertChild<K extends ChildKind>(ctx: Ctx, id: ID, kind: K, input: ChildInput<K>): Promise<ID>;
  removeChild(ctx: Ctx, id: ID, kind: ChildKind, childId: ID): Promise<void>;
  saveAnswer(ctx: Ctx, id: ID, input: z.input<typeof AnswerInput>): Promise<void>;
  verifyAnswer(ctx: Ctx, id: ID, questionId: ID): Promise<void>;
  /** Explicitly (re-)verify evidence as the current user, now. */
  verifyEvidence(ctx: Ctx, id: ID, evidenceId: ID, method: string): Promise<void>;
  assign(ctx: Ctx, id: ID, input: { ownerId?: ID; assignedUserIds?: ID[] }): Promise<void>;
  linkCrm(ctx: Ctx, id: ID, crmId: string): Promise<void>;
  assignReviewer(ctx: Ctx, id: ID, reviewerId: ID): Promise<void>;
  addComment(ctx: Ctx, id: ID, body: string): Promise<void>;
  submitForReview(ctx: Ctx, id: ID, note?: string): Promise<void>;
  approve(ctx: Ctx, id: ID, comment?: string): Promise<AssessmentHandoffSnapshot>;
  returnForRevision(ctx: Ctx, id: ID, comment: string): Promise<void>;
  reopen(ctx: Ctx, id: ID, reason: string): Promise<void>;
  /** Users who could approve this assessment (for reviewer pickers). */
  reviewerCandidates(ctx: Ctx, id: ID): Promise<{ id: ID; name: string }[]>;
  assigneeCandidates(ctx: Ctx, id: ID): Promise<{ id: ID; name: string }[]>;
}

export const assessmentStudio: AssessmentStudioService = {
  async list(ctx) {
    await tick();
    return repos.assessments.list(ctx).map((a) => {
      const ws = workspaceOf(a);
      return {
        assessment: a,
        businessName: ws.profile.businessName || a.subjectName,
        ownerName: directory.displayName(ctx, a.ownerId),
        assigneeNames: a.assignedUserIds.map((u) => directory.displayName(ctx, u)),
        completeness: completeness(sectionStatuses(a, ws, QUESTION_BANK)),
      };
    });
  },

  async get(ctx, id) {
    await tick();
    const a = repos.assessments.get(ctx, id); // read check + audit on denial
    const ws = workspaceOf(a);
    const sections = sectionStatuses(a, ws, QUESTION_BANK);
    const people = new Set<ID>([a.ownerId, a.createdBy, a.updatedBy, ...a.assignedUserIds]);
    if (ws.reviewerId) people.add(ws.reviewerId);
    ws.reviewComments.forEach((c) => people.add(c.createdBy));
    ws.answers.forEach((x) => {
      if (x.answeredBy) people.add(x.answeredBy);
      if (x.verifiedBy) people.add(x.verifiedBy);
    });
    ws.evidence.forEach((e) => {
      if (e.verification.state === "verified") people.add(e.verification.verifiedBy);
    });
    const snaps = snapshotsOf(a);
    snaps.forEach((s) => people.add(s.approval.approvedBy));
    return {
      assessment: a,
      workspace: ws,
      sections,
      completeness: completeness(sections),
      readiness: readiness(a, sections),
      snapshots: snaps,
      permissions: permissionsFor(ctx, a),
      names: Object.fromEntries([...people].map((p) => [p, directory.displayName(ctx, p)])),
    };
  },

  async create(ctx, input) {
    await tick();
    const d = parse(ctx, CreateInput, input);
    const a = repos.assessments.create(ctx, {
      type: d.type as AssessmentType,
      title: d.title,
      subjectName: d.subjectName,
      channel: d.channel as AcquisitionChannel,
      ...(d.crmReferenceId ? { crmReferenceId: d.crmReferenceId } : {}),
    });
    const ws = blankWorkspace(a, ctx.user.id, a.createdAt, d.category);
    store.replace("workspaces", [...store.table("workspaces"), ws]);
    return a;
  },

  async saveOverview(ctx, id, input) {
    await tick();
    const a = parent(ctx, id, "assessment.update");
    editable(ctx, a);
    const d = parse(ctx, OverviewInput, input, id);
    const ws = workspaceOf(a);
    const { category, ...overview } = defined(d);
    persist(
      ctx,
      a,
      { ...ws, ...(category ? { category } : {}), overview: { ...ws.overview, ...overview } },
      "Saved overview",
    );
  },
  async saveProfile(ctx, id, input) {
    await tick();
    const a = parent(ctx, id, "assessment.update");
    editable(ctx, a);
    const d = defined(parse(ctx, ProfileInput, input, id)) as Partial<
      AssessmentWorkspace["profile"]
    >;
    const ws = workspaceOf(a);
    persist(ctx, a, { ...ws, profile: { ...ws.profile, ...d } }, "Saved business profile");
  },
  async savePartner(ctx, id, input) {
    await tick();
    const a = parent(ctx, id, "assessment.update");
    if (a.type !== "partner") reject(ctx, "partner details apply only to partner assessments", id);
    editable(ctx, a);
    const d = defined(parse(ctx, PartnerInput, input, id));
    const ws = workspaceOf(a);
    persist(
      ctx,
      a,
      {
        ...ws,
        partner: { ...(ws.partner ?? emptyPartner()), ...d, relationshipStatus: "prospective" },
      },
      "Saved partner details",
    );
  },
  async saveFindings(ctx, id, input) {
    await tick();
    const a = parent(ctx, id, "assessment.update");
    editable(ctx, a);
    const d = defined(parse(ctx, FindingsInput, input, id));
    const ws = workspaceOf(a);
    persist(ctx, a, { ...ws, findings: { ...ws.findings, ...d } }, "Saved findings");
  },

  async upsertChild(ctx, id, kind, input) {
    await tick();
    const a = parent(ctx, id, "assessment.update");
    editable(ctx, a);
    const schema = CHILD_SCHEMAS[kind];
    if (!schema) reject(ctx, `unknown section "${String(kind)}"`, id);
    const d = parse(ctx, schema, input, id) as Record<string, unknown> & { id?: string };
    const ws = clone(workspaceOf(a));
    const list = ws[kind] as unknown as { id: ID; createdAt: string; createdBy: ID }[];
    const existing = d.id ? list.find((x) => x.id === d.id) : undefined;
    if (d.id && !existing) reject(ctx, `unknown ${kind} record`, id);
    const { id: _ignored, ...data } = d;
    let record: Record<string, unknown> = data;
    let verificationNote = "";
    if (kind === "evidence") {
      const r = resolveVerification(ctx, data, existing as unknown as EvidenceRecord | undefined);
      record = r.record;
      verificationNote = r.note;
      const errors = validateFinding(record as never);
      if (errors.length) reject(ctx, `invalid evidence: ${errors.join("; ")}`, id);
    }
    checkRefs(ctx, a, ws, kind, record);
    if (kind === "systems")
      checkCompatibility(
        ctx,
        a,
        ws,
        record["compatibility"] as { status: string; evidenceIds: ID[] },
        existing?.id,
      );
    const stamped = stamp(ctx, a, ID_PREFIX[kind], record, existing);
    const nextList = existing
      ? list.map((x) => (x.id === existing.id ? stamped : x))
      : [...list, stamped];
    (ws as unknown as Record<string, unknown>)[kind] = nextList;
    if (kind === "evidence") downgradeUnsupported(ws);
    persist(ctx, a, ws, `${existing ? "Updated" : "Added"} ${kind} record${verificationNote}`);
    return stamped.id;
  },

  async removeChild(ctx, id, kind, childId) {
    await tick();
    const a = parent(ctx, id, "assessment.update");
    editable(ctx, a);
    if (!(kind in CHILD_SCHEMAS)) reject(ctx, `unknown section "${String(kind)}"`, id);
    const ws = clone(workspaceOf(a));
    const list = ws[kind] as unknown as { id: ID }[];
    if (!list.some((x) => x.id === childId)) reject(ctx, `unknown ${kind} record`, id);
    if (kind === "processes" && ws.painPoints.some((p) => p.processId === childId))
      reject(ctx, "remove this process's pain points first", id);
    (ws as unknown as Record<string, unknown>)[kind] = list.filter((x) => x.id !== childId);
    // Drop dangling references so no record points at a removed child.
    const strip = (arr: ID[]) => arr.filter((x) => x !== childId);
    ws.systems.forEach((s) => {
      s.evidenceIds = strip(s.evidenceIds);
      s.compatibility.evidenceIds = strip(s.compatibility.evidenceIds);
    });
    [...ws.processes, ...ws.painPoints].forEach((p) => {
      p.evidenceIds = strip(p.evidenceIds);
      p.relatedSystemIds = strip(p.relatedSystemIds);
    });
    ws.requirements.forEach((r) => (r.evidenceIds = strip(r.evidenceIds)));
    ws.evidence.forEach((e) => (e.links = e.links.filter((l) => l.id !== childId)));
    if (kind === "customQuestions") ws.answers = ws.answers.filter((x) => x.questionId !== childId);
    downgradeUnsupported(ws);
    persist(ctx, a, ws, `Removed ${kind} record`);
  },

  async saveAnswer(ctx, id, input) {
    await tick();
    const a = parent(ctx, id, "assessment.update");
    editable(ctx, a);
    const d = parse(ctx, AnswerInput, input, id);
    const ws = clone(workspaceOf(a));
    const known = [...QUESTION_BANK.map((q) => q.id), ...ws.customQuestions.map((q) => q.id)];
    if (!known.includes(d.questionId)) reject(ctx, "unknown question", id);
    if (d.state === "answered" && !d.value.trim())
      reject(ctx, "an answered question needs an answer", id);
    const at = now();
    const answer = {
      questionId: d.questionId,
      state: d.state,
      value: d.state === "answered" ? d.value : "",
      ...(d.state !== "unanswered" ? { answeredBy: ctx.user.id, answeredAt: at } : {}),
    };
    ws.answers = [...ws.answers.filter((x) => x.questionId !== d.questionId), answer];
    persist(ctx, a, ws, "Saved answer");
  },
  async verifyAnswer(ctx, id, questionId) {
    await tick();
    const a = parent(ctx, id, "assessment.update");
    editable(ctx, a);
    const ws = clone(workspaceOf(a));
    const ans = ws.answers.find((x) => x.questionId === questionId);
    if (!ans || ans.state !== "answered")
      reject(ctx, "only answered questions can be verified", id);
    ans!.verifiedBy = ctx.user.id;
    ans!.verifiedAt = now();
    persist(ctx, a, ws, "Verified answer");
  },

  async verifyEvidence(ctx, id, evidenceId, method) {
    await tick();
    const a = parent(ctx, id, "assessment.update");
    editable(ctx, a);
    if (!method.trim()) reject(ctx, "say how the evidence was verified", id);
    const ws = clone(workspaceOf(a));
    const e = ws.evidence.find((x) => x.id === evidenceId);
    if (!e) return reject(ctx, "unknown evidence record", id);
    if (e.status === "ai_inference" || e.status === "professional_assumption")
      reject(ctx, "reclassify this evidence before verifying it", id);
    e.verification = {
      state: "verified",
      verifiedBy: ctx.user.id,
      verifiedAt: now(),
      method: method.trim().slice(0, 500),
    };
    e.updatedAt = now();
    e.updatedBy = ctx.user.id;
    const errors = validateFinding(e);
    if (errors.length) reject(ctx, `invalid evidence: ${errors.join("; ")}`, id);
    persist(ctx, a, ws, `Verified evidence ${evidenceId}`);
  },

  async assign(ctx, id, input) {
    await tick();
    parent(ctx, id, "assessment.read");
    // Phase 1 repository enforces assign scope and target validity.
    repos.assessments.update(ctx, id, {
      ...(input.ownerId ? { ownerId: input.ownerId } : {}),
      ...(input.assignedUserIds ? { assignedUserIds: input.assignedUserIds } : {}),
    });
  },
  async linkCrm(ctx, id, crmId) {
    const a = parent(ctx, id, "assessment.update");
    const r = await crm.getRecord(crmId);
    if (!r.ok) reject(ctx, `CRM lookup failed: ${r.error}`, id);
    if (!r.ok || !r.data) return reject(ctx, "CRM record not found", id);
    const link = await crm.linkAssessment(a.id, crmId);
    if (!link.ok) reject(ctx, `CRM link failed: ${link.error}`, id);
    repos.assessments.update(ctx, id, { crmReferenceId: crmId });
  },

  async reviewerCandidates(ctx, id) {
    await tick();
    const a = parent(ctx, id, "assessment.read");
    return store
      .table("users")
      .filter(
        (u) =>
          u.organizationId === a.organizationId &&
          u.id !== a.ownerId &&
          can(u, "assessment.approve", a),
      )
      .map((u) => ({ id: u.id, name: directory.displayName(ctx, u.id) }));
  },
  async assigneeCandidates(ctx, id) {
    await tick();
    const a = parent(ctx, id, "assessment.assign");
    return store
      .table("users")
      .filter((u) => u.organizationId === a.organizationId && can(u, "assessment.update"))
      .map((u) => ({ id: u.id, name: directory.displayName(ctx, u.id) }));
  },
  async assignReviewer(ctx, id, reviewerId) {
    await tick();
    const a = parent(ctx, id, "assessment.assign");
    const reviewer = store.table("users").find((u) => u.id === reviewerId);
    if (!reviewer || reviewer.organizationId !== a.organizationId)
      reject(ctx, "unknown reviewer", id);
    if (reviewer!.id === a.ownerId || !can(reviewer!, "assessment.approve", a))
      reject(ctx, "reviewer must be able to approve this assessment and must not own it", id);
    const ws = workspaceOf(a);
    persist(ctx, a, { ...ws, reviewerId }, `Assigned reviewer ${reviewerId}`, a.status);
  },
  async addComment(ctx, id, body) {
    await tick();
    const a = parent(ctx, id, "assessment.read");
    const canComment =
      can(ctx.user, "assessment.update", a) || can(ctx.user, "assessment.approve", a);
    if (!canComment) deny(ctx, "assessment.update", id);
    if (!body.trim()) reject(ctx, "comment is empty", id);
    const ws = clone(workspaceOf(a));
    ws.reviewComments.push(
      stamp(ctx, a, "rc", { kind: "comment" as const, body: body.slice(0, 4000) }),
    );
    persist(ctx, a, ws, "Added review comment", a.status);
  },

  async submitForReview(ctx, id, note) {
    await tick();
    const a = parent(ctx, id, "assessment.update");
    if (!EDITABLE_STATUSES.includes(a.status))
      reject(ctx, `cannot submit an assessment that is ${a.status}`, id);
    const ws = clone(workspaceOf(a));
    ws.reviewComments.push(
      stamp(ctx, a, "rc", {
        kind: "submitted" as const,
        body: note?.trim() || "Submitted for review.",
      }),
    );
    persist(ctx, a, ws, "Submitted for review", "under_review");
  },
  async approve(ctx, id, comment = "") {
    await tick();
    const a = parent(ctx, id, "assessment.approve");
    if (a.ownerId === ctx.user.id || a.assignedUserIds.includes(ctx.user.id))
      deny(ctx, "assessment.approve", id); // separation of duties
    if (a.status !== "under_review")
      reject(ctx, `only assessments in review can be approved (is ${a.status})`, id);
    const ws = clone(workspaceOf(a));
    const missing = sectionStatuses(a, ws, QUESTION_BANK).filter((s) => !s.complete);
    if (missing.length)
      reject(ctx, `incomplete sections: ${missing.map((s) => s.label).join(", ")}`, id);
    const at = now();
    ws.reviewComments.push(
      stamp(ctx, a, "rc", { kind: "approved" as const, body: comment.trim() || "Approved." }),
    );
    persist(ctx, a, ws, "Approved — ready for Solution Studio", "approved");
    const approved = store.table("assessments").find((r) => r.id === id)!;
    const snap = buildHandoffSnapshot(
      approved,
      workspaceOf(approved),
      {
        id: newId("snap"),
        version: snapshotsOf(a).length + 1,
        approvedBy: ctx.user.id,
        approvedAt: at,
        comment,
      },
      QUESTION_BANK,
      QUESTION_BANK_REF,
    );
    store.replace("snapshots", [...store.table("snapshots"), snap]);
    audit(ctx, {
      action: "assessment.snapshot",
      resourceType: "assessment",
      resourceId: id,
      teamId: a.teamId,
      ownerId: a.ownerId,
      summary: `Generated hand-off snapshot v${snap.version}`,
      outcome: "allowed",
    });
    return deepFreeze(clone(snap));
  },
  async returnForRevision(ctx, id, comment) {
    await tick();
    const a = parent(ctx, id, "assessment.approve");
    if (a.ownerId === ctx.user.id || a.assignedUserIds.includes(ctx.user.id))
      deny(ctx, "assessment.approve", id);
    if (a.status !== "under_review")
      reject(ctx, `only assessments in review can be returned (is ${a.status})`, id);
    if (!comment.trim()) reject(ctx, "say what needs revising", id);
    const ws = clone(workspaceOf(a));
    ws.reviewComments.push(
      stamp(ctx, a, "rc", { kind: "returned" as const, body: comment.trim() }),
    );
    persist(ctx, a, ws, "Returned for revision", "returned");
  },
  async reopen(ctx, id, reason) {
    await tick();
    const a = parent(ctx, id, "assessment.update");
    if (a.status !== "approved") reject(ctx, "only approved assessments can be reopened", id);
    if (!reason.trim()) reject(ctx, "give a reason for reopening", id);
    const ws = clone(workspaceOf(a));
    ws.reviewComments.push(stamp(ctx, a, "rc", { kind: "reopened" as const, body: reason.trim() }));
    // Earlier snapshots stay untouched; a new approval creates the next version.
    persist(ctx, a, ws, "Reopened for revision", "in_progress");
  },
};

export { AccessDeniedError, ValidationError };

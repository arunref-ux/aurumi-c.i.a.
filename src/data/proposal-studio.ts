/**
 * Proposal Studio service (Phase 4). Promise-based so a production API can
 * replace the simulated store. Proposals are created only from approved,
 * compatible solution hand-offs (schema /2) and pinned to that exact version.
 * Every operation is authorized with Phase 1 `can()`; review, approval, issue,
 * sharing and responses go only through the workflow methods below.
 */
import { z } from "zod";
import { canonical, deepFreeze } from "@/domain/assessment";
import { AccessDeniedError, can, type Permission } from "@/domain/permissions";
import {
  buildProposalDocument,
  calculateCommercials,
  classifyDeliverable,
  draftSections,
  effectiveResponse,
  handoffCompatibility,
  isStudio,
  materialHash,
  PRICE_BOOK_CATEGORIES,
  priceRefOf,
  priceRefProblem,
  priceUseProblems,
  proposalClock,
  validityEnd,
  requiredPermits,
  shareExpiry,
  versionIntegrityProblems,
  HASH_CONTRACT,
  isLegacyVersion,
  PROPOSAL_VERSION_SCHEMA,
  proposalReadiness,
  readinessPercent,
  ROADMAP_LABEL,
  SEVERITY_RANK,
  simulatedDraft,
  sourceOf,
  sourcedRisks,
  TRACKS,
  versionState,
  type CommercialLine,
  type CommercialSummary,
  type ContentKey,
  type DeliverableInfo,
  type ProposalDocument,
  type ProposalShareRecord,
  type ProposalSource,
  type ProposalVersionRecord,
  type ProposalWorkspace,
  type ReadinessItem,
  type ShareResponse,
  type StudioProposal,
} from "@/domain/proposal";
import type { SolutionHandoffSnapshot } from "@/domain/solution";
import type { ID, Proposal, ProposalStatus, ProposalTrack } from "@/domain/types";
import { pricingStudio, type PriceBook } from "@/integrations/adapters/pricing-studio";
import { proposalShareAdapter } from "@/integrations/adapters/proposal-share";
import { _internal, directory, ValidationError, type Ctx } from "./repositories";
import { newId, store } from "./store";

const { audit, denyWith } = _internal;
const clone = <T>(v: T): T => structuredClone(v);
const now = () => new Date().toISOString();
export const proposalConfig = { latencyMs: 120 };
const tick = () =>
  new Promise<void>((r) =>
    proposalConfig.latencyMs ? setTimeout(r, proposalConfig.latencyMs) : r(),
  );
/** Statuses in which the working draft may change; edits to an approved draft invalidate the approval. */
const EDITABLE: ProposalStatus[] = ["draft", "changes_requested", "approved"];

/** Legacy sample proposals predate Proposal Studio and have no approved solution source. */
export class LegacyProposalError extends ValidationError {
  constructor() {
    super(
      "This sample proposal predates Proposal Studio and has no approved solution source, so it is read-only.",
    );
    this.name = "LegacyProposalError";
  }
}

// ---------- Result types ----------
export interface ProposalListItem {
  proposal: Proposal;
  legacy: boolean;
  ownerName: string;
  sourceLabel: string;
  versionNumber: number;
  valueLabel: string;
  readiness: number;
}
export interface ProposalCandidate {
  solutionId: ID;
  solutionTitle: string;
  subjectName: string;
  kind: "tenant" | "partner";
  snapshots: {
    id: ID;
    version: number;
    approvedAt: string;
    compatible: boolean;
    reason?: string;
    existingProposals: { id: ID; title: string; track: ProposalTrack }[];
  }[];
}
export interface ProposalPermissions {
  canEdit: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canAuthorizeCommercials: boolean;
  canIssue: boolean;
  canShare: boolean;
  canRevise: boolean;
  canRebase: boolean;
}
export interface ProposalView {
  proposal: StudioProposal;
  workspace: ProposalWorkspace;
  source: SolutionHandoffSnapshot | undefined;
  newerSource: { id: ID; version: number; approvedAt: string } | undefined;
  priceBook: PriceBook;
  readiness: ReadinessItem[];
  readinessPercent: number;
  deliverables: Record<ID, DeliverableInfo>;
  commercials: CommercialSummary;
  versions: ProposalVersionRecord[];
  shares: (ProposalShareRecord & { effective: ShareResponse })[];
  draftHash: string;
  /** Preview of the working draft as it would be issued. */
  preview: ProposalDocument | undefined;
  permissions: ProposalPermissions;
  names: Record<ID, string>;
}
export interface ProposalRebaseDiff {
  from: { id: ID; version: number };
  to: { id: ID; version: number };
  added: { id: ID; title: string }[];
  removed: { id: ID; title: string }[];
  changed: { id: ID; title: string; changes: string[] }[];
  integrationChanges: string[];
  newRisks: string[];
  affectedDeliverables: ID[];
}

// ---------- Input schemas (strict) ----------
const str = z.string().max(4000);
const ids = z.array(z.string()).max(200);
const childId = z.string().optional();
const money = z.number().finite().nonnegative().max(1e12);
const party = z.enum(["aurumi", "customer", "partner", "third_party", "shared"]);
const CreateInput = z.strictObject({
  solutionSnapshotId: z.string().min(1),
  track: z.enum(["tenant_solution", "tenant_commercial", "reseller_partner", "strategic_partner"]),
  title: z.string().trim().min(1, "Proposal title is required").max(200),
});
export type CreateProposalInput = z.input<typeof CreateInput>;
const MetaInput = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(),
  validityDays: z.number().int().min(1).max(365).optional(),
  commercialNotes: str.optional(),
  recipient: z
    .strictObject({
      name: z.string().max(200),
      organization: z.string().max(200),
      contact: z.string().max(300),
    })
    .optional(),
});
const SectionInput = z.strictObject({
  body: z.string().max(20000),
  reviewed: z.boolean().optional(),
});

const CHILD = {
  deliverables: z.strictObject({
    id: childId,
    recommendationId: z.string().min(1),
    description: str.default(""),
    inclusion: z.enum(["included", "optional", "excluded"]).default("included"),
    acceptanceCriterion: str.default(""),
    responsibleParty: party.default("aurumi"),
    customerDependencies: str.default(""),
    deliveryAssumptions: str.default(""),
    qualification: str.default(""),
  }),
  lines: z.strictObject({
    id: childId,
    category: z.enum([
      "aurumi_subscription",
      "connector_addon",
      "implementation",
      "training",
      "third_party",
      "custom_development",
      "advisory",
      "discount",
    ]),
    classification: z.enum(["priced", "estimated", "tbd", "excluded"]).default("priced"),
    description: str.default(""),
    quantity: z.number().finite().positive().max(1e6).default(1),
    priceBookItemId: z.string().optional(),
    recurrence: z.enum(["one_time", "monthly", "annual"]).optional(),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code")
      .optional(),
    estimate: z
      .strictObject({
        unitAmount: money,
        basis: z.string().trim().min(1, "State the estimate's basis"),
      })
      .optional(),
    quoted: z.strictObject({ unitAmount: money }).optional(),
    override: z
      .strictObject({
        unitAmount: money,
        rationale: z.string().trim().min(1, "A price override needs a rationale"),
      })
      .optional(),
    discount: z
      .strictObject({
        amount: money.positive(),
        rationale: z.string().trim().min(1, "A discount needs a rationale"),
      })
      .optional(),
    quoteReference: str.default(""),
    // Omitted on an update = keep the stored capability; null = explicitly remove it.
    catalogItemId: z.string().trim().min(1).nullable().optional(),
    priceException: z
      .strictObject({
        rationale: z.string().trim().min(1, "A price exception needs a rationale"),
        permits: z.array(z.enum(["applicability", "expired"])).min(1),
      })
      .optional(),
  }),
  taxes: z.strictObject({
    id: childId,
    label: z.string().trim().min(1).max(100),
    ratePercent: z.number().finite().min(0).max(100),
    appliesTo: z.enum(["one_time", "recurring", "all"]).default("all"),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/),
    source: z.string().trim().min(1, "State where this tax rate comes from (never invented)"),
  }),
  partnerTerms: z.strictObject({
    id: childId,
    kind: z.enum(["commission", "revenue_share", "exclusivity", "territory", "other"]),
    description: z.string().trim().min(1).max(2000),
  }),
  risks: z.strictObject({
    id: childId,
    category: z.enum([
      "customer_prerequisites",
      "technical_feasibility",
      "unverified_integrations",
      "data_access",
      "security_privacy",
      "third_party_licensing",
      "implementation_dependencies",
      "training_adoption",
      "delivery_risks",
      "scope_exclusions",
      "change_control",
    ]),
    description: z.string().trim().min(1).max(2000),
    severity: z.enum(["high", "medium", "low"]).default("medium"),
    resolution: z.enum(["open", "resolved", "accepted"]).default("open"),
    qualification: str.default(""),
  }),
  milestones: z.strictObject({
    id: childId,
    title: z.string().trim().min(1).max(200),
    roadmapId: z.string().optional(),
    deliverableIds: ids.default([]),
    dependencies: str.default(""),
    responsibleParty: party.default("shared"),
    customerObligations: str.default(""),
    indicativeDuration: str.default(""),
    acceptanceCriteria: str.default(""),
    paymentTrigger: str.default(""),
  }),
  options: z.strictObject({
    id: childId,
    kind: z.enum(["recommended", "lower_scope", "expanded", "optional_module", "phased"]),
    label: z.string().trim().min(1).max(200),
    summary: str.default(""),
    deliverableIds: ids.default([]),
    lineIds: ids.default([]),
    assumptions: str.default(""),
    dependencies: str.default(""),
  }),
} as const;
export type ProposalChildKind = keyof typeof CHILD;
export type ProposalChildInput<K extends ProposalChildKind> = z.input<(typeof CHILD)[K]>;
const PREFIX: Record<ProposalChildKind, string> = {
  deliverables: "dlv",
  lines: "cl",
  taxes: "tax",
  partnerTerms: "pt",
  risks: "rsk",
  milestones: "ms",
  options: "opt",
};

// ---------- Helpers ----------
function reject(ctx: Ctx, msg: string, id?: ID): never {
  audit(ctx, {
    action: "proposal.write",
    resourceType: "proposal",
    ...(id ? { resourceId: id } : {}),
    teamId: ctx.user.teamId,
    ownerId: ctx.user.id,
    summary: `Rejected: ${msg}`,
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
const deny = (ctx: Ctx, p: Permission, id?: ID): never => denyWith(ctx, "proposal", p, id);
/** Unknown and unauthorized ids look the same. */
function parent(ctx: Ctx, id: ID, p: Permission): StudioProposal {
  const row = store.table("proposals").find((x) => x.id === id);
  if (!row || !can(ctx.user, "proposal.read", row) || !can(ctx.user, p, row))
    return deny(ctx, p, id);
  if (!isStudio(row)) throw new LegacyProposalError();
  return row;
}
const involved = (ctx: Ctx, p: Proposal) =>
  p.ownerId === ctx.user.id || p.assignedUserIds.includes(ctx.user.id);
/** Reviewers may not approve their own work. */
function approver(ctx: Ctx, id: ID): StudioProposal {
  const p = parent(ctx, id, "proposal.approve");
  if (involved(ctx, p)) deny(ctx, "proposal.approve", id);
  return p;
}
function editable(ctx: Ctx, p: StudioProposal) {
  if (!EDITABLE.includes(p.status))
    reject(
      ctx,
      `proposal is ${p.status.replace("_", " ")}; revise it to create a new working draft`,
      p.id,
    );
}
function workspaceOf(p: StudioProposal): ProposalWorkspace {
  const ws = store.table("proposalWorkspaces").find((w) => w.proposalId === p.id);
  if (!ws) throw new ValidationError("proposal workspace is missing");
  return ws;
}
const handoffById = (id: ID) => store.table("solutionSnapshots").find((s) => s.id === id);
const handoffOf = (p: StudioProposal) => handoffById(p.source.solutionSnapshotId);
async function priceBookNow(): Promise<PriceBook> {
  const r = await pricingStudio.getPriceBook();
  if (!r.ok) throw new ValidationError(`Pricing Studio unavailable: ${r.error}`);
  return r.data;
}
const versionsOf = (id: ID) =>
  store
    .table("proposalVersions")
    .filter((v) => v.proposalId === id)
    .sort((a, b) => b.versionNumber - a.versionNumber);
const currentVersion = (p: Proposal) =>
  p.currentVersionId
    ? store.table("proposalVersions").find((v) => v.id === p.currentVersionId)
    : undefined;
function patchVersion(id: ID, patch: Partial<ProposalVersionRecord>) {
  store.replace(
    "proposalVersions",
    store.table("proposalVersions").map((v) => (v.id === id ? { ...v, ...patch } : v)),
  );
}
function stamp<T extends object>(
  ctx: Ctx,
  p: Proposal,
  prefix: string,
  data: T,
  existing?: { id: ID; createdAt: string; createdBy: ID },
) {
  const at = now();
  return {
    ...data,
    id: existing?.id ?? newId(prefix),
    organizationId: p.organizationId,
    createdAt: existing?.createdAt ?? at,
    createdBy: existing?.createdBy ?? ctx.user.id,
    updatedAt: at,
    updatedBy: ctx.user.id,
  };
}
function persistMeta(
  ctx: Ctx,
  p: StudioProposal,
  patch: Partial<StudioProposal>,
  action: string,
  summary: string,
) {
  const at = now();
  store.replace(
    "proposals",
    store
      .table("proposals")
      .map((r) => (r.id === p.id ? { ...r, ...patch, updatedAt: at, updatedBy: ctx.user.id } : r)),
  );
  audit(ctx, {
    action,
    resourceType: "proposal",
    resourceId: p.id,
    teamId: p.teamId,
    ownerId: p.ownerId,
    summary,
    outcome: "allowed",
  });
}
/**
 * Saves a working-draft change. A change to an approved draft invalidates that
 * approval: the version is superseded and the proposal returns to draft.
 */
function persist(
  ctx: Ctx,
  p: StudioProposal,
  ws: ProposalWorkspace,
  summary: string,
  action = "proposal.update",
  patch: Partial<StudioProposal> = {},
) {
  const at = now();
  const next = { ...p, ...patch };
  if (
    p.status === "approved" &&
    materialHash(next, next.source, ws) !== materialHash(p, p.source, workspaceOf(p))
  ) {
    const v = currentVersion(p);
    if (v && !v.issue) patchVersion(v.id, { supersededAt: at });
    ws = {
      ...ws,
      comments: [
        ...ws.comments,
        stamp(ctx, p, "pc", {
          kind: "invalidated" as const,
          body: `Approval of v${v?.versionNumber ?? "?"} invalidated by a change: ${summary}`,
        }),
      ],
    };
    patch = { ...patch, status: "draft" };
    audit(ctx, {
      action: "proposal.approval_invalidated",
      resourceType: "proposal",
      resourceId: p.id,
      teamId: p.teamId,
      ownerId: p.ownerId,
      summary: `Approval invalidated by: ${summary}`,
      outcome: "allowed",
    });
  }
  store.replace("proposalWorkspaces", [
    ...store.table("proposalWorkspaces").filter((w) => w.proposalId !== p.id),
    { ...ws, updatedAt: at, updatedBy: ctx.user.id },
  ]);
  const includesPricing = ws.lines.some(
    (l) => l.classification === "priced" || l.classification === "estimated",
  );
  persistMeta(ctx, p, { ...patch, includesPricing }, action, summary);
}
function permissionsFor(ctx: Ctx, p: StudioProposal): ProposalPermissions {
  const upd = can(ctx.user, "proposal.update", p);
  const appr = can(ctx.user, "proposal.approve", p) && !involved(ctx, p);
  const share = can(ctx.user, "proposal.share", p);
  return {
    canEdit: upd && EDITABLE.includes(p.status),
    canSubmit: upd && (p.status === "draft" || p.status === "changes_requested"),
    canApprove: appr && p.status === "in_review",
    canAuthorizeCommercials: appr && (p.status === "draft" || p.status === "changes_requested"),
    canIssue: share && p.status === "approved",
    canShare: share && p.status === "shared",
    canRevise:
      upd && ["approved", "shared", "declined", "expired", "changes_requested"].includes(p.status),
    canRebase: upd && EDITABLE.includes(p.status),
  };
}
function latestHandoff(solutionId: ID) {
  return store
    .table("solutionSnapshots")
    .filter((s) => s.solutionId === solutionId && handoffCompatibility(s).ok)
    .sort((a, b) => b.version - a.version)[0];
}
function valueLabel(sum: CommercialSummary) {
  if (!sum.totals.length) return "—";
  return sum.totals
    .map((t) =>
      [
        t.oneTime ? `${t.currency} ${t.oneTime.toLocaleString("en-IN")} one-time` : "",
        t.monthly ? `${t.currency} ${t.monthly.toLocaleString("en-IN")}/mo` : "",
        t.annual ? `${t.currency} ${t.annual.toLocaleString("en-IN")}/yr` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    )
    .join(" | ");
}
const readinessFailures = (
  p: StudioProposal,
  ws: ProposalWorkspace,
  h: SolutionHandoffSnapshot | undefined,
  book: PriceBook,
) => proposalReadiness(p, ws, h, book).filter((i) => !i.ok);
/**
 * Everything a workflow decision depends on. Captured before any asynchronous
 * adapter call and compared afterwards, so a decision never commits against
 * state that changed while it was waiting.
 */
function fingerprint(id: ID): string {
  const p = store.table("proposals").find((x) => x.id === id);
  if (!p || !isStudio(p)) return "missing";
  const ws = store.table("proposalWorkspaces").find((w) => w.proposalId === id);
  const v = currentVersion(p);
  return canonical({
    status: p.status,
    revision: p.revision,
    currentVersionId: p.currentVersionId ?? null,
    source: p.source,
    hash: ws ? materialHash(p, p.source, ws) : null,
    version: v
      ? { id: v.id, hash: v.contentHash, review: v.review, issue: v.issue, sup: v.supersededAt }
      : null,
  });
}
function unchanged(ctx: Ctx, id: ID, before: string, what: string) {
  if (fingerprint(id) !== before)
    reject(
      ctx,
      `the proposal changed while ${what}; nothing was changed — reload and try again`,
      id,
    );
}
const LEGACY_REMEDY =
  "this unmarked historical version (proposal-content-hash/1 or historical /2) stays as history only; revise the proposal and resubmit to create an explicitly strengthened new version for fresh approval";
/** Problems that stop an exact stored version from being approved or issued. */
function versionDefects(v: ProposalVersionRecord, book: PriceBook | null, at: string): string[] {
  const out = versionIntegrityProblems(v).map((x) => `version integrity: ${x}`);
  if (isLegacyVersion(v)) out.unshift(LEGACY_REMEDY);
  for (const l of v.document.commercials.lines) {
    if (book && l.priceRef) {
      const prob = priceRefProblem(l.priceRef, book);
      if (prob) out.push(prob);
    }
    out.push(...priceUseProblems(l, at));
  }
  return out;
}
function qualificationIds(doc: ProposalDocument) {
  return [
    ...doc.deliverables.filter((d) => d.info.needsQualification).map((d) => d.id),
    ...doc.risks.filter((r) => r.resolution === "accepted").map((r) => r.id),
  ];
}

// ---------- Service ----------
export interface ProposalStudioService {
  list(ctx: Ctx): Promise<ProposalListItem[]>;
  candidates(ctx: Ctx): Promise<ProposalCandidate[]>;
  get(ctx: Ctx, id: ID): Promise<ProposalView>;
  create(ctx: Ctx, input: CreateProposalInput): Promise<StudioProposal>;
  saveMeta(ctx: Ctx, id: ID, input: z.input<typeof MetaInput>): Promise<void>;
  saveSection(
    ctx: Ctx,
    id: ID,
    key: ContentKey,
    input: z.input<typeof SectionInput>,
  ): Promise<void>;
  draftSection(ctx: Ctx, id: ID, key: ContentKey): Promise<void>;
  upsertChild<K extends ProposalChildKind>(
    ctx: Ctx,
    id: ID,
    kind: K,
    input: ProposalChildInput<K>,
  ): Promise<ID>;
  removeChild(ctx: Ctx, id: ID, kind: ProposalChildKind, childId: ID): Promise<void>;
  refreshPrices(ctx: Ctx, id: ID): Promise<void>;
  authorizeCommercial(
    ctx: Ctx,
    id: ID,
    input: { kind: "override" | "discount" | "exception" | "term"; itemId: ID },
  ): Promise<void>;
  addComment(ctx: Ctx, id: ID, body: string): Promise<void>;
  submitForReview(ctx: Ctx, id: ID, note?: string): Promise<ProposalVersionRecord>;
  approve(
    ctx: Ctx,
    id: ID,
    versionId: ID,
    input?: { comment?: string; acknowledged?: ID[] },
  ): Promise<void>;
  requestChanges(ctx: Ctx, id: ID, versionId: ID, comment: string): Promise<void>;
  issue(ctx: Ctx, id: ID, versionId: ID): Promise<ProposalVersionRecord>;
  share(
    ctx: Ctx,
    id: ID,
    input: {
      versionId: ID;
      recipient: { name: string; email: string; organization?: string };
      expiresAt?: string;
    },
  ): Promise<ProposalShareRecord>;
  recordResponse(
    ctx: Ctx,
    shareId: ID,
    input: { response: Exclude<ShareResponse, "pending">; note?: string },
  ): Promise<void>;
  revokeShare(ctx: Ctx, shareId: ID): Promise<void>;
  revise(ctx: Ctx, id: ID, reason: string): Promise<void>;
  previewRebase(ctx: Ctx, id: ID, targetSnapshotId?: ID): Promise<ProposalRebaseDiff>;
  rebase(ctx: Ctx, id: ID, targetSnapshotId: ID, reason: string): Promise<void>;
}

export const proposalStudio: ProposalStudioService = {
  async list(ctx) {
    await tick();
    const book = await priceBookNow();
    return store
      .table("proposals")
      .filter((p) => can(ctx.user, "proposal.read", p))
      .map((p) => {
        if (!isStudio(p))
          return {
            proposal: p,
            legacy: true,
            ownerName: directory.displayName(ctx, p.ownerId),
            sourceLabel: "Earlier sample — no approved solution source",
            versionNumber: 0,
            valueLabel: "—",
            readiness: 0,
          };
        const ws = store.table("proposalWorkspaces").find((w) => w.proposalId === p.id);
        const h = handoffOf(p);
        return {
          proposal: p,
          legacy: false,
          ownerName: directory.displayName(ctx, p.ownerId),
          sourceLabel: `${h?.solution.title ?? p.source.solutionId} · v${p.source.solutionSnapshotVersion}`,
          versionNumber: versionsOf(p.id)[0]?.versionNumber ?? 0,
          valueLabel: ws ? valueLabel(calculateCommercials(ws.lines, ws.taxes)) : "—",
          readiness: ws ? readinessPercent(proposalReadiness(p, ws, h, book)) : 0,
        };
      });
  },

  async candidates(ctx) {
    await tick();
    if (!can(ctx.user, "proposal.create")) return [];
    const props = store
      .table("proposals")
      .filter((p) => can(ctx.user, "proposal.read", p) && isStudio(p)) as StudioProposal[];
    return store
      .table("solutions")
      .filter((s) => can(ctx.user, "solution.read", s))
      .map((s) => ({
        solutionId: s.id,
        solutionTitle: s.title,
        subjectName: s.subjectName,
        kind: s.kind,
        snapshots: store
          .table("solutionSnapshots")
          .filter((h) => h.solutionId === s.id)
          .sort((a, b) => b.version - a.version)
          .map((h) => {
            const c = handoffCompatibility(h);
            return {
              id: h.id,
              version: h.version,
              approvedAt: h.approval.approvedAt,
              compatible: c.ok,
              ...(c.ok ? {} : { reason: c.reason }),
              existingProposals: props
                .filter((p) => p.source.solutionSnapshotId === h.id)
                .map((p) => ({ id: p.id, title: p.title, track: p.track })),
            };
          }),
      }))
      .filter((c) => c.snapshots.length > 0);
  },

  async get(ctx, id) {
    await tick();
    const p = parent(ctx, id, "proposal.read");
    const ws = workspaceOf(p);
    const h = handoffOf(p);
    const book = await priceBookNow();
    const readiness = proposalReadiness(p, ws, h, book);
    const latest = latestHandoff(p.source.solutionId);
    const people = new Set<ID>([p.ownerId, p.createdBy, p.updatedBy, ...p.assignedUserIds]);
    ws.comments.forEach((c) => people.add(c.createdBy));
    const versions = versionsOf(p.id).map((v) => deepFreeze(v));
    versions.forEach((v) => {
      people.add(v.createdBy);
      if (v.review) people.add(v.review.by);
      if (v.issue) people.add(v.issue.issuedBy);
    });
    const shares = store
      .table("proposalShares")
      .filter((s) => s.proposalId === p.id)
      .map((s) => ({
        ...s,
        effective: effectiveResponse(
          s,
          proposalClock.now(),
          versions.find((v) => v.id === s.versionId)?.issue?.expiresAt ?? "invalid",
        ),
      }));
    shares.forEach((s) => people.add(s.sharedBy));
    return {
      proposal: p,
      workspace: ws,
      source: h,
      newerSource:
        latest && latest.version > p.source.solutionSnapshotVersion
          ? { id: latest.id, version: latest.version, approvedAt: latest.approval.approvedAt }
          : undefined,
      priceBook: book,
      readiness,
      readinessPercent: readinessPercent(readiness),
      deliverables: Object.fromEntries(
        ws.deliverables.map((d) => [d.id, classifyDeliverable(d, h)]),
      ),
      commercials: calculateCommercials(ws.lines, ws.taxes),
      versions,
      shares,
      draftHash: materialHash(p, p.source, ws),
      preview: h ? buildProposalDocument(p, ws, h, book) : undefined,
      permissions: permissionsFor(ctx, p),
      names: Object.fromEntries([...people].map((u) => [u, directory.displayName(ctx, u)])),
    };
  },

  async create(ctx, input) {
    await tick();
    if (!can(ctx.user, "proposal.create")) deny(ctx, "proposal.create");
    const d = parse(ctx, CreateInput, input);
    const h = handoffById(d.solutionSnapshotId);
    const sol = h && store.table("solutions").find((s) => s.id === h.solutionId);
    if (!h || !sol || !can(ctx.user, "solution.read", sol))
      return deny(ctx, "solution.read", d.solutionSnapshotId);
    const c = handoffCompatibility(h);
    if (!c.ok) return reject(ctx, c.reason);
    if (TRACKS[d.track].kind !== h.solution.kind)
      reject(
        ctx,
        `${TRACKS[d.track].label} needs a ${TRACKS[d.track].kind} solution; this solution is ${h.solution.kind}`,
      );
    const at = now();
    const p: StudioProposal = {
      id: newId("prp"),
      organizationId: ctx.user.organizationId,
      createdAt: at,
      createdBy: ctx.user.id,
      updatedAt: at,
      updatedBy: ctx.user.id,
      ownerId: ctx.user.id,
      teamId: ctx.user.teamId,
      assignedUserIds: [],
      assessmentId: h.solution.assessmentId,
      title: d.title,
      track: d.track,
      status: "draft",
      includesPricing: false,
      source: sourceOf(h),
      revision: 1,
    };
    if (!can(ctx.user, "proposal.create", p) || p.organizationId !== h.organizationId)
      deny(ctx, "proposal.create");
    const st = <T extends object>(prefix: string, data: T) => stamp(ctx, p, prefix, data);
    const ws: ProposalWorkspace = {
      ...st("pws", {}),
      id: `pws_${p.id}`,
      proposalId: p.id,
      recipient: {
        name: h.solution.subjectName,
        organization: h.solution.subjectName,
        contact: "",
      },
      validityDays: 30,
      commercialNotes: "",
      sections: draftSections(h, d.track, d.title, ctx.user.id, at),
      deliverables: h.recommendations
        .filter((r) => r.status !== "not_recommended")
        .map((r) =>
          st("dlv", {
            recommendationId: r.id,
            description: r.title,
            inclusion: r.status === "optional" ? ("optional" as const) : ("included" as const),
            acceptanceCriterion: r.expectedOutcome,
            responsibleParty:
              r.category === "third_party" ? ("third_party" as const) : ("aurumi" as const),
            customerDependencies: r.responsibilities.customer,
            deliveryAssumptions: r.assumptions,
            qualification: "",
            sourceStatus: "current" as const,
          }),
        ),
      lines: [],
      taxes: [],
      partnerTerms: [],
      risks: sourcedRisks(h).map((r) =>
        st("rsk", { ...r, resolution: "open" as const, qualification: "" }),
      ),
      milestones: h.roadmap.map((r) =>
        st("ms", {
          title: ROADMAP_LABEL[r.stage] ?? r.stage,
          roadmapId: r.id,
          deliverableIds: [],
          dependencies: r.dependencies,
          responsibleParty: "shared" as const,
          customerObligations: r.customerActions,
          indicativeDuration: r.indicativeDuration,
          acceptanceCriteria: r.acceptanceCriteria,
          paymentTrigger: "",
          commitment: "indicative" as const,
        }),
      ),
      options: [],
      comments: [],
      revisions: [],
    };
    store.replace("proposals", [...store.table("proposals"), p]);
    store.replace("proposalWorkspaces", [...store.table("proposalWorkspaces"), ws]);
    audit(ctx, {
      action: "proposal.create",
      resourceType: "proposal",
      resourceId: p.id,
      teamId: p.teamId,
      ownerId: p.ownerId,
      summary: `Created ${TRACKS[d.track].label} from solution snapshot ${h.id} v${h.version}`,
      outcome: "allowed",
    });
    return clone(p);
  },

  async saveMeta(ctx, id, input) {
    await tick();
    const p = parent(ctx, id, "proposal.update");
    editable(ctx, p);
    const d = parse(ctx, MetaInput, input, id);
    const ws = clone(workspaceOf(p));
    if (d.recipient) ws.recipient = d.recipient;
    if (d.validityDays !== undefined) ws.validityDays = d.validityDays;
    if (d.commercialNotes !== undefined) ws.commercialNotes = d.commercialNotes;
    persist(
      ctx,
      p,
      ws,
      "Saved proposal details",
      "proposal.update",
      d.title ? { title: d.title } : {},
    );
  },

  async saveSection(ctx, id, key, input) {
    await tick();
    const p = parent(ctx, id, "proposal.update");
    editable(ctx, p);
    const d = parse(ctx, SectionInput, input, id);
    const ws = clone(workspaceOf(p));
    const sec = ws.sections.find((s) => s.key === key);
    if (!sec) return reject(ctx, `section "${key}" is not part of this track`, id);
    const changed = sec.body !== d.body;
    if (sec.origin === "ai_draft") sec.reviewed = d.reviewed ?? (changed ? false : sec.reviewed);
    else if (changed) sec.origin = "authored";
    sec.body = d.body;
    sec.updatedAt = now();
    sec.updatedBy = ctx.user.id;
    persist(ctx, p, ws, `Saved section ${sec.title}`);
  },

  async draftSection(ctx, id, key) {
    await tick();
    const p = parent(ctx, id, "proposal.update");
    editable(ctx, p);
    const h = handoffOf(p);
    if (!h) return reject(ctx, "source solution snapshot is missing", id);
    const ws = clone(workspaceOf(p));
    const sec = ws.sections.find((s) => s.key === key);
    if (!sec) return reject(ctx, `section "${key}" is not part of this track`, id);
    Object.assign(sec, {
      body: simulatedDraft(h, key),
      origin: "ai_draft",
      reviewed: false,
      updatedAt: now(),
      updatedBy: ctx.user.id,
    });
    persist(ctx, p, ws, `Simulated AI draft for ${sec.title} (needs review)`, "proposal.ai_draft");
  },

  async upsertChild(ctx, id, kind, input) {
    await tick();
    // Read the price book first so every check below runs on current records.
    const book = kind === "lines" ? await priceBookNow() : null;
    const p = parent(ctx, id, "proposal.update");
    editable(ctx, p);
    const schema = CHILD[kind];
    if (!schema) reject(ctx, `unknown section "${String(kind)}"`, id);
    const d = parse(ctx, schema, input, id) as Record<string, unknown> & { id?: string };
    const ws = clone(workspaceOf(p));
    const h = handoffOf(p);
    if (!h) return reject(ctx, "source solution snapshot is missing", id);
    const list = ws[kind] as unknown as ({ id: ID; createdAt: string; createdBy: ID } & Record<
      string,
      unknown
    >)[];
    const existing = d.id ? list.find((x) => x.id === d.id) : undefined;
    if (d.id && !existing) reject(ctx, `unknown ${kind} record`, id);
    const { id: _ignored, ...data } = d;
    let record: Record<string, unknown> = data;
    let action = "proposal.update";
    const rule = TRACKS[p.track];

    if (kind === "deliverables") {
      const r = h.recommendations.find((x) => x.id === data["recommendationId"]);
      if (!r) reject(ctx, "that recommendation is not in the approved solution snapshot", id);
      if (r!.status === "not_recommended" && data["inclusion"] !== "excluded")
        reject(
          ctx,
          "a recommendation the approved solution does not recommend can only be listed as excluded",
          id,
        );
      record = {
        ...data,
        description: (data["description"] as string) || r!.title,
        sourceStatus: "current",
      };
    }
    if (kind === "lines" && book) {
      const cat = data["category"] as CommercialLine["category"];
      const itemId = data["priceBookItemId"] as string | undefined;
      const prev = existing as unknown as CommercialLine | undefined;
      const { priceBookItemId: _p, priceException: _x, catalogItemId: lineItem, ...rest } = data;
      if (lineItem != null && !h.catalog.items.some((c) => c.id === lineItem))
        reject(ctx, `"${String(lineItem)}" is not a capability in the approved solution`, id);
      let priceRef = undefined as CommercialLine["priceRef"];
      if (itemId) {
        if (!PRICE_BOOK_CATEGORIES.includes(cat))
          reject(ctx, `${cat} lines are not priced from the price book`, id);
        // Keep the original pin (and its version) until prices are explicitly refreshed.
        if (prev?.priceRef?.priceBookItemId === itemId) priceRef = prev.priceRef;
        else {
          const item = book.items.find((i) => i.id === itemId);
          if (!item) return reject(ctx, `unknown price-book item "${itemId}"`, id);
          if (item.category !== cat)
            reject(ctx, `price-book item "${itemId}" is ${item.category}, not ${cat}`, id);
          priceRef = priceRefOf(item, book);
        }
        if (
          (data["recurrence"] && data["recurrence"] !== priceRef!.recurrence) ||
          (data["currency"] && data["currency"] !== priceRef!.currency)
        )
          reject(
            ctx,
            "currency and billing period come from the price book and cannot be changed",
            id,
          );
      } else if (
        cat !== "discount" &&
        PRICE_BOOK_CATEGORIES.includes(cat) &&
        data["classification"] === "priced"
      )
        reject(ctx, "priced Aurumi items must reference a Pricing Studio price-book item", id);
      // Capability identity: omitted keeps the stored binding (never re-derived from a new
      // price), an explicit value replaces it, null removes it. Only a brand-new line with
      // no stated capability takes the capability of a capability-specific price.
      let catalogItemId: string | undefined;
      if (lineItem === null) {
        // Removing an existing binding would turn a product line into a "general" one and
        // escape the applicability check; Phase 4 has no authorized removal workflow.
        if (prev?.catalogItemId)
          reject(
            ctx,
            `this line is bound to ${prev.catalogItemId}; its capability cannot be removed — replace it with another capability, or add a separate general subscription line`,
            id,
          );
        if (priceRef?.catalogItemId)
          reject(
            ctx,
            `price ${priceRef.priceBookItemId} is specific to ${priceRef.catalogItemId}; a line without a capability needs a general price`,
            id,
          );
        catalogItemId = undefined;
      } else if (lineItem !== undefined) catalogItemId = lineItem as string;
      else if (prev) catalogItemId = prev.catalogItemId;
      else catalogItemId = priceRef?.catalogItemId;
      const px = data["priceException"] as
        { rationale: string; permits: ("applicability" | "expired")[] } | undefined;
      if (px && !priceRef) reject(ctx, "a price exception applies to a published price", id);
      if (priceRef) {
        const need = requiredPermits(
          { ...(catalogItemId ? { catalogItemId } : {}), priceRef },
          proposalClock.now(),
        );
        const missing = need.filter((n) => !px?.permits.includes(n));
        if (missing.length)
          reject(
            ctx,
            missing.includes("applicability")
              ? `price ${priceRef.priceBookItemId} applies to ${priceRef.catalogItemId ?? "general subscriptions"}, not ${catalogItemId}; choose the applicable price or propose a price exception with a rationale`
              : `published price ${priceRef.priceBookItemId} expired on ${priceRef.validUntil}; refresh prices or propose a price exception with a rationale`,
            id,
          );
      }
      const samePx =
        !!px &&
        !!prev?.priceException &&
        prev.priceException.rationale === px.rationale &&
        canonical([...prev.priceException.permits].sort()) === canonical([...px.permits].sort()) &&
        canonical(prev.priceRef) === canonical(priceRef) &&
        prev.catalogItemId === catalogItemId;
      const recurrence = priceRef?.recurrence ?? (data["recurrence"] as string | undefined);
      const currency = priceRef?.currency ?? (data["currency"] as string | undefined);
      if (!recurrence || !currency) reject(ctx, "state the currency and billing period", id);
      if (cat === "discount") {
        if (!data["discount"]) reject(ctx, "discount lines need an amount and rationale", id);
        if (priceRef || data["override"] || data["quoted"] || data["estimate"])
          reject(ctx, "discount lines carry only a discount", id);
      } else if (data["discount"]) reject(ctx, "use a separate discount line", id);
      if (data["override"] && !priceRef)
        reject(ctx, "an override applies to a published price; reference a price-book item", id);
      if (data["quoted"] && !["third_party", "custom_development"].includes(cat))
        reject(ctx, "quoted amounts apply to third-party or custom items", id);
      const keepAuth = <T extends { authorization?: unknown }>(
        next: unknown,
        before: T | undefined,
        same: boolean,
      ) =>
        next
          ? {
              ...(next as object),
              ...(same && before?.authorization ? { authorization: before.authorization } : {}),
            }
          : undefined;
      const ov = data["override"] as { unitAmount: number; rationale: string } | undefined;
      const sameOv =
        !!ov &&
        !!prev?.override &&
        prev.override.unitAmount === ov.unitAmount &&
        prev.override.rationale === ov.rationale &&
        prev.priceRef?.publishedAmount === priceRef?.publishedAmount;
      const dc = data["discount"] as { amount: number; rationale: string } | undefined;
      const sameDc =
        !!dc &&
        !!prev?.discount &&
        prev.discount.amount === dc.amount &&
        prev.discount.rationale === dc.rationale &&
        prev.currency === currency &&
        prev.recurrence === recurrence;
      record = {
        ...rest,
        recurrence,
        currency,
        ...(catalogItemId ? { catalogItemId } : {}),
        ...(priceRef ? { priceRef } : {}),
      };
      if (px)
        record["priceException"] = {
          rationale: px.rationale,
          permits: [...new Set(px.permits)],
          ...(samePx && prev?.priceException?.authorization
            ? { authorization: prev.priceException.authorization }
            : {}),
        };
      delete record["override"];
      delete record["discount"];
      const o = keepAuth(ov, prev?.override, sameOv);
      const dd = keepAuth(dc, prev?.discount, sameDc);
      if (o) record["override"] = o;
      if (dd) record["discount"] = dd;
      if ((ov && !sameOv) || (dc && !sameDc)) action = "proposal.override";
      if (prev && (prev.catalogItemId ?? null) !== (catalogItemId ?? null))
        action = "proposal.capability";
      if (px && !samePx) action = "proposal.price_exception";
    }
    if (kind === "taxes") action = "proposal.tax";
    if (kind === "partnerTerms") {
      if (!rule.partnerTerms) reject(ctx, "partner terms apply only to partner proposals", id);
      const prev = existing as unknown as
        | { description?: string; kind?: string; status?: string; authorization?: unknown }
        | undefined;
      const same = prev && prev.description === data["description"] && prev.kind === data["kind"];
      record = {
        ...data,
        status: same && prev?.status === "approved" ? "approved" : "proposed",
        ...(same && prev?.authorization ? { authorization: prev.authorization } : {}),
      };
      action = "proposal.partner_term";
    }
    if (kind === "risks") {
      const prev = existing as unknown as
        | {
            source?: { kind: string };
            category?: string;
            description?: string;
            severity?: "high" | "medium" | "low";
          }
        | undefined;
      if (prev?.source) {
        if (data["description"] !== prev.description || data["category"] !== prev.category)
          reject(
            ctx,
            "risks imported from the approved solution keep their description and category",
            id,
          );
        if (SEVERITY_RANK[data["severity"] as "high"] < SEVERITY_RANK[prev.severity!])
          reject(ctx, "a risk imported from the approved solution cannot be downgraded", id);
        record = { ...data, source: prev.source };
      }
    }
    if (kind === "milestones") {
      if (data["roadmapId"] && !h.roadmap.some((r) => r.id === data["roadmapId"]))
        reject(ctx, "that roadmap phase is not in the approved solution", id);
      if (!(data["deliverableIds"] as ID[]).every((x) => ws.deliverables.some((dl) => dl.id === x)))
        reject(ctx, "unknown deliverable reference", id);
      if ((data["paymentTrigger"] as string).trim() && rule.pricing !== "required")
        reject(ctx, "payment triggers belong only on commercial proposals", id);
      record = { ...data, commitment: "indicative" };
    }
    if (kind === "options") {
      const dl = data["deliverableIds"] as ID[];
      for (const x of dl) {
        const found = ws.deliverables.find((y) => y.id === x);
        if (
          !found ||
          found.inclusion === "excluded" ||
          classifyDeliverable(found, h).availability === "missing"
        )
          reject(
            ctx,
            "options may only use current, non-excluded deliverables from the approved solution",
            id,
          );
      }
      if (!(data["lineIds"] as ID[]).every((x) => ws.lines.some((l) => l.id === x)))
        reject(ctx, "unknown commercial line", id);
      if (
        data["kind"] === "recommended" &&
        ws.options.some((o) => o.kind === "recommended" && o.id !== existing?.id)
      )
        reject(ctx, "another option is already recommended", id);
    }

    const stamped = stamp(ctx, p, PREFIX[kind], record, existing);
    (ws as unknown as Record<string, unknown>)[kind] = existing
      ? (list as { id: ID }[]).map((x) => (x.id === existing.id ? stamped : x))
      : [...list, stamped];
    persist(ctx, p, ws, `${existing ? "Updated" : "Added"} ${kind} record`, action);
    return stamped.id;
  },

  async removeChild(ctx, id, kind, childId) {
    await tick();
    const p = parent(ctx, id, "proposal.update");
    editable(ctx, p);
    if (!(kind in CHILD)) reject(ctx, `unknown section "${String(kind)}"`, id);
    const ws = clone(workspaceOf(p));
    const list = ws[kind] as unknown as { id: ID; source?: unknown }[];
    const item = list.find((x) => x.id === childId);
    if (!item) return reject(ctx, `unknown ${kind} record`, id);
    if (kind === "risks" && item.source)
      reject(
        ctx,
        "risks imported from the approved solution can be resolved or accepted, not deleted",
        id,
      );
    (ws as unknown as Record<string, unknown>)[kind] = list.filter((x) => x.id !== childId);
    ws.milestones.forEach(
      (m) => (m.deliverableIds = m.deliverableIds.filter((x) => x !== childId)),
    );
    ws.options.forEach((o) => {
      o.deliverableIds = o.deliverableIds.filter((x) => x !== childId);
      o.lineIds = o.lineIds.filter((x) => x !== childId);
    });
    persist(ctx, p, ws, `Removed ${kind} record`);
  },

  async refreshPrices(ctx, id) {
    await tick();
    const book = await priceBookNow();
    const p = parent(ctx, id, "proposal.update");
    editable(ctx, p);
    const ws = clone(workspaceOf(p));
    const changes: string[] = [];
    ws.lines.forEach((l) => {
      if (!l.priceRef) return;
      const item = book.items.find((i) => i.id === l.priceRef!.priceBookItemId);
      if (!item) return void changes.push(`${l.priceRef.name}: no longer published`);
      const next = priceRefOf(item, book);
      if (next.publishedAmount !== l.priceRef.publishedAmount && l.override)
        delete l.override.authorization;
      // A refreshed reference is a material change: a prior exception must be re-authorized.
      if (
        canonical(next) !== canonical({ ...l.priceRef, retrievedAt: next.retrievedAt }) &&
        l.priceException
      )
        delete l.priceException.authorization;
      if (next.publishedAmount !== l.priceRef.publishedAmount)
        changes.push(`${item.name}: ${l.priceRef.publishedAmount} → ${next.publishedAmount}`);
      l.priceRef = next;
      l.currency = next.currency;
      l.recurrence = next.recurrence;
    });
    persist(
      ctx,
      p,
      ws,
      `Refreshed prices to ${book.priceBookVersion}${changes.length ? ` (${changes.join("; ")})` : ""}`,
      "proposal.pricing_refresh",
    );
  },

  async authorizeCommercial(ctx, id, input) {
    await tick();
    const p = approver(ctx, id);
    if (p.status !== "draft" && p.status !== "changes_requested")
      reject(ctx, "commercial items are authorized on a working draft, before submission", id);
    const ws = clone(workspaceOf(p));
    const auth = { approvedBy: ctx.user.id, approvedAt: now() };
    if (input.kind === "term") {
      const t = ws.partnerTerms.find((x) => x.id === input.itemId);
      if (!t) return reject(ctx, "unknown partner term", id);
      Object.assign(t, { status: "approved", authorization: auth });
    } else {
      const l = ws.lines.find((x) => x.id === input.itemId);
      const target =
        input.kind === "override"
          ? l?.override
          : input.kind === "exception"
            ? l?.priceException
            : l?.discount;
      if (!l || !target) return reject(ctx, `no ${input.kind} on that line`, id);
      target.authorization = auth;
    }
    persist(
      ctx,
      p,
      ws,
      `Authorized ${input.kind} ${input.itemId}`,
      `proposal.${input.kind}.approve`,
    );
  },

  async addComment(ctx, id, body) {
    await tick();
    const p = parent(ctx, id, "proposal.read");
    if (!can(ctx.user, "proposal.update", p) && !can(ctx.user, "proposal.approve", p))
      deny(ctx, "proposal.update", id);
    if (!body.trim()) reject(ctx, "comment is empty", id);
    const ws = clone(workspaceOf(p));
    ws.comments.push(stamp(ctx, p, "pc", { kind: "comment" as const, body: body.trim() }));
    // Comments are not material: store directly so an approval is not invalidated.
    store.replace("proposalWorkspaces", [
      ...store.table("proposalWorkspaces").filter((w) => w.proposalId !== p.id),
      ws,
    ]);
    audit(ctx, {
      action: "proposal.comment",
      resourceType: "proposal",
      resourceId: p.id,
      teamId: p.teamId,
      ownerId: p.ownerId,
      summary: "Comment added",
      outcome: "allowed",
    });
  },

  async submitForReview(ctx, id, note = "") {
    await tick();
    const p = parent(ctx, id, "proposal.update");
    if (p.status !== "draft" && p.status !== "changes_requested")
      reject(ctx, `only drafts can be submitted (is ${p.status})`, id);
    const before = fingerprint(id);
    const book = await priceBookNow();
    // Re-read and re-authorize after the adapter call; the commit below is synchronous.
    unchanged(ctx, id, before, "pricing was being checked");
    parent(ctx, id, "proposal.update");
    const ws = clone(workspaceOf(p));
    const h = handoffOf(p);
    const failing = readinessFailures(p, ws, h, book);
    if (failing.length)
      reject(ctx, `not ready: ${failing.map((f) => `${f.label} (${f.detail[0]})`).join(", ")}`, id);
    const at = now();
    const versionNumber = (versionsOf(p.id)[0]?.versionNumber ?? 0) + 1;
    const v: ProposalVersionRecord = {
      schema: PROPOSAL_VERSION_SCHEMA,
      id: newId("pv"),
      organizationId: p.organizationId,
      proposalId: p.id,
      versionNumber,
      revision: p.revision,
      createdAt: at,
      createdBy: ctx.user.id,
      contentHash: materialHash(p, p.source, ws, h),
      hashContract: HASH_CONTRACT,
      document: deepFreeze(buildProposalDocument(p, ws, h!, book)),
    };
    store.replace("proposalVersions", [...store.table("proposalVersions"), v]);
    ws.comments.push(
      stamp(ctx, p, "pc", {
        kind: "submitted" as const,
        body: note.trim() || `Submitted v${versionNumber} for review.`,
      }),
    );
    store.replace("proposalWorkspaces", [
      ...store.table("proposalWorkspaces").filter((w) => w.proposalId !== p.id),
      ws,
    ]);
    persistMeta(
      ctx,
      p,
      { status: "in_review", currentVersionId: v.id },
      "proposal.status.in_review",
      `Submitted version ${versionNumber} for review`,
    );
    return deepFreeze(clone(v));
  },

  async approve(ctx, id, versionId, input = {}) {
    await tick();
    const p = approver(ctx, id);
    if (p.status !== "in_review")
      reject(ctx, `only proposals in review can be approved (is ${p.status})`, id);
    const v = currentVersion(p);
    if (!v || v.id !== versionId)
      return reject(
        ctx,
        "approve the current submitted version; this version is not the one under review",
        id,
      );
    if (v.review) reject(ctx, "this version already has a review decision", id);
    if (isLegacyVersion(v)) reject(ctx, LEGACY_REMEDY, id);
    const before = fingerprint(id);
    const book = await priceBookNow();
    unchanged(ctx, id, before, "pricing was being checked");
    approver(ctx, id);
    const ws = workspaceOf(p);
    if (materialHash(p, p.source, ws, handoffOf(p)) !== v.contentHash)
      reject(ctx, "the draft changed since this version was submitted", id);
    const failing = readinessFailures(p, ws, handoffOf(p), book);
    if (failing.length)
      reject(ctx, `not ready: ${failing.map((f) => `${f.label} (${f.detail[0]})`).join(", ")}`, id);
    const defects = versionDefects(v, book, proposalClock.now());
    if (defects.length) reject(ctx, `this version cannot be approved: ${defects.join("; ")}`, id);
    const need = qualificationIds(v.document);
    const ack = new Set(input.acknowledged ?? []);
    const missing = need.filter((x) => !ack.has(x));
    if (missing.length)
      reject(
        ctx,
        `acknowledge each qualification before approving (${missing.length} outstanding)`,
        id,
      );
    const at = now();
    patchVersion(v.id, {
      review: {
        decision: "approved",
        by: ctx.user.id,
        at,
        comment: input.comment?.trim() ?? "",
        acknowledged: need,
      },
    });
    const w = clone(ws);
    w.comments.push(
      stamp(ctx, p, "pc", {
        kind: "approved" as const,
        body: input.comment?.trim() || `Approved v${v.versionNumber}.`,
      }),
    );
    store.replace("proposalWorkspaces", [
      ...store.table("proposalWorkspaces").filter((x) => x.proposalId !== p.id),
      w,
    ]);
    persistMeta(
      ctx,
      p,
      { status: "approved" },
      "proposal.approve",
      `Approved version ${v.versionNumber} (${v.contentHash})`,
    );
  },

  async requestChanges(ctx, id, versionId, comment) {
    await tick();
    const p = approver(ctx, id);
    if (p.status !== "in_review") reject(ctx, "only proposals in review can be returned", id);
    const v = currentVersion(p);
    if (!v || v.id !== versionId || v.review)
      return reject(ctx, "that version is not awaiting review", id);
    if (!comment.trim()) reject(ctx, "say what needs changing", id);
    patchVersion(v.id, {
      review: {
        decision: "changes_requested",
        by: ctx.user.id,
        at: now(),
        comment: comment.trim(),
        acknowledged: [],
      },
    });
    const w = clone(workspaceOf(p));
    w.comments.push(
      stamp(ctx, p, "pc", { kind: "changes_requested" as const, body: comment.trim() }),
    );
    store.replace("proposalWorkspaces", [
      ...store.table("proposalWorkspaces").filter((x) => x.proposalId !== p.id),
      w,
    ]);
    persistMeta(
      ctx,
      p,
      { status: "changes_requested" },
      "proposal.status.changes_requested",
      `Changes requested on version ${v.versionNumber}`,
    );
  },

  async issue(ctx, id, versionId) {
    await tick();
    /** Authorization, lifecycle, exact approved version, approval validity, hash and integrity. */
    const check = () => {
      const p = parent(ctx, id, "proposal.share");
      if (p.status !== "approved")
        reject(ctx, `only approved proposals can be issued (is ${p.status})`, id);
      const v = currentVersion(p);
      if (!v || v.id !== versionId) return reject(ctx, "issue the current approved version", id);
      if (v.review?.decision !== "approved" || v.supersededAt || v.issue)
        reject(ctx, "this exact version is not approved", id);
      if (isLegacyVersion(v)) reject(ctx, LEGACY_REMEDY, id);
      if (materialHash(p, p.source, workspaceOf(p), handoffOf(p)) !== v.contentHash)
        reject(ctx, "the draft changed after approval; resubmit for review", id);
      if (!handoffOf(p)) reject(ctx, "source solution snapshot is missing", id);
      return { p, v };
    };
    check();
    const before = fingerprint(id);
    const book = await priceBookNow();
    // Authoritative re-read after the adapter call; validation and commit are synchronous.
    unchanged(ctx, id, before, "pricing was being checked");
    const { p, v } = check();
    const defects = versionDefects(v, book, proposalClock.now());
    if (defects.length)
      reject(ctx, `cannot issue this version — revise and resubmit (${defects.join("; ")})`, id);
    const at = new Date(proposalClock.now());
    const exp = new Date(at.getTime() + v.document.validityDays * 86400000).toISOString();
    patchVersion(v.id, {
      issue: {
        issuedAt: at.toISOString(),
        issuedBy: ctx.user.id,
        effectiveAt: at.toISOString(),
        expiresAt: exp,
      },
    });
    const w = clone(workspaceOf(p));
    w.comments.push(
      stamp(ctx, p, "pc", {
        kind: "issued" as const,
        body: `Issued v${v.versionNumber}; valid until ${exp.slice(0, 10)}.`,
      }),
    );
    store.replace("proposalWorkspaces", [
      ...store.table("proposalWorkspaces").filter((x) => x.proposalId !== p.id),
      w,
    ]);
    persistMeta(
      ctx,
      p,
      { status: "shared" },
      "proposal.issue",
      `Issued version ${v.versionNumber}`,
    );
    return deepFreeze(clone(store.table("proposalVersions").find((x) => x.id === v.id)!));
  },

  async share(ctx, id, input) {
    await tick();
    const p = parent(ctx, id, "proposal.share");
    const v = store
      .table("proposalVersions")
      .find((x) => x.id === input.versionId && x.proposalId === p.id);
    if (!v || !v.issue) return reject(ctx, "only an issued version can be shared", id);
    if (p.status !== "shared")
      reject(ctx, `proposal is ${p.status}; only issued proposals can be shared`, id);
    const email = input.recipient.email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) reject(ctx, "enter a valid recipient email", id);
    if (!input.recipient.name.trim()) reject(ctx, "name the recipient", id);
    const expiresAt = input.expiresAt ?? v.issue.expiresAt;
    const exp = validityEnd(expiresAt);
    if (
      typeof expiresAt !== "string" ||
      exp === null ||
      !/^\d{4}-\d{2}-\d{2}T/.test(expiresAt)
    )
      reject(ctx, "enter a valid expiry date and time", id);
    if (exp > Date.parse(v.issue.expiresAt))
      reject(ctx, "a share cannot outlive the issued version's validity", id);
    if (exp <= Date.parse(proposalClock.now()))
      reject(ctx, "this version has expired; revise to issue a new version", id);
    const before = fingerprint(id);
    const r = await proposalShareAdapter.share({ versionId: v.id, recipientEmail: email });
    if (!r.ok) return reject(ctx, `sharing unavailable: ${r.error}`, id);
    unchanged(ctx, id, before, "the share was being prepared");
    parent(ctx, id, "proposal.share");
    const rec: ProposalShareRecord = {
      id: newId("psh"),
      organizationId: p.organizationId,
      proposalId: p.id,
      versionId: v.id,
      versionNumber: v.versionNumber,
      recipient: {
        name: input.recipient.name.trim(),
        email,
        organization: input.recipient.organization?.trim() ?? "",
      },
      sharedAt: now(),
      sharedBy: ctx.user.id,
      expiresAt: new Date(exp).toISOString(),
      access: "active",
      response: "pending",
      responseNote: "",
      channelReference: r.data.reference,
      simulated: true,
    };
    store.replace("proposalShares", [...store.table("proposalShares"), rec]);
    audit(ctx, {
      action: "proposal.share",
      resourceType: "proposal",
      resourceId: p.id,
      teamId: p.teamId,
      ownerId: p.ownerId,
      summary: `Simulated share of v${v.versionNumber} with ${rec.recipient.name}`,
      outcome: "allowed",
    });
    return clone(rec);
  },

  async recordResponse(ctx, shareId, input) {
    await tick();
    const s = store.table("proposalShares").find((x) => x.id === shareId);
    if (!s) return deny(ctx, "proposal.share", shareId);
    const p = parent(ctx, s.proposalId, "proposal.share");
    if (s.access !== "active") reject(ctx, "this share was revoked", p.id);
    const ver = store.table("proposalVersions").find((x) => x.id === s.versionId);
    const at = proposalClock.now();
    const cur = effectiveResponse(s, at, ver?.issue?.expiresAt ?? "invalid");
    if (["accepted", "declined", "expired"].includes(cur))
      reject(ctx, `response already final (${cur})`, p.id);
    // Independent of status: nothing is answerable at or after the effective expiry.
    if (shareExpiry(s, ver?.issue?.expiresAt ?? "invalid") <= Date.parse(at))
      reject(ctx, "this share has expired", p.id);
    const decisive = ["accepted", "declined", "expired"].includes(input.response);
    if (decisive && p.status !== "shared")
      reject(ctx, `proposal is ${p.status}; responses apply to the issued version`, p.id);
    if (input.response === "accepted" && p.currentVersionId !== s.versionId)
      reject(ctx, "acceptance must be for the current issued version", p.id);
    store.replace(
      "proposalShares",
      store.table("proposalShares").map((x) =>
        x.id === s.id
          ? {
              ...x,
              response: input.response,
              respondedAt: at,
              responseNote: input.note?.trim() ?? "",
              recordedBy: ctx.user.id,
            }
          : x,
      ),
    );
    if (decisive)
      persistMeta(
        ctx,
        p,
        { status: input.response as ProposalStatus },
        `proposal.response.${input.response}`,
        `Recorded simulated response "${input.response}" from ${s.recipient.name} (not a signed contract)`,
      );
    else
      audit(ctx, {
        action: `proposal.response.${input.response}`,
        resourceType: "proposal",
        resourceId: p.id,
        teamId: p.teamId,
        ownerId: p.ownerId,
        summary: `Recorded simulated response "${input.response}"`,
        outcome: "allowed",
      });
  },

  async revokeShare(ctx, shareId) {
    await tick();
    const s = store.table("proposalShares").find((x) => x.id === shareId);
    if (!s) return deny(ctx, "proposal.share", shareId);
    const p = parent(ctx, s.proposalId, "proposal.share");
    store.replace(
      "proposalShares",
      store
        .table("proposalShares")
        .map((x) => (x.id === s.id ? { ...x, access: "revoked" as const } : x)),
    );
    audit(ctx, {
      action: "proposal.share.revoke",
      resourceType: "proposal",
      resourceId: p.id,
      teamId: p.teamId,
      ownerId: p.ownerId,
      summary: `Revoked simulated share with ${s.recipient.name}`,
      outcome: "allowed",
    });
  },

  async revise(ctx, id, reason) {
    await tick();
    const p = parent(ctx, id, "proposal.update");
    if (!["approved", "shared", "declined", "expired", "changes_requested"].includes(p.status))
      reject(ctx, `a ${p.status} proposal cannot be revised`, id);
    if (!reason.trim()) reject(ctx, "give a reason for revising", id);
    const v = currentVersion(p);
    if (v && !v.issue && !v.supersededAt) patchVersion(v.id, { supersededAt: now() });
    const w = clone(workspaceOf(p));
    w.comments.push(stamp(ctx, p, "pc", { kind: "revised" as const, body: reason.trim() }));
    store.replace("proposalWorkspaces", [
      ...store.table("proposalWorkspaces").filter((x) => x.proposalId !== p.id),
      w,
    ]);
    persistMeta(
      ctx,
      p,
      { status: "draft" },
      "proposal.status.draft",
      `Revision started: ${reason.trim()}`,
    );
  },

  async previewRebase(ctx, id, targetSnapshotId) {
    await tick();
    const p = parent(ctx, id, "proposal.read");
    const from = handoffOf(p);
    const to = targetSnapshotId
      ? handoffById(targetSnapshotId)
      : latestHandoff(p.source.solutionId);
    if (!from || !to || to.solutionId !== p.source.solutionId)
      return reject(ctx, "no solution snapshot to compare with", id);
    return diffHandoffs(from, to, workspaceOf(p));
  },

  async rebase(ctx, id, targetSnapshotId, reason) {
    await tick();
    const p = parent(ctx, id, "proposal.update");
    editable(ctx, p);
    if (!reason.trim()) reject(ctx, "give a reason for rebasing", id);
    const from = handoffOf(p);
    const to = handoffById(targetSnapshotId);
    if (!from || !to || to.solutionId !== p.source.solutionId)
      return reject(ctx, "choose an approved snapshot of the same solution", id);
    const c = handoffCompatibility(to);
    if (!c.ok) return reject(ctx, c.reason, id);
    if (to.id === from.id) reject(ctx, "the proposal is already on that snapshot", id);
    const ws = clone(workspaceOf(p));
    const { revisions, comments, ...current } = ws;
    ws.revisions = [
      ...revisions,
      {
        revision: p.revision,
        source: p.source,
        archivedAt: now(),
        archivedBy: ctx.user.id,
        reason: reason.trim(),
        workspace: clone(current),
      },
    ];
    ws.comments = comments;
    ws.deliverables.forEach((d) => {
      d.sourceStatus = to.recommendations.some((r) => r.id === d.recommendationId)
        ? "current"
        : "missing";
    });
    for (const r of sourcedRisks(to))
      if (!ws.risks.some((x) => x.source?.kind === r.source?.kind && x.source?.id === r.source?.id))
        ws.risks.push(
          stamp(ctx, p, "rsk", { ...r, resolution: "open" as const, qualification: "" }),
        );
    ws.comments.push(
      stamp(ctx, p, "pc", {
        kind: "rebased" as const,
        body: `Rebased from solution v${from.version} to v${to.version}: ${reason.trim()}`,
      }),
    );
    persist(
      ctx,
      p,
      ws,
      `Rebased solution source v${from.version} → v${to.version}`,
      "proposal.rebase",
      { source: sourceOf(to), revision: p.revision + 1 },
    );
  },
};

function diffHandoffs(
  from: SolutionHandoffSnapshot,
  to: SolutionHandoffSnapshot,
  ws: ProposalWorkspace,
): ProposalRebaseDiff {
  const added = to.recommendations
    .filter((r) => !from.recommendations.some((x) => x.id === r.id))
    .map((r) => ({ id: r.id, title: r.title }));
  const removed = from.recommendations
    .filter((r) => !to.recommendations.some((x) => x.id === r.id))
    .map((r) => ({ id: r.id, title: r.title }));
  const changed = from.recommendations.flatMap((r) => {
    const n = to.recommendations.find((x) => x.id === r.id);
    if (!n) return [];
    const ch: string[] = [];
    if (n.title !== r.title) ch.push(`title “${r.title}” → “${n.title}”`);
    if (n.availability !== r.availability)
      ch.push(`availability ${r.availability} → ${n.availability}`);
    if (n.provenance !== r.provenance) ch.push(`basis ${r.provenance} → ${n.provenance}`);
    if (n.status !== r.status) ch.push(`status ${r.status} → ${n.status}`);
    return ch.length ? [{ id: r.id, title: n.title, changes: ch }] : [];
  });
  const integrationChanges = to.integrations.flatMap((i) => {
    const o = from.integrations.find((x) => x.id === i.id);
    return !o
      ? [`${i.systemName}: added (${i.feasibility})`]
      : o.feasibility !== i.feasibility
        ? [`${i.systemName}: ${o.feasibility} → ${i.feasibility}`]
        : [];
  });
  const newRisks = sourcedRisks(to)
    .filter(
      (r) =>
        !ws.risks.some((x) => x.source?.kind === r.source?.kind && x.source?.id === r.source?.id),
    )
    .map((r) => r.description);
  const touched = new Set([...removed, ...changed].map((x) => x.id));
  return {
    from: { id: from.id, version: from.version },
    to: { id: to.id, version: to.version },
    added,
    removed,
    changed,
    integrationChanges,
    newRisks,
    affectedDeliverables: ws.deliverables
      .filter((d) => touched.has(d.recommendationId))
      .map((d) => d.id),
  };
}

export { AccessDeniedError, ValidationError, versionState };
export type { ProposalSource };

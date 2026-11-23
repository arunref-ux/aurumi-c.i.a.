/**
 * Repository layer with authorization enforced on every call (§12).
 * UI hiding is a convenience; these checks are the real boundary.
 *
 * Writes accept explicit input types and are checked against runtime field
 * allowlists. Identity and creation metadata are never writable; update audit
 * metadata is set here. Every value crossing this boundary is deep-copied.
 */
import {
  AccessDeniedError,
  can,
  effectiveScope,
  type Permission,
  type Scope,
} from "@/domain/permissions";
import type {
  Assessment,
  AssessmentCreateInput,
  AssessmentUpdateInput,
  AuditEvent,
  CIAAffiliation,
  CIAProfessional,
  Engagement,
  EngagementCreateInput,
  EngagementUpdateInput,
  ID,
  Proposal,
  ProposalCreateInput,
  ProposalStatus,
  ProposalUpdateInput,
  ResourceType,
  ScopedRecord,
  Team,
  User,
} from "@/domain/types";
import { newId, store } from "./store";

export interface Ctx {
  user: User;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const clone = <T>(v: T): T => structuredClone(v);
const ASSIGN_FIELDS = ["ownerId", "teamId", "assignedUserIds"] as const;
type AnyRow = ScopedRecord & Record<string, unknown>;
type ScopedTableKey = "assessments" | "proposals" | "engagements";

function audit(ctx: Ctx, e: Omit<AuditEvent, "id" | "at" | "organizationId" | "actorId">) {
  store.log({ ...e, actorId: ctx.user.id, organizationId: ctx.user.organizationId });
}

function denyWith(ctx: Ctx, resource: ResourceType | "system", p: Permission, id?: ID): never {
  // Denials carry the actor's own team, never the target's, so they reveal nothing about the target.
  audit(ctx, {
    action: p,
    resourceType: resource,
    ...(id ? { resourceId: id } : {}),
    teamId: ctx.user.teamId,
    ownerId: ctx.user.id,
    summary: `Denied ${p}`,
    outcome: "denied",
  });
  throw new AccessDeniedError(p, id);
}

function cappedScope(user: User, p: Permission): Scope | null {
  const s = effectiveScope(user, p);
  if (!s) return null;
  return user.affiliation === "partner" ? "self" : s;
}

interface Spec {
  table: ScopedTableKey;
  resource: ResourceType;
  createFields: readonly string[];
  updateFields: readonly string[];
  parent?: { field: string; table: "assessments" | "proposals"; resource: ResourceType };
  checkStatus?: (
    ctx: Ctx,
    deny: (p: Permission) => never,
    next: string | undefined,
    current?: string,
  ) => void;
  /** Applied before validation when the caller omits the field. */
  defaults?: Record<string, unknown>;
  /** Required non-empty strings, enum fields and boolean fields, checked on every full row before persistence. */
  required: readonly string[];
  enums: Record<string, readonly string[]>;
  booleans?: readonly string[];
  optionalStrings?: readonly string[];
}

function createScopedRepository<R extends ScopedRecord, CIn, UIn>(spec: Spec) {
  const { table, resource } = spec;
  const perm = (a: string) => `${resource}.${a}` as Permission;
  const deny = (ctx: Ctx, p: Permission, id?: ID): never => denyWith(ctx, resource, p, id);
  const rows = () => store.table(table) as unknown as AnyRow[];

  const reject = (ctx: Ctx, msg: string, id?: ID): never => {
    audit(ctx, {
      action: `${resource}.write`,
      resourceType: resource,
      ...(id ? { resourceId: id } : {}),
      teamId: ctx.user.teamId,
      ownerId: ctx.user.id,
      summary: `Rejected write: ${msg}`,
      outcome: "denied",
    });
    throw new ValidationError(msg);
  };

  const checkFields = (
    ctx: Ctx,
    input: unknown,
    allowed: readonly string[],
    id?: ID,
  ): Record<string, unknown> => {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      return reject(ctx, "input must be an object", id);
    const data = clone(input as Record<string, unknown>);
    for (const k of Object.keys(data)) {
      if (!allowed.includes(k) && !(ASSIGN_FIELDS as readonly string[]).includes(k))
        reject(ctx, `field "${k}" is not writable`, id);
    }
    return data;
  };

  const checkAssignment = (
    ctx: Ctx,
    next: AnyRow,
    before: Pick<ScopedRecord, "ownerId" | "teamId" | "assignedUserIds">,
    id?: ID,
  ) => {
    if (!Array.isArray(next.assignedUserIds)) reject(ctx, "assignedUserIds must be an array", id);
    const changed =
      next.ownerId !== before.ownerId ||
      next.teamId !== before.teamId ||
      JSON.stringify([...next.assignedUserIds].sort()) !==
        JSON.stringify([...before.assignedUserIds].sort());
    if (!changed) return;
    const scope = cappedScope(ctx.user, perm("assign"));
    if (!scope) deny(ctx, perm("assign"), id);
    const org = ctx.user.organizationId;
    const users = store.table("users").filter((u) => u.organizationId === org);
    const team = store.table("teams").find((t) => t.id === next.teamId && t.organizationId === org);
    if (!team) reject(ctx, `unknown team "${next.teamId}"`, id);
    const people = [next.ownerId, ...next.assignedUserIds];
    for (const pid of people) {
      const u = users.find((x) => x.id === pid);
      if (!u) reject(ctx, `unknown user "${pid}"`, id);
      if (scope === "team" && u!.teamId !== ctx.user.teamId) deny(ctx, perm("assign"), id);
      if (scope === "self" && pid !== ctx.user.id) deny(ctx, perm("assign"), id);
    }
    if (scope !== "organization" && next.teamId !== ctx.user.teamId) deny(ctx, perm("assign"), id);
  };

  /** Validates the complete candidate row; nothing is persisted unless this passes. */
  const checkShape = (ctx: Ctx, row: AnyRow, id?: ID) => {
    for (const f of spec.required) {
      const v = row[f];
      if (typeof v !== "string" || !v.trim()) reject(ctx, `field "${f}" is required`, id);
    }
    for (const [f, allowed] of Object.entries(spec.enums)) {
      if (typeof row[f] !== "string" || !allowed.includes(row[f] as string))
        reject(ctx, `invalid ${f} ${JSON.stringify(row[f] ?? null)}`, id);
    }
    for (const f of spec.booleans ?? [])
      if (typeof row[f] !== "boolean") reject(ctx, `field "${f}" must be true or false`, id);
    for (const f of spec.optionalStrings ?? []) {
      if (f in row && typeof row[f] !== "string")
        reject(ctx, `field "${f}" must be a string when supplied`, id);
    }
  };

  const checkParent = (ctx: Ctx, next: AnyRow, id?: ID) => {
    if (!spec.parent) return;
    const pid = next[spec.parent.field];
    const parent = (store.table(spec.parent.table) as unknown as AnyRow[]).find(
      (x) => x.id === pid,
    );
    if (!parent || parent.organizationId !== ctx.user.organizationId)
      reject(ctx, `invalid ${spec.parent.field}`, id);
    if (!can(ctx.user, `${spec.parent.resource}.read` as Permission, parent))
      reject(ctx, `invalid ${spec.parent.field}`, id);
  };

  return {
    list(ctx: Ctx): R[] {
      if (!can(ctx.user, perm("read"))) return [];
      return clone(rows().filter((r) => can(ctx.user, perm("read"), r))) as unknown as R[];
    },
    get(ctx: Ctx, id: ID): R {
      const r = rows().find((x) => x.id === id);
      // Unknown and unauthorized ids are indistinguishable to the caller.
      if (!r || !can(ctx.user, perm("read"), r)) return deny(ctx, perm("read"), id);
      return clone(r) as unknown as R;
    },
    create(ctx: Ctx, input: CIn): R {
      if (!can(ctx.user, perm("create"))) return deny(ctx, perm("create"));
      const data = checkFields(ctx, input, spec.createFields);
      const now = new Date().toISOString();
      const defaults = {
        ownerId: ctx.user.id,
        teamId: ctx.user.teamId,
        assignedUserIds: [] as ID[],
      };
      const row = {
        ...defaults,
        ...spec.defaults,
        ...data,
        id: newId(resource.slice(0, 3)),
        organizationId: ctx.user.organizationId,
        createdAt: now,
        createdBy: ctx.user.id,
        updatedAt: now,
        updatedBy: ctx.user.id,
      } as AnyRow;
      checkShape(ctx, row);
      checkAssignment(ctx, row, defaults);
      checkParent(ctx, row);
      spec.checkStatus?.(ctx, (p) => deny(ctx, p), row["status"] as string | undefined);
      if (!can(ctx.user, perm("create"), row)) return deny(ctx, perm("create"));
      store.replace(table, [...rows(), row] as never);
      audit(ctx, {
        action: perm("create"),
        resourceType: resource,
        resourceId: row.id,
        teamId: row.teamId,
        ownerId: row.ownerId,
        summary: `Created ${resource}`,
        outcome: "allowed",
      });
      return clone(row) as unknown as R;
    },
    update(ctx: Ctx, id: ID, patch: UIn): R {
      const current = rows().find((x) => x.id === id);
      if (!current || !can(ctx.user, perm("update"), current)) return deny(ctx, perm("update"), id);
      const data = checkFields(ctx, patch, spec.updateFields, id);
      const next = {
        ...current,
        ...data,
        id,
        organizationId: current.organizationId,
        createdAt: current.createdAt,
        createdBy: current.createdBy,
        updatedAt: new Date().toISOString(),
        updatedBy: ctx.user.id,
      } as AnyRow;
      // An explicitly supplied status (including undefined/null) is validated; an omitted one keeps the stored value.
      if (
        Object.prototype.hasOwnProperty.call(data, "status") &&
        typeof data["status"] !== "string"
      )
        reject(ctx, `invalid status ${JSON.stringify(data["status"] ?? null)}`, id);
      checkShape(ctx, next, id);
      checkAssignment(ctx, next, current, id);
      checkParent(ctx, next, id);
      if (Object.prototype.hasOwnProperty.call(data, "status"))
        spec.checkStatus?.(
          ctx,
          (p) => deny(ctx, p, id),
          next["status"] as string,
          current["status"] as string,
        );
      if (!can(ctx.user, perm("update"), next)) return deny(ctx, perm("update"), id);
      store.replace(table, rows().map((r) => (r.id === id ? next : r)) as never);
      audit(ctx, {
        action: perm("update"),
        resourceType: resource,
        resourceId: id,
        teamId: next.teamId,
        ownerId: next.ownerId,
        summary: `Updated ${resource}`,
        outcome: "allowed",
      });
      return clone(next) as unknown as R;
    },
  };
}

/** Statuses a generic proposal update may set. Approval/sharing/acceptance need dedicated workflows (later phases). */
const ASSESSMENT_STATUSES = [
  "draft",
  "in_progress",
  "under_review",
  "completed",
  "archived",
] as const;
const PROPOSAL_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "shared",
  "accepted",
  "declined",
  "expired",
] as const;
const PROPOSAL_EDITABLE: ProposalStatus[] = ["draft", "in_review"];
const PROPOSAL_PROTECTED: Partial<Record<ProposalStatus, Permission>> = {
  approved: "proposal.approve",
  shared: "proposal.share",
  accepted: "proposal.approve",
  declined: "proposal.approve",
  expired: "proposal.approve",
};

export const repos = {
  assessments: createScopedRepository<Assessment, AssessmentCreateInput, AssessmentUpdateInput>({
    table: "assessments",
    resource: "assessment",
    createFields: [
      "type",
      "title",
      "subjectName",
      "channel",
      "status",
      "crmReferenceId",
      "tenantReferenceId",
      "scenarioCode",
    ],
    updateFields: [
      "title",
      "subjectName",
      "status",
      "channel",
      "crmReferenceId",
      "tenantReferenceId",
    ],
    defaults: { status: "draft" },
    required: ["title", "subjectName"],
    enums: {
      type: ["tenant", "partner"],
      status: ASSESSMENT_STATUSES,
      channel: ["direct", "website_self", "website_boss", "partner_referral", "existing_tenant"],
    },
    optionalStrings: ["crmReferenceId", "tenantReferenceId", "scenarioCode"],
  }),
  proposals: createScopedRepository<Proposal, ProposalCreateInput, ProposalUpdateInput>({
    table: "proposals",
    resource: "proposal",
    createFields: ["assessmentId", "title", "track", "status", "includesPricing"],
    updateFields: ["title", "status", "includesPricing"],
    parent: { field: "assessmentId", table: "assessments", resource: "assessment" },
    defaults: { status: "draft", includesPricing: false },
    required: ["title", "assessmentId"],
    enums: {
      status: PROPOSAL_STATUSES,
      track: ["tenant_solution", "tenant_commercial", "reseller_partner", "strategic_partner"],
    },
    booleans: ["includesPricing"],
    checkStatus: (ctx, deny, next, current) => {
      if (next === undefined || next === current) return;
      if (current && !PROPOSAL_EDITABLE.includes(current as ProposalStatus))
        throw new ValidationError(
          `status "${current}" can only change through its dedicated workflow`,
        );
      if (PROPOSAL_EDITABLE.includes(next as ProposalStatus)) return;
      const p = PROPOSAL_PROTECTED[next as ProposalStatus];
      if (!p) throw new ValidationError(`unknown status "${next}"`);
      if (!can(ctx.user, p)) deny(p);
      throw new ValidationError(
        `status "${next}" requires the dedicated ${p} workflow, which is not available in Phase 1`,
      );
    },
  }),
  engagements: createScopedRepository<Engagement, EngagementCreateInput, EngagementUpdateInput>({
    table: "engagements",
    resource: "engagement",
    createFields: ["proposalId", "title", "status", "tenantSuccessReferenceId"],
    updateFields: ["title", "status", "tenantSuccessReferenceId"],
    parent: { field: "proposalId", table: "proposals", resource: "proposal" },
    defaults: { status: "planned" },
    required: ["title", "proposalId"],
    enums: { status: ["planned", "active", "on_hold", "completed"] },
    optionalStrings: ["tenantSuccessReferenceId"],
  }),
};

/**
 * Internal directory, filtered by the effective professional.read scope
 * (partner-affiliated users are capped at Self). Organization scope sees the
 * whole organization; team scope sees its own team; self sees only itself.
 */
function directoryScope(ctx: Ctx) {
  return cappedScope(ctx.user, "professional.read");
}
function visibleUsers(ctx: Ctx): User[] {
  const scope = directoryScope(ctx);
  const inOrg = store.table("users").filter((u) => u.organizationId === ctx.user.organizationId);
  if (scope === "organization") return inOrg;
  if (scope === "team") return inOrg.filter((u) => u.teamId === ctx.user.teamId);
  return inOrg.filter((u) => u.id === ctx.user.id);
}
export const directory = {
  professionals(ctx: Ctx): CIAProfessional[] {
    if (!directoryScope(ctx)) return [];
    const ids = new Set(visibleUsers(ctx).map((u) => u.id));
    return clone(
      store
        .table("professionals")
        .filter((p) => p.organizationId === ctx.user.organizationId && ids.has(p.userId)),
    );
  },
  affiliations(ctx: Ctx): CIAAffiliation[] {
    if (!directoryScope(ctx)) return [];
    const ids = new Set(directory.professionals(ctx).map((p) => p.affiliationId));
    return clone(
      store
        .table("affiliations")
        .filter((a) => a.organizationId === ctx.user.organizationId && ids.has(a.id)),
    );
  },
  teams(ctx: Ctx): Team[] {
    const scope = directoryScope(ctx);
    if (!scope) return [];
    return clone(
      store
        .table("teams")
        .filter(
          (t) =>
            t.organizationId === ctx.user.organizationId &&
            (scope === "organization" || t.id === ctx.user.teamId),
        ),
    );
  },
  /** Display name for a colleague; opaque outside the caller's directory scope. */
  displayName(ctx: Ctx, userId: ID): string {
    if (userId === ctx.user.id) return ctx.user.name;
    if (!directoryScope(ctx)) return "Colleague";
    return visibleUsers(ctx).find((u) => u.id === userId)?.name ?? "Colleague";
  },
};

/**
 * Audit reads honour the effective audit.read scope. Without audit.read a user
 * sees only their own actions; public visitors see nothing.
 */
export const auditLog = {
  list(ctx: Ctx): AuditEvent[] {
    const { user } = ctx;
    const inOrg = store.audit().filter((e) => e.organizationId === user.organizationId);
    const scope = cappedScope(user, "audit.read");
    if (scope === "organization") return inOrg;
    if (scope === "team")
      return inOrg.filter((e) => e.actorId === user.id || e.teamId === user.teamId);
    if (user.roles.every((r) => r === "public_visitor")) return [];
    return inOrg.filter((e) => e.actorId === user.id);
  },
};

/** Administrative mock controls and diagnostics; settings.manage is required at execution time. */
export const adminActions = {
  canManage: (ctx: Ctx) => can(ctx.user, "settings.manage"),
  async run<T>(ctx: Ctx, label: string, op: () => T | Promise<T>): Promise<T> {
    if (!can(ctx.user, "settings.manage")) denyWith(ctx, "system", "settings.manage");
    const result = await op();
    audit(ctx, {
      action: "settings.manage",
      resourceType: "system",
      teamId: ctx.user.teamId,
      ownerId: ctx.user.id,
      summary: label,
      outcome: "allowed",
    });
    return result;
  },
};

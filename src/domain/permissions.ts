/**
 * Illustrative authorization model (§12). In production DevHarmony declares
 * roles/feature permissions and Access Control maps job profiles to roles.
 * Enforcement happens in the repository layer, never only in the UI.
 */
import type { ID, ResourceType, RoleKey, ScopedRecord, User } from "./types";

export type Scope = "self" | "team" | "organization";
export type Action = "read" | "create" | "update" | "delete" | "approve" | "share" | "assign";
export type FitAction =
  | "read"
  | "contact"
  | "manage"
  | "assign"
  | "convert"
  | "questionnaire"
  | "publish_questionnaire"
  | "rules"
  | "publish_rules";
export type Permission =
  | `${ResourceType}.${Action}`
  | `business_fit.${FitAction}`
  | `delivery.${DeliveryAction}`
  | `network.${NetworkAction}`
  | "settings.manage"
  | "audit.read";

export type DeliveryAction =
  | "read"
  | "create"
  | "authorize"
  | "scope"
  | "assign"
  | "plan"
  | "interact"
  | "submit"
  | "review"
  | "accept"
  | "change"
  | "approve_change"
  | "risk"
  | "measure"
  | "verify"
  | "conduct_review"
  | "complete"
  | "cancel"
  | "continue"
  | "commercial";
export type NetworkAction =
  | "read"
  | "manage"
  | "affiliation"
  | "qualification"
  | "verify"
  | "activate"
  | "suspend"
  | "expertise";
const DELIVERY_ACTIONS: DeliveryAction[] = [
  "read",
  "create",
  "authorize",
  "scope",
  "assign",
  "plan",
  "interact",
  "submit",
  "review",
  "accept",
  "change",
  "approve_change",
  "risk",
  "measure",
  "verify",
  "conduct_review",
  "complete",
  "cancel",
  "continue",
  "commercial",
];
const NETWORK_ACTIONS: NetworkAction[] = [
  "read",
  "manage",
  "affiliation",
  "qualification",
  "verify",
  "activate",
  "suspend",
  "expertise",
];
const featureGrants = (
  prefix: "delivery" | "network",
  actions: readonly string[],
  scope: Scope,
): Grants => Object.fromEntries(actions.map((a) => [`${prefix}.${a}`, scope]));

export const ROLE_LABELS: Record<RoleKey, string> = {
  cia_admin: "C.I.A. Administrator",
  cia_manager: "C.I.A. Manager",
  cia_professional: "C.I.A. Professional",
  partner_manager: "Partner Manager",
  proposal_reviewer: "Proposal Reviewer",
  public_visitor: "Public Visitor",
};

type Grants = Partial<Record<Permission, Scope>>;
const all = (r: ResourceType, s: Scope, actions: Action[]): Grants =>
  Object.fromEntries(actions.map((a) => [`${r}.${a}`, s]));

export const ROLE_GRANTS: Record<RoleKey, Grants> = {
  cia_admin: {
    ...featureGrants("delivery", DELIVERY_ACTIONS, "organization"),
    ...featureGrants("network", NETWORK_ACTIONS, "organization"),
    "business_fit.read": "organization",
    "business_fit.contact": "organization",
    "business_fit.manage": "organization",
    "business_fit.assign": "organization",
    "business_fit.convert": "organization",
    "business_fit.questionnaire": "organization",
    "business_fit.publish_questionnaire": "organization",
    "business_fit.rules": "organization",
    "business_fit.publish_rules": "organization",
    ...all("assessment", "organization", [
      "read",
      "create",
      "update",
      "delete",
      "assign",
      "approve",
    ]),
    ...all("solution", "organization", ["read", "create", "update", "delete", "assign", "approve"]),
    ...all("proposal", "organization", ["read", "create", "update", "delete", "approve", "share"]),
    ...all("engagement", "organization", ["read", "create", "update", "assign"]),
    ...all("professional", "organization", ["read", "create", "update", "assign"]),
    "settings.manage": "organization",
    "audit.read": "organization",
  },
  cia_manager: {
    ...featureGrants("delivery", DELIVERY_ACTIONS, "team"),
    ...featureGrants(
      "network",
      ["read", "manage", "affiliation", "qualification", "verify", "activate", "suspend"],
      "team",
    ),
    "business_fit.read": "team",
    "business_fit.contact": "team",
    "business_fit.manage": "team",
    "business_fit.assign": "team",
    "business_fit.convert": "team",
    "business_fit.questionnaire": "team",
    "business_fit.rules": "team",
    ...all("assessment", "team", ["read", "create", "update", "assign", "approve"]),
    ...all("solution", "team", ["read", "create", "update", "assign", "approve"]),
    ...all("proposal", "team", ["read", "create", "update", "share"]),
    ...all("engagement", "team", ["read", "create", "update", "assign"]),
    ...all("professional", "organization", ["read", "assign"]),
    "audit.read": "team",
  },
  cia_professional: {
    ...featureGrants(
      "delivery",
      [
        "read",
        "plan",
        "interact",
        "submit",
        "change",
        "risk",
        "measure",
        "conduct_review",
        "continue",
      ],
      "self",
    ),
    ...featureGrants("network", ["read", "manage", "qualification"], "self"),
    "business_fit.read": "self",
    "business_fit.contact": "self",
    "business_fit.manage": "self",
    "business_fit.convert": "self",
    ...all("assessment", "self", ["read", "create", "update"]),
    ...all("solution", "self", ["read", "create", "update"]),
    ...all("proposal", "self", ["read", "create", "update"]),
    ...all("engagement", "self", ["read", "update"]),
    ...all("professional", "organization", ["read"]),
  },
  partner_manager: {
    ...featureGrants(
      "delivery",
      [
        "read",
        "create",
        "assign",
        "plan",
        "interact",
        "submit",
        "change",
        "risk",
        "measure",
        "conduct_review",
        "continue",
      ],
      "self",
    ),
    ...featureGrants("network", ["read"], "self"),
    "business_fit.read": "team",
    "business_fit.contact": "team",
    "business_fit.manage": "team",
    "business_fit.convert": "team",
    ...all("assessment", "team", ["read", "create", "update"]),
    ...all("solution", "team", ["read", "create", "update"]),
    ...all("proposal", "team", ["read", "create", "update", "share"]),
    ...all("professional", "organization", ["read"]),
  },
  proposal_reviewer: {
    ...featureGrants(
      "delivery",
      ["read", "review", "accept", "verify", "conduct_review"],
      "organization",
    ),
    ...featureGrants("network", ["read"], "organization"),
    ...all("proposal", "organization", ["read", "approve"]),
    ...all("assessment", "organization", ["read"]),
    ...all("solution", "organization", ["read"]),
  },
  public_visitor: {},
};

const SCOPE_RANK: Record<Scope, number> = { self: 1, team: 2, organization: 3 };

/** Effective scope = widest scope any of the user's roles grants. */
export function effectiveScope(user: User, permission: Permission): Scope | null {
  let best: Scope | null = null;
  for (const role of user.roles) {
    const s = ROLE_GRANTS[role][permission];
    if (s && (!best || SCOPE_RANK[s] > SCOPE_RANK[best])) best = s;
  }
  return best;
}

/** Partner-affiliated users are capped at Self scope regardless of role grants. */
function cappedScope(user: User, scope: Scope): Scope {
  return user.affiliation === "partner" ? "self" : scope;
}

export function can(
  user: User,
  permission: Permission,
  resource?: Pick<ScopedRecord, "organizationId" | "ownerId" | "teamId" | "assignedUserIds">,
): boolean {
  const raw = effectiveScope(user, permission);
  if (!raw) return false;
  if (!resource) return true;
  if (resource.organizationId !== user.organizationId) return false;
  const scope = cappedScope(user, raw);
  const isSelf = resource.ownerId === user.id || resource.assignedUserIds.includes(user.id);
  if (scope === "self") return isSelf;
  if (scope === "team") return isSelf || resource.teamId === user.teamId;
  return true;
}

export class AccessDeniedError extends Error {
  constructor(
    public readonly permission: Permission,
    public readonly resourceId?: ID,
  ) {
    super(`Access denied: ${permission}${resourceId ? ` on ${resourceId}` : ""}`);
    this.name = "AccessDeniedError";
  }
}

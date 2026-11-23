/**
 * Repository layer with authorization enforced on every call (§12).
 * UI hiding is a convenience; these checks are the real boundary.
 */
import { AccessDeniedError, can, type Permission } from "@/domain/permissions";
import type { ResourceType, ScopedRecord, User } from "@/domain/types";
import { newId, store, type Tables } from "./store";

type ScopedTable = { [K in keyof Tables]: Tables[K][number] extends ScopedRecord ? K : never }[keyof Tables];
type Row<K extends ScopedTable> = Tables[K][number];

export interface Ctx { user: User }

export function createScopedRepository<K extends ScopedTable>(table: K, resource: ResourceType) {
  const perm = (a: string) => `${resource}.${a}` as Permission;
  const deny = (ctx: Ctx, p: Permission, id?: string): never => {
    store.log({ actorId: ctx.user.id, action: p, resourceType: resource, ...(id ? { resourceId: id } : {}), summary: `Denied ${p}`, outcome: "denied" });
    throw new AccessDeniedError(p, id);
  };
  const rows = () => store.table(table) as Row<K>[];

  return {
    list(ctx: Ctx): Row<K>[] {
      if (!can(ctx.user, perm("read"))) return [];
      return rows().filter((r) => can(ctx.user, perm("read"), r));
    },
    get(ctx: Ctx, id: string): Row<K> {
      const r = rows().find((x) => x.id === id);
      if (!r) throw new Error(`Not found: ${id}`);
      if (!can(ctx.user, perm("read"), r)) return deny(ctx, perm("read"), id);
      return r;
    },
    create(ctx: Ctx, data: Omit<Row<K>, "id" | "organizationId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy">): Row<K> {
      if (!can(ctx.user, perm("create"))) return deny(ctx, perm("create"));
      const now = new Date().toISOString();
      const row = { ...data, id: newId(resource.slice(0, 3)), organizationId: ctx.user.organizationId, createdAt: now, createdBy: ctx.user.id, updatedAt: now, updatedBy: ctx.user.id } as Row<K>;
      store.replace(table, [...rows(), row] as Tables[K]);
      store.log({ actorId: ctx.user.id, action: perm("create"), resourceType: resource, resourceId: row.id, summary: `Created ${resource}`, outcome: "allowed" });
      return row;
    },
    update(ctx: Ctx, id: string, patch: Partial<Row<K>>): Row<K> {
      const current = rows().find((x) => x.id === id);
      if (!current) throw new Error(`Not found: ${id}`);
      if (!can(ctx.user, perm("update"), current)) return deny(ctx, perm("update"), id);
      const next = { ...current, ...patch, id, updatedAt: new Date().toISOString(), updatedBy: ctx.user.id } as Row<K>;
      store.replace(table, rows().map((r) => (r.id === id ? next : r)) as Tables[K]);
      store.log({ actorId: ctx.user.id, action: perm("update"), resourceType: resource, resourceId: id, summary: `Updated ${resource}`, outcome: "allowed" });
      return next;
    },
  };
}

export const repos = {
  assessments: createScopedRepository("assessments", "assessment"),
  proposals: createScopedRepository("proposals", "proposal"),
  engagements: createScopedRepository("engagements", "engagement"),
};

export const directory = {
  professionals: () => store.table("professionals"),
  affiliations: () => store.table("affiliations"),
  teams: () => store.table("teams"),
};

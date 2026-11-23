/**
 * Simulated persistence (§13): an in-memory store with change notification.
 * Internal to the data layer — screens must go through repositories.
 * Every read returns a deep copy and every write stores a deep copy, so no
 * caller can mutate stored state through a shared reference.
 */
import type { AuditEvent, BaseRecord } from "@/domain/types";
import * as seed from "./seed";

export interface Tables {
  assessments: typeof seed.seedAssessments;
  proposals: typeof seed.seedProposals;
  engagements: typeof seed.seedEngagements;
  professionals: typeof seed.seedProfessionals;
  affiliations: typeof seed.seedAffiliations;
  teams: typeof seed.seedTeams;
  users: typeof seed.seedUsers;
}

const clone = <T>(v: T): T => structuredClone(v);

function fresh(): { tables: Tables; audit: AuditEvent[] } {
  return {
    tables: clone({
      assessments: seed.seedAssessments,
      proposals: seed.seedProposals,
      engagements: seed.seedEngagements,
      professionals: seed.seedProfessionals,
      affiliations: seed.seedAffiliations,
      teams: seed.seedTeams,
      users: seed.seedUsers,
    }),
    audit: clone(seed.seedAudit),
  };
}

let db = fresh();
let version = 0;
const listeners = new Set<() => void>();

/** @internal Data-layer only. */
export const store = {
  table<K extends keyof Tables>(k: K): Tables[K] {
    // A live-reloaded store may predate a newly added table; backfill it from seed.
    if (!db.tables[k]) db.tables[k] = fresh().tables[k];
    return clone(db.tables[k]);
  },
  replace<K extends keyof Tables>(k: K, rows: Tables[K]) {
    db.tables[k] = clone(rows);
    store.emit();
  },
  audit(): AuditEvent[] {
    return clone(db.audit);
  },
  log(e: Omit<AuditEvent, "id" | "at">) {
    db.audit = [{ ...clone(e), id: newId("aud"), at: new Date().toISOString() }, ...db.audit];
    store.emit();
  },
  reset() {
    db = fresh();
    store.emit();
  },
  emit() {
    version++;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  version: () => version,
};

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
export type { BaseRecord };

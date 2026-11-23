/**
 * Simulated persistence (§13): an in-memory store with change notification.
 * Replaceable by a real backend behind the same repository interfaces.
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
}

function fresh(): { tables: Tables; audit: AuditEvent[] } {
  return {
    tables: structuredClone({
      assessments: seed.seedAssessments,
      proposals: seed.seedProposals,
      engagements: seed.seedEngagements,
      professionals: seed.seedProfessionals,
      affiliations: seed.seedAffiliations,
      teams: seed.seedTeams,
    }),
    audit: structuredClone(seed.seedAudit),
  };
}

let db = fresh();
let version = 0;
const listeners = new Set<() => void>();

export const store = {
  table<K extends keyof Tables>(k: K): Tables[K] { return db.tables[k]; },
  replace<K extends keyof Tables>(k: K, rows: Tables[K]) { db.tables[k] = rows; store.emit(); },
  audit(): AuditEvent[] { return db.audit; },
  log(e: Omit<AuditEvent, "id" | "at">) {
    db.audit = [{ ...e, id: newId("aud"), at: new Date().toISOString() }, ...db.audit];
    store.emit();
  },
  reset() { db = fresh(); store.emit(); },
  emit() { version++; listeners.forEach((l) => l()); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  version: () => version,
};

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
export type { BaseRecord };

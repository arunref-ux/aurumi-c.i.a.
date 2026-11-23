/**
 * Simulated persistence (§13): an in-memory store with change notification and
 * an optional local persistence backend (browser localStorage in the app, an
 * in-memory map in tests). Internal to the data layer — screens go through
 * repositories/services. Every read and write is deep-copied.
 *
 * SIMULATED STORAGE: this is not production storage. Only fictional workspace
 * data is kept; never store secrets, credentials or real customer data here.
 */
import type { AssessmentHandoffSnapshot, AssessmentWorkspace } from "@/domain/assessment";
import type { AuditEvent, BaseRecord } from "@/domain/types";
import { sanitizeTable, type QuarantineEntry } from "./persisted-schema";
import * as seed from "./seed";

export interface Tables {
  assessments: typeof seed.seedAssessments;
  proposals: typeof seed.seedProposals;
  engagements: typeof seed.seedEngagements;
  professionals: typeof seed.seedProfessionals;
  affiliations: typeof seed.seedAffiliations;
  teams: typeof seed.seedTeams;
  users: typeof seed.seedUsers;
  workspaces: AssessmentWorkspace[];
  snapshots: AssessmentHandoffSnapshot[];
}

/** Tables that represent user work and survive reloads; directory tables always come from seed. */
const PERSISTED = ["assessments", "proposals", "engagements", "workspaces", "snapshots"] as const;
export const STORAGE_KEY = "aurumi.cia.simulated-store.v1";
/** Saved entries that failed validation are kept here for recovery, never deleted. */
export const QUARANTINE_KEY = `${STORAGE_KEY}.quarantine`;

export interface PersistenceBackend {
  kind: "browser" | "memory";
  read(key: string): string | null;
  write(key: string, value: string): void;
}
export function memoryBackend(): PersistenceBackend {
  const m = new Map<string, string>();
  return { kind: "memory", read: (k) => m.get(k) ?? null, write: (k, v) => void m.set(k, v) };
}
export function browserBackend(): PersistenceBackend | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const ls = window.localStorage;
    return { kind: "browser", read: (k) => ls.getItem(k), write: (k, v) => ls.setItem(k, v) };
  } catch {
    return null;
  }
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
      workspaces: seed.seedWorkspaces,
      snapshots: [],
    }),
    audit: clone(seed.seedAudit),
  };
}

let db = fresh();
/** Bumps on every change, including audit events (activity feeds). */
let version = 0;
/** Bumps only when work/directory data changes; audit events never move it (P1-04). */
let dataVersion = 0;
let backend: PersistenceBackend | null = null;
let persistState: {
  mode: "none" | "browser" | "memory";
  lastSavedAt: string | null;
  error: string | null;
  /** Plain-language note when saved work needed recovery. */
  recovery: string | null;
  quarantined: number;
} = {
  mode: "none",
  lastSavedAt: null,
  error: null,
  recovery: null,
  quarantined: 0,
};
/** When saved work could not be read, saving is paused so it is never overwritten. */
let savingBlocked = false;
const listeners = new Set<() => void>();

function save() {
  if (!backend || savingBlocked) return;
  try {
    const payload = {
      savedAt: new Date().toISOString(),
      tables: Object.fromEntries(PERSISTED.map((k) => [k, db.tables[k]])),
      audit: db.audit,
    };
    backend.write(STORAGE_KEY, JSON.stringify(payload));
    persistState = { ...persistState, lastSavedAt: payload.savedAt, error: null };
  } catch (e) {
    persistState = { ...persistState, error: e instanceof Error ? e.message : "save failed" };
  }
}

function quarantine(entries: QuarantineEntry[]) {
  if (!backend || !entries.length) return;
  try {
    const prev = JSON.parse(backend.read(QUARANTINE_KEY) ?? "[]") as unknown;
    const list = Array.isArray(prev) ? prev : [];
    const at = new Date().toISOString();
    backend.write(
      QUARANTINE_KEY,
      JSON.stringify([...list, ...entries.map((e) => ({ ...e, at }))].slice(-200)),
    );
  } catch {
    /* quarantine is best effort; the in-memory note still tells the user */
  }
}

/** Loads saved work over seed data; saved drafts always win over seed, after validation. */
function load() {
  db = fresh();
  savingBlocked = false;
  if (!backend) return;
  let raw: string | null;
  try {
    raw = backend.read(STORAGE_KEY);
  } catch {
    savingBlocked = true;
    persistState = {
      ...persistState,
      error: null,
      recovery:
        "Saved work could not be read from this browser, so sample data is shown. Saving is paused so your saved work is not overwritten — reload to try again.",
    };
    return;
  }
  if (!raw) return;
  let parsed: { savedAt?: string; tables?: Record<string, unknown>; audit?: unknown };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
  } catch {
    quarantine([{ table: "*", path: STORAGE_KEY, reason: "unreadable saved data", value: raw }]);
    persistState = {
      ...persistState,
      recovery:
        "Saved work was damaged and could not be opened. A copy was set aside for recovery; sample data is shown.",
      quarantined: 1,
    };
    return;
  }
  const setAside: QuarantineEntry[] = [];
  for (const k of PERSISTED) {
    const rows = parsed.tables?.[k];
    if (rows === undefined) continue;
    const r = sanitizeTable(k, rows);
    setAside.push(...r.quarantined);
    (db.tables as unknown as Record<string, unknown>)[k] = r.rows;
  }
  if (Array.isArray(parsed.audit)) db.audit = parsed.audit as AuditEvent[];
  quarantine(setAside);
  persistState = {
    ...persistState,
    lastSavedAt: parsed.savedAt ?? null,
    error: null,
    quarantined: setAside.length,
    recovery: setAside.length
      ? `${setAside.length} damaged saved item(s) were set aside for recovery; everything else was restored.`
      : null,
  };
}

/** @internal Data-layer only. */
export const store = {
  table<K extends keyof Tables>(k: K): Tables[K] {
    // A live-reloaded store may predate a newly added table; backfill it from seed.
    if (!db.tables[k]) db.tables[k] = fresh().tables[k];
    return clone(db.tables[k]);
  },
  replace<K extends keyof Tables>(k: K, rows: Tables[K]) {
    db.tables[k] = clone(rows);
    dataVersion++;
    store.emit();
  },
  audit(): AuditEvent[] {
    return clone(db.audit);
  },
  log(e: Omit<AuditEvent, "id" | "at">) {
    db.audit = [{ ...clone(e), id: newId("aud"), at: new Date().toISOString() }, ...db.audit];
    store.emit();
  },
  /** Attach a persistence backend and load saved work from it (simulates a page refresh when re-called). */
  attach(b: PersistenceBackend | null) {
    backend = b;
    persistState = {
      mode: b ? b.kind : "none",
      lastSavedAt: null,
      error: null,
      recovery: null,
      quarantined: 0,
    };
    load();
    version++;
    dataVersion++;
    listeners.forEach((l) => l());
  },
  persistence: () => ({ ...persistState }),
  reset() {
    db = fresh();
    dataVersion++;
    store.emit();
  },
  emit() {
    version++;
    save();
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  version: () => version,
  dataVersion: () => dataVersion,
};

export function newId(prefix: string): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rnd}`;
}
export type { BaseRecord };

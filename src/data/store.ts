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
  /** True only after the recovery copy was written and read back intact. */
  backupSaved: boolean;
  /** Saved work is unprotected: nothing may be written until recovery succeeds. */
  protected: boolean;
} = {
  mode: "none",
  lastSavedAt: null,
  error: null,
  recovery: null,
  quarantined: 0,
  backupSaved: false,
  protected: false,
};
/** The untouched original payload and what was set aside, kept until a backup is confirmed. */
let pending: { raw: string; reason: string; entries: QuarantineEntry[] } | null = null;
/** Saved work could not even be read; writing would risk overwriting it. */
let readFailed = false;
const listeners = new Set<() => void>();

export class StorageProtectedError extends Error {
  constructor() {
    super(
      "Saved work is protected until a recovery copy can be stored. Changes are paused — use “Try recovery again”.",
    );
    this.name = "StorageProtectedError";
  }
}
const isProtected = () => readFailed || pending !== null;

function save() {
  if (!backend || isProtected()) return;
  try {
    const payload = {
      savedAt: new Date().toISOString(),
      tables: Object.fromEntries(PERSISTED.map((k) => [k, db.tables[k]])),
      audit: db.audit,
    };
    backend.write(STORAGE_KEY, JSON.stringify(payload));
    persistState = { ...persistState, lastSavedAt: payload.savedAt, error: null };
  } catch (e) {
    // A failed write leaves the previous saved payload in place.
    persistState = {
      ...persistState,
      error: `Not saved: ${e instanceof Error ? e.message : "storage write failed"}. Your last saved copy is unchanged.`,
    };
  }
}

/**
 * Appends a full recovery copy (the original payload plus every set-aside entry,
 * never truncated) and confirms it by reading it back. Returns false on any
 * failure, including an unreadable existing recovery list (never overwritten).
 */
function writeBackup(p: { raw: string; reason: string; entries: QuarantineEntry[] }): boolean {
  if (!backend) return false;
  try {
    const existing = backend.read(QUARANTINE_KEY);
    const list = existing === null ? [] : (JSON.parse(existing) as unknown);
    if (!Array.isArray(list)) return false;
    const next = JSON.stringify([
      ...list,
      {
        at: new Date().toISOString(),
        reason: p.reason,
        originalPayload: p.raw,
        entries: p.entries,
      },
    ]);
    backend.write(QUARANTINE_KEY, next);
    return backend.read(QUARANTINE_KEY) === next;
  } catch {
    return false;
  }
}

function protect(raw: string, reason: string, entries: QuarantineEntry[], restored: string) {
  if (writeBackup({ raw, reason, entries })) {
    pending = null;
    persistState = {
      ...persistState,
      backupSaved: true,
      protected: false,
      quarantined: entries.length,
      recovery: `${restored} A recovery copy of the original saved data was stored.`,
    };
  } else {
    pending = { raw, reason, entries };
    persistState = {
      ...persistState,
      backupSaved: false,
      protected: true,
      quarantined: entries.length,
      recovery: `${restored} A recovery copy could NOT be stored, so the original saved data is left untouched and changes are paused until recovery succeeds.`,
    };
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
/**
 * A saved-work envelope is a plain object with a plain-object `tables`
 * container and, when present, valid metadata. Arrays, primitives, null and
 * objects without tables are malformed — never treated as "nothing saved".
 */
function isEnvelope(
  v: unknown,
): v is { savedAt?: string; tables: Record<string, unknown>; audit?: unknown } {
  if (!isPlainObject(v) || !isPlainObject(v["tables"])) return false;
  if (v["savedAt"] !== undefined && typeof v["savedAt"] !== "string") return false;
  if (v["audit"] !== undefined && !Array.isArray(v["audit"])) return false;
  return true;
}

/** Loads saved work over seed data; saved drafts always win over seed, after validation. */
function load() {
  db = fresh();
  pending = null;
  readFailed = false;
  // Start from a clean recovery state; any condition found below sets it again.
  persistState = {
    ...persistState,
    error: null,
    recovery: null,
    quarantined: 0,
    backupSaved: false,
    protected: false,
  };
  if (!backend) return;
  let raw: string | null;
  try {
    raw = backend.read(STORAGE_KEY);
  } catch {
    readFailed = true;
    persistState = {
      ...persistState,
      error: null,
      protected: true,
      recovery:
        "Saved work could not be read from this browser, so sample data is shown. Changes are paused so your saved work is not overwritten.",
    };
    return;
  }
  if (!raw) return;
  let parsed: { savedAt?: string; tables?: Record<string, unknown>; audit?: unknown };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
    if (!isEnvelope(parsed)) throw new Error("not a saved-work envelope");
  } catch {
    protect(
      raw,
      "unreadable or malformed saved data",
      [{ table: "*", path: STORAGE_KEY, reason: "unreadable saved data", value: raw }],
      "Saved work was damaged and could not be opened; sample data is shown.",
    );
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
  persistState = { ...persistState, lastSavedAt: parsed.savedAt ?? null, error: null };
  if (setAside.length)
    protect(
      raw,
      "invalid saved records",
      setAside,
      `${setAside.length} damaged saved item(s) were set aside; everything else was restored.`,
    );
}

/** @internal Data-layer only. */
export const store = {
  table<K extends keyof Tables>(k: K): Tables[K] {
    // A live-reloaded store may predate a newly added table; backfill it from seed.
    if (!db.tables[k]) db.tables[k] = fresh().tables[k];
    return clone(db.tables[k]);
  },
  replace<K extends keyof Tables>(k: K, rows: Tables[K]) {
    if (isProtected()) throw new StorageProtectedError();
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
      backupSaved: false,
      protected: false,
    };
    load();
    version++;
    dataVersion++;
    listeners.forEach((l) => l());
  },
  persistence: () => ({ ...persistState }),
  /**
   * Explicit recovery path: retries storing the recovery copy (or re-reading
   * unreadable storage). Normal saving resumes only once the original is safe.
   */
  retryRecovery(): { ok: boolean; message: string } {
    if (readFailed) {
      load();
    } else if (pending) {
      const p = pending;
      protect(
        p.raw,
        p.reason,
        p.entries,
        `${p.entries.length} damaged saved item(s) were set aside.`,
      );
    }
    const ok = !isProtected();
    // Saved data may have replaced the in-memory dataset: refresh queries. No write-back —
    // the stored copy is already the saved work (or is now backed up) and is left as is.
    dataVersion++;
    version++;
    listeners.forEach((l) => l());
    return { ok, message: store.persistence().recovery ?? "Saved work is available." };
  },
  reset() {
    if (isProtected()) throw new StorageProtectedError();
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

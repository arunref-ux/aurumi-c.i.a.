/**
 * Structural checks for work restored from browser storage (P2-02). Saved data
 * may be stale, hand-edited or corrupted, so every row and child record is
 * checked before the app uses it. Bad entries are set aside (quarantined), never
 * silently dropped; valid siblings are kept.
 */
import { z } from "zod";

const id = z.string().min(1);
const str = z.string();
const ids = z.array(z.string());
const audited = { id, createdAt: str, createdBy: str, updatedAt: str, updatedBy: str };

const source = z.looseObject({ title: str, sourceType: str, retrievedAt: str });
const CHILD = {
  systems: z.looseObject({
    ...audited,
    name: str,
    classification: str,
    evidenceIds: ids,
    compatibility: z.looseObject({ status: str, evidenceIds: ids, note: str }),
  }),
  processes: z.looseObject({ ...audited, name: str, relatedSystemIds: ids, evidenceIds: ids }),
  painPoints: z.looseObject({
    ...audited,
    processId: str,
    description: str,
    relatedSystemIds: ids,
    evidenceIds: ids,
  }),
  requirements: z.looseObject({
    ...audited,
    category: str,
    statement: str,
    basis: str,
    evidenceIds: ids,
  }),
  evidence: z.looseObject({
    ...audited,
    attribute: str,
    statement: str,
    status: str,
    sources: z.array(source),
    researchedAt: str,
    confidence: z.looseObject({ level: str }),
    verification: z.looseObject({ state: str }),
    links: z.array(z.looseObject({ kind: str, id: str })),
    notes: str,
  }),
  customQuestions: z.looseObject({ ...audited, section: str, prompt: str, required: z.boolean() }),
  answers: z.looseObject({ questionId: str, state: str, value: str }),
  openQuestions: z.looseObject({ ...audited, text: str, resolved: z.boolean() }),
  reviewComments: z.looseObject({ ...audited, kind: str, body: str }),
} as const;

const workspaceShell = z.looseObject({
  id,
  organizationId: str,
  assessmentId: id,
  category: str,
  overview: z.looseObject({}),
  profile: z.looseObject({ unknown: z.array(z.string()) }),
  findings: z.looseObject({}),
});

const ROW = {
  assessments: z.looseObject({
    ...audited,
    organizationId: str,
    type: str,
    title: str,
    subjectName: str,
    status: str,
    ownerId: str,
    teamId: str,
    assignedUserIds: ids,
  }),
  proposals: z.looseObject({ id, organizationId: str }),
  engagements: z.looseObject({ id, organizationId: str }),
  snapshots: z.looseObject({ id, schema: str, assessmentId: id, version: z.number() }),
  workspaces: workspaceShell,
} as const;
export type PersistedTable = keyof typeof ROW;

export interface QuarantineEntry {
  table: string;
  path: string;
  reason: string;
  value: unknown;
}

const reasonOf = (e: z.ZodError) =>
  e.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(row)"}: ${i.message}`)
    .join("; ");

/** Returns the rows that pass, with failing rows (or failing child records) quarantined. */
export function sanitizeTable(
  table: PersistedTable,
  rows: unknown,
): { rows: unknown[]; quarantined: QuarantineEntry[] } {
  const quarantined: QuarantineEntry[] = [];
  if (!Array.isArray(rows)) {
    quarantined.push({ table, path: table, reason: "expected a list", value: rows });
    return { rows: [], quarantined };
  }
  const out: unknown[] = [];
  rows.forEach((row, i) => {
    const r = ROW[table].safeParse(row);
    if (!r.success) {
      quarantined.push({ table, path: `${table}[${i}]`, reason: reasonOf(r.error), value: row });
      return;
    }
    if (table !== "workspaces") return void out.push(row);
    // Keep a valid workspace, setting aside only its broken child records.
    const ws = { ...(row as Record<string, unknown>) };
    for (const [kind, schema] of Object.entries(CHILD)) {
      const list = ws[kind];
      if (list === undefined) {
        ws[kind] = [];
        continue;
      }
      if (!Array.isArray(list)) {
        quarantined.push({
          table,
          path: `${table}[${i}].${kind}`,
          reason: "expected a list",
          value: list,
        });
        ws[kind] = [];
        continue;
      }
      ws[kind] = list.filter((item, j) => {
        const c = schema.safeParse(item);
        if (!c.success)
          quarantined.push({
            table,
            path: `${table}[${i}].${kind}[${j}]`,
            reason: reasonOf(c.error),
            value: item,
          });
        return c.success;
      });
    }
    out.push(ws);
  });
  return { rows: out, quarantined };
}

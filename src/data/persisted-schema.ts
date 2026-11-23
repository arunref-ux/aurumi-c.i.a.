/**
 * Structural checks for work restored from browser storage (P2-02). Saved data
 * may be stale, hand-edited or corrupted, so every row and child record is
 * checked before the app uses it. Bad entries are set aside (quarantined), never
 * silently dropped; valid siblings are kept.
 */
import { z } from "zod";
import { FINDING_FIELDS, PARTNER_FIELDS, PROFILE_FIELDS } from "@/domain/assessment";

const id = z.string().min(1);
const str = z.string();
const ids = z.array(z.string());
const audited = { id, createdAt: str, createdBy: str, updatedAt: str, updatedBy: str };

const optStr = z.string().optional();
const source = z.looseObject({
  title: str,
  sourceType: str,
  retrievedAt: str,
  url: optStr,
  publisher: optStr,
  observedAt: optStr,
});
const confidence = z.union([
  z.looseObject({
    level: z.enum(["high", "medium", "low"]),
    score: z.number().optional(),
    rationale: optStr,
  }),
  z.looseObject({ level: z.literal("unknown"), reason: str }),
]);
const verification = z.discriminatedUnion("state", [
  z.looseObject({ state: z.literal("unverified") }),
  z.looseObject({ state: z.literal("verified"), verifiedBy: id, verifiedAt: str, method: str }),
  z.looseObject({ state: z.literal("disputed"), reviewedBy: id, reviewedAt: str, note: str }),
]);
const link = z.looseObject({ kind: str, id });
const strFields = (fields: readonly (readonly [string, string])[]) =>
  Object.fromEntries(fields.map(([k]) => [k, str])) as Record<string, typeof str>;

const CHILD = {
  systems: z.looseObject({
    ...audited,
    name: str,
    vendor: str,
    category: str,
    classification: str,
    deployment: str,
    departments: str,
    processesSupported: str,
    userCount: str,
    usage: str,
    satisfaction: str,
    limitations: str,
    integrationNeeds: str,
    apiAvailability: str,
    notes: str,
    evidenceIds: ids,
    compatibility: z.looseObject({ status: str, evidenceIds: ids, note: str }),
  }),
  processes: z.looseObject({
    ...audited,
    department: str,
    name: str,
    currentProcess: str,
    relatedSystemIds: ids,
    evidenceIds: ids,
  }),
  painPoints: z.looseObject({
    ...audited,
    processId: id,
    description: str,
    impact: str,
    frequency: str,
    severity: str,
    priority: str,
    desiredOutcome: str,
    workaround: str,
    relatedSystemIds: ids,
    evidenceIds: ids,
  }),
  requirements: z.looseObject({
    ...audited,
    category: str,
    statement: str,
    basis: str,
    priority: str,
    evidenceIds: ids,
  }),
  evidence: z.looseObject({
    ...audited,
    attribute: str,
    statement: str,
    status: str,
    sources: z.array(source),
    researchedAt: str,
    confidence,
    verification,
    generatedBy: optStr,
    applicability: optStr,
    links: z.array(link),
    notes: str,
  }),
  customQuestions: z.looseObject({
    ...audited,
    category: str,
    section: str,
    prompt: str,
    required: z.boolean(),
  }),
  answers: z.looseObject({
    questionId: id,
    state: str,
    value: str,
    answeredBy: optStr,
    answeredAt: optStr,
    verifiedBy: optStr,
    verifiedAt: optStr,
  }),
  openQuestions: z.looseObject({ ...audited, text: str, resolved: z.boolean() }),
  reviewComments: z.looseObject({ ...audited, kind: str, body: str }),
} as const;

/** Section objects whose string fields are checked one by one so one bad value doesn't cost the rest. */
const SECTIONS: Record<string, { fields: string[]; required: boolean }> = {
  overview: { fields: ["primaryContact", "purpose", "scope", "summary"], required: true },
  profile: { fields: PROFILE_FIELDS.map(([k]) => k), required: true },
  findings: { fields: FINDING_FIELDS.map(([k]) => k), required: true },
  partner: { fields: PARTNER_FIELDS.map(([k]) => k), required: false },
};

const workspaceShell = z.looseObject({
  id,
  organizationId: str,
  assessmentId: id,
  category: str,
  overview: z.looseObject({}),
  profile: z.looseObject({}),
  findings: z.looseObject({}),
  partner: z.looseObject({}).optional(),
  reviewerId: optStr,
});

const snapshot = z.looseObject({
  id,
  schema: str,
  organizationId: str,
  assessmentId: id,
  version: z.number().int().positive(),
  createdAt: str,
  approval: z.looseObject({ approvedBy: id, approvedAt: str, comment: str }),
  assessment: z.looseObject({ id, type: str, title: str, subjectName: str, channel: str }),
  overview: z.looseObject(
    strFields([
      ["primaryContact", ""],
      ["purpose", ""],
      ["scope", ""],
      ["summary", ""],
    ]),
  ),
  profile: z.looseObject({ ...strFields(PROFILE_FIELDS), unknown: z.array(z.string()) }),
  findings: z.looseObject(strFields(FINDING_FIELDS)),
  systems: z.array(CHILD.systems),
  processes: z.array(CHILD.processes),
  painPoints: z.array(CHILD.painPoints),
  requirements: z.array(CHILD.requirements),
  evidence: z.array(CHILD.evidence),
  answers: z.array(CHILD.answers),
  outstandingQuestions: z.array(CHILD.openQuestions),
  questions: z
    .array(z.looseObject({ id, prompt: str, section: str, required: z.boolean() }))
    .optional(),
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
    channel: str,
    crmReferenceId: optStr,
  }),
  proposals: z.looseObject({ id, organizationId: str }),
  engagements: z.looseObject({ id, organizationId: str }),
  /** Snapshots are immutable records: an invalid one is quarantined whole, never repaired. */
  snapshots: snapshot,
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
    // Repair section objects field by field: a non-string value is set aside and blanked.
    for (const [section, def] of Object.entries(SECTIONS)) {
      const obj = ws[section] as Record<string, unknown> | undefined;
      if (obj === undefined && !def.required) continue;
      const fixed: Record<string, unknown> = { ...(obj ?? {}) };
      for (const f of def.fields) {
        const v = fixed[f];
        if (v === undefined) fixed[f] = "";
        else if (typeof v !== "string") {
          quarantined.push({
            table,
            path: `${table}[${i}].${section}.${f}`,
            reason: "expected text",
            value: v,
          });
          fixed[f] = "";
        }
      }
      if (section === "profile") {
        const u = fixed["unknown"];
        if (u === undefined) fixed["unknown"] = [];
        else if (!Array.isArray(u) || !u.every((x) => typeof x === "string")) {
          quarantined.push({
            table,
            path: `${table}[${i}].profile.unknown`,
            reason: "expected a list of field names",
            value: u,
          });
          fixed["unknown"] = Array.isArray(u) ? u.filter((x) => typeof x === "string") : [];
        }
      }
      ws[section] = fixed;
    }
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

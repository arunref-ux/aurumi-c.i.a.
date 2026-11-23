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
    connectorItemId: optStr,
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
  solutions: z.looseObject({
    ...audited,
    organizationId: str,
    ownerId: str,
    teamId: str,
    assignedUserIds: ids,
    assessmentId: id,
    kind: z.enum(["tenant", "partner"]),
    title: str,
    optionLabel: str,
    subjectName: str,
    status: z.enum(["draft", "in_review", "approved", "returned"]),
    revision: z.number().int().positive(),
    baseline: z.looseObject({
      snapshotId: id,
      snapshotVersion: z.number(),
      schema: str,
      approvedAt: str,
    }),
  }),
  solutionWorkspaces: z.looseObject({
    ...audited,
    organizationId: str,
    solutionId: id,
    overview: z.looseObject({
      objectives: str,
      executiveSummary: str,
      constraints: str,
      outstandingQuestions: str,
      assumptions: str,
      preferredRationale: str,
    }),
    partner: z.looseObject({}).optional(),
    reviewerId: optStr,
    revisions: z.array(
      z.looseObject({ revision: z.number(), baseline: z.looseObject({ snapshotId: id }) }),
    ),
  }),
  /** Immutable: invalid solution snapshots are quarantined whole. */
  solutionSnapshots: z.looseObject({
    id,
    schema: str,
    organizationId: str,
    solutionId: id,
    version: z.number().int().positive(),
    revision: z.number(),
    approval: z.looseObject({ approvedBy: id, approvedAt: str, comment: str }),
    solution: z.looseObject({ id, title: str }),
    baseline: z.looseObject({ snapshotId: id, snapshotVersion: z.number() }),
    needs: z.array(z.looseObject({ id })),
    recommendations: z.array(z.looseObject({ id, title: str, availability: str })),
    integrations: z.array(z.looseObject({ id })),
    aiDesigns: z.array(z.looseObject({ id })),
    values: z.array(z.looseObject({ id })),
    roadmap: z.array(z.looseObject({ id })),
    alternatives: z.array(z.looseObject({ id })),
    catalog: z.looseObject({ catalogVersion: str, items: z.array(z.looseObject({ id })) }),
    evidence: z.array(z.looseObject({ id })),
  }),
  workspaces: workspaceShell,
} as const;
export type PersistedTable = keyof typeof ROW;

export interface QuarantineEntry {
  table: string;
  path: string;
  reason: string;
  value: unknown;
}

const catRef = z.looseObject({ itemId: id, catalogVersion: str, nameAtSelection: str });
/** Child records of a solution workspace, checked one by one so one bad record costs nothing else. */
const SOLUTION_CHILD = {
  needs: z.looseObject({
    ...audited,
    source: z.looseObject({ kind: str, id, label: str }),
    priority: str,
    impact: str,
    outcome: str,
    successCriterion: str,
    disposition: z.enum(["addressed", "deferred", "excluded"]),
    dispositionNote: str,
    sourceStatus: z.enum(["current", "changed", "missing"]),
  }),
  recommendations: z.looseObject({
    ...audited,
    category: str,
    title: str,
    description: str,
    needIds: ids,
    rationale: str,
    approach: str,
    expectedOutcome: str,
    status: str,
    provenance: str,
    evidenceRefs: z.array(z.looseObject({ evidenceId: id, materialKey: str })),
    catalogRefs: z.array(catRef),
    dependsOn: ids,
    mandatory: z.boolean(),
    dependencies: str,
    assumptions: str,
    risks: str,
    fallback: str,
    ownerId: str,
    responsibilities: z.looseObject({ customer: str, aurumi: str, partner: str }),
    justificationStale: z.boolean(),
  }),
  integrations: z.looseObject({
    ...audited,
    systemId: id,
    systemName: str,
    feasibility: str,
    direction: str,
    access: str,
    dataRequired: str,
    mechanism: str,
    proposal: z.looseObject({ kind: str, catalogRef: catRef.optional() }),
    evidenceIds: ids,
    validationOwner: str,
    openQuestions: str,
  }),
  aiDesigns: z.looseObject({
    ...audited,
    recommendationId: id,
    exampleQuestions: z.array(z.string()),
    intent: str,
    capabilityRefs: z.array(catRef),
    mode: z.enum(["read", "write"]),
    humanConfirmation: z.boolean(),
    rolesAndScopes: str,
    sensitiveDataRisks: str,
    fallback: str,
  }),
  values: z.looseObject({
    ...audited,
    kind: str,
    description: str,
    confidence: str,
    assumptionSource: str,
    estimate: z
      .looseObject({ amount: z.number(), currency: str, assumptions: str, source: str })
      .optional(),
  }),
  roadmap: z.looseObject({ ...audited, stage: str, status: z.literal("planning_assumption") }),
  alternatives: z.looseObject({
    ...audited,
    approach: str,
    summary: str,
    criteria: z.looseObject({}),
    limitations: str,
    preferred: z.boolean(),
  }),
  comments: z.looseObject({ ...audited, kind: str, body: str }),
} as const;

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
    if (table === "solutionWorkspaces") {
      const sw = { ...(row as Record<string, unknown>) };
      for (const [kind, schema] of Object.entries(SOLUTION_CHILD)) {
        const list = sw[kind];
        if (list === undefined) {
          sw[kind] = [];
          continue;
        }
        if (!Array.isArray(list)) {
          quarantined.push({
            table,
            path: `${table}[${i}].${kind}`,
            reason: "expected a list",
            value: list,
          });
          sw[kind] = [];
          continue;
        }
        sw[kind] = list.filter((item, j) => {
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
      return void out.push(sw);
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

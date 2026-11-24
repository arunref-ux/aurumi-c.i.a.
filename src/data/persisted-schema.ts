/**
 * Structural checks for work restored from browser storage (P2-02). Saved data
 * may be stale, hand-edited or corrupted, so every row and child record is
 * checked before the app uses it. Bad entries are set aside (quarantined), never
 * silently dropped; valid siblings are kept.
 */
import { z } from "zod";
import { FINDING_FIELDS, PARTNER_FIELDS, PROFILE_FIELDS } from "@/domain/assessment";
import { versionIntegrityProblems, type ProposalVersionRecord } from "@/domain/proposal";
import {
  QuestionnaireSchema,
  RuleSetSchema,
  SessionSchema,
  SnapshotSchema,
  ConsultationSchema,
  IntakeSchema,
  ConversionSchema,
  FitOperationSchema,
  evaluate,
  validateDefinition,
  validateResponses,
  identifiedSystems,
  type BusinessFitSession,
  type BusinessFitSubmissionSnapshot,
} from "@/domain/business-fit";

import { snapshotProblems, sessionProblems } from "@/domain/business-fit-integrity";

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
  fitQuestionnaires: QuestionnaireSchema,
  fitRules: RuleSetSchema,
  fitSessions: SessionSchema,
  fitSnapshots: SnapshotSchema,
  fitConsultations: ConsultationSchema,
  fitIntakes: IntakeSchema,
  fitConversions: ConversionSchema,
  fitOperations: FitOperationSchema,
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
  proposals: z.looseObject({
    id,
    organizationId: str,
    status: z
      .enum([
        "draft",
        "in_review",
        "changes_requested",
        "approved",
        "shared",
        "accepted",
        "declined",
        "expired",
      ])
      .optional(),
    /** Proposal Studio records carry a pinned approved-solution source. */
    source: z
      .looseObject({
        solutionId: id,
        solutionSnapshotId: id,
        solutionSnapshotVersion: z.number().int().positive(),
        assessmentId: id,
        assessmentSnapshotId: id,
      })
      .optional(),
    revision: z.number().int().positive().optional(),
    currentVersionId: optStr,
  }),
  proposalWorkspaces: z.looseObject({
    ...audited,
    organizationId: str,
    proposalId: id,
    recipient: z.looseObject({ name: str, organization: str, contact: str }),
    validityDays: z.number().int().positive(),
    commercialNotes: str,
    reviewerId: optStr,
    revisions: z.array(
      z.looseObject({
        revision: z.number(),
        source: z.looseObject({ solutionSnapshotId: id }),
        workspace: z.looseObject({}),
      }),
    ),
  }),
  /** Immutable: invalid proposal versions are quarantined whole. */
  proposalVersions: z.looseObject({
    schema: z.literal("aurumi.cia.proposal-version/1"),
    id,
    organizationId: str,
    proposalId: id,
    versionNumber: z.number().int().positive(),
    revision: z.number().int().positive(),
    createdAt: str,
    createdBy: id,
    contentHash: str,
    hashContract: z.literal("proposal-content-hash/2").optional(),
    document: z.looseObject({
      templateVersion: str,
      proposal: z.looseObject({ id, title: str, track: str }),
      source: z.looseObject({ solutionSnapshotId: id }),
      solution: z.looseObject({ id, schema: str, sourceAssessment: z.looseObject({ id }) }),
      sections: z.array(z.looseObject({ key: str, title: str, body: str })),
      deliverables: z.array(z.looseObject({ id, recommendationId: id })),
      commercials: z.looseObject({
        priceBookVersion: str,
        lines: z.array(
          z.looseObject({
            id,
            currency: str,
            recurrence: z.enum(["one_time", "monthly", "annual"]),
            quantity: z.number().finite().positive(),
            computed: z.looseObject({
              unitAmount: z.number().finite(),
              amount: z.number().finite(),
              basis: str,
              counted: z.boolean(),
            }),
          }),
        ),
        taxes: z.array(z.looseObject({ id, ratePercent: z.number().finite(), currency: str })),
        summary: z.looseObject({
          totals: z.array(z.looseObject({ currency: str, oneTime: z.number().finite() })),
        }),
      }),
    }),
    review: z
      .looseObject({
        decision: z.enum(["approved", "changes_requested"]),
        by: id,
        at: str,
        comment: str,
        acknowledged: ids,
      })
      .optional(),
    issue: z
      .looseObject({ issuedAt: str, issuedBy: id, effectiveAt: str, expiresAt: str })
      .optional(),
    supersededAt: optStr,
  }),
  proposalShares: z.looseObject({
    id,
    organizationId: str,
    proposalId: id,
    versionId: id,
    versionNumber: z.number().int().positive(),
    recipient: z.looseObject({
      name: str,
      email: z.string().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),
      organization: str,
    }),
    sharedAt: str,
    sharedBy: id,
    expiresAt: str,
    access: z.enum(["active", "revoked"]),
    response: z.enum(["pending", "viewed", "acknowledged", "accepted", "declined", "expired"]),
    responseNote: str,
    channelReference: str,
    simulated: z.literal(true),
  }),
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

const auth = z.looseObject({ approvedBy: id, approvedAt: str }).optional();
const amount = z.number().finite().nonnegative();
const PROPOSAL_CHILD = {
  sections: z.looseObject({
    key: str,
    title: str,
    body: str,
    origin: z.enum(["imported", "authored", "ai_draft"]),
    reviewed: z.boolean(),
  }),
  deliverables: z.looseObject({
    ...audited,
    recommendationId: id,
    description: str,
    inclusion: z.enum(["included", "optional", "excluded"]),
    acceptanceCriterion: str,
    responsibleParty: str,
    customerDependencies: str,
    deliveryAssumptions: str,
    qualification: str,
    sourceStatus: z.enum(["current", "missing"]),
  }),
  lines: z.looseObject({
    ...audited,
    category: str,
    classification: z.enum(["priced", "estimated", "tbd", "excluded"]),
    description: str,
    quantity: z.number().finite().positive(),
    recurrence: z.enum(["one_time", "monthly", "annual"]),
    currency: z.string().regex(/^[A-Z]{3}$/),
    priceRef: z
      .looseObject({
        priceBookItemId: id,
        priceBookVersion: str,
        currency: str,
        recurrence: str,
        publishedAmount: amount,
      })
      .optional(),
    estimate: z.looseObject({ unitAmount: amount, basis: str }).optional(),
    quoted: z.looseObject({ unitAmount: amount }).optional(),
    override: z.looseObject({ unitAmount: amount, rationale: str, authorization: auth }).optional(),
    discount: z.looseObject({ amount, rationale: str, authorization: auth }).optional(),
    quoteReference: str,
  }),
  taxes: z.looseObject({
    ...audited,
    label: str,
    ratePercent: z.number().finite().min(0).max(100),
    appliesTo: str,
    currency: str,
    source: str,
  }),
  partnerTerms: z.looseObject({
    ...audited,
    kind: str,
    description: str,
    status: z.enum(["proposed", "approved"]),
    authorization: auth,
  }),
  risks: z.looseObject({
    ...audited,
    category: str,
    description: str,
    severity: z.enum(["high", "medium", "low"]),
    resolution: z.enum(["open", "resolved", "accepted"]),
    qualification: str,
  }),
  milestones: z.looseObject({
    ...audited,
    title: str,
    deliverableIds: ids,
    paymentTrigger: str,
    commitment: z.literal("indicative"),
  }),
  options: z.looseObject({
    ...audited,
    kind: str,
    label: str,
    summary: str,
    deliverableIds: ids,
    lineIds: ids,
  }),
  comments: z.looseObject({ ...audited, kind: str, body: str }),
} as const;

/** Keeps valid child records of a nested workspace; broken ones are quarantined. */
function sanitizeChildren(
  table: string,
  i: number,
  row: Record<string, unknown>,
  schemas: Record<string, z.ZodType>,
  quarantined: QuarantineEntry[],
) {
  const out = { ...row };
  for (const [kind, schema] of Object.entries(schemas)) {
    const list = out[kind];
    if (list === undefined) {
      out[kind] = [];
      continue;
    }
    if (!Array.isArray(list)) {
      quarantined.push({
        table,
        path: `${table}[${i}].${kind}`,
        reason: "expected a list",
        value: list,
      });
      out[kind] = [];
      continue;
    }
    out[kind] = list.filter((item, j) => {
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
  return out;
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
    if (table.startsWith("fit")) {
      try {
        if (table === "fitQuestionnaires") {
          const problems = validateDefinition(QuestionnaireSchema.parse(row));
          if (problems.length) throw new Error(problems.join("; "));
        }
        if (table === "fitSessions" || table === "fitSnapshots") {
          const problems =
            table === "fitSnapshots"
              ? snapshotProblems(row as BusinessFitSubmissionSnapshot)
              : sessionProblems(row as BusinessFitSession);
          if (problems.length) throw new Error(problems.join("; "));
        }
      } catch (error) {
        quarantined.push({
          table,
          path: `${table}[${i}]`,
          reason: error instanceof Error ? error.message : "Invalid Business Fit record",
          value: row,
        });
        return;
      }
    }
    if (table === "proposalVersions") {
      // Immutable approval-bound documents: recompute amounts, totals and hash; never trust storage.
      const bad = versionIntegrityProblems(row as ProposalVersionRecord);
      if (bad.length) {
        quarantined.push({ table, path: `${table}[${i}]`, reason: bad.join("; "), value: row });
        return;
      }
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
    if (table === "proposalWorkspaces")
      return void out.push(
        sanitizeChildren(table, i, row as Record<string, unknown>, PROPOSAL_CHILD, quarantined),
      );
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

/** Versioned browser-safe contracts; declarative rules never execute caller code. */
import { z } from "zod";
import type { BaseRecord, ScopedRecord } from "./types";
export const FIT_SCHEMA = "aurumi.cia.business-fit-submission/2" as const;
export const FIT_HASH_CONTRACT = "business-fit-submission-hash/1" as const;
export const FIT_EVALUATION = "business-fit-effective-responses/2" as const;
export const FIT_LIMITATION =
  "This report is based on information you provided. It is preliminary guidance, not an independently verified assessment, technical integration commitment or commercial proposal.";
export const DIMENSIONS = [
  "Process digitization",
  "Information accessibility",
  "Systems interoperability",
  "Workflow and accountability",
  "Management visibility",
  "AI-assisted operations readiness",
] as const;
export const CATEGORIES = [
  "Process improvement",
  "Better use of existing software",
  "Integration opportunities",
  "Native application opportunities",
  "AI-assisted information access",
  "Professional assessment recommended",
  "Further information required",
] as const;
export const INDUSTRIES = [
  "Hospitality",
  "Retail",
  "Manufacturing",
  "Healthcare",
  "Professional services",
  "Real estate and property management",
  "Construction",
  "Distribution and wholesale",
  "Education",
  "Other",
  "Not sure",
];
export const BANDS = [
  "1–10",
  "11–25",
  "26–50",
  "51–100",
  "101–250",
  "251–500",
  "More than 500",
  "Not sure",
];
export const FUNCTIONS = [
  "Accounting and finance",
  "Sales and CRM",
  "Customer communication",
  "Employee management",
  "Attendance and leave",
  "Payroll",
  "Inventory and procurement",
  "Tasks and workflows",
  "Documents and knowledge",
  "Customer support",
  "Appointments and scheduling",
  "Industry-specific operations",
  "Reporting and analytics",
];
export const PRIORITIES = [
  "Reduce repetitive manual work",
  "Improve visibility into business operations",
  "Improve customer response times",
  "Improve sales follow-up",
  "Improve employee productivity",
  "Strengthen accountability",
  "Connect existing software",
  "Improve reporting",
  "Improve access to business knowledge",
  "Introduce AI-assisted business conversations",
  "Improve operational consistency across locations",
];
export const SOFTWARE = [
  "Tally",
  "QuickBooks",
  "Zoho Books",
  "Xero",
  "Sage",
  "Zoho CRM",
  "Salesforce",
  "eSSL",
  "Hotel PMS",
  "Hospital management system",
  "Custom ERP",
];
const text = z.string().max(4000),
  id = z.string().min(1).max(200);
const base = {
  id,
  organizationId: id,
  createdAt: z.iso.datetime(),
  createdBy: id,
  updatedAt: z.iso.datetime(),
  updatedBy: id,
};
export const ConditionSchema = z.strictObject({
  questionId: id,
  operator: z.enum(["equals", "includes", "answered"]),
  value: text.optional(),
});
export const QuestionSchema = z.strictObject({
  id,
  section: z.number().int().min(0).max(3),
  prompt: text.min(1),
  type: z.enum(["text", "single", "multi", "systems"]),
  options: z.array(text).max(100),
  required: z.boolean(),
  order: z.number().int().nonnegative(),
  maxSelections: z.number().int().positive().optional(),
  visibleWhen: ConditionSchema.optional(),
});
export type FitQuestion = z.infer<typeof QuestionSchema>;
export const QuestionnaireSchema = z.strictObject({
  ...base,
  questionnaireId: id,
  version: z.number().int().positive(),
  title: text.min(1),
  description: text,
  sections: z.array(text).length(4),
  questions: z.array(QuestionSchema).min(1).max(100),
  status: z.enum(["draft", "published", "retired"]),
});
export type BusinessFitQuestionnaireVersion = z.infer<typeof QuestionnaireSchema> & BaseRecord;
export type BusinessFitQuestionnaire = Pick<
  BusinessFitQuestionnaireVersion,
  "questionnaireId" | "title"
>;
export const PublicCapabilitySchema = z.strictObject({
  id,
  version: id,
  name: text,
  description: text,
  kind: z.enum(["native_app", "connector", "ai_capability"]),
  claim: z.enum(["available", "potential", "unsupported", "unknown"]),
  qualification: text,
  source: text,
  published: z.boolean().optional(),
  verifiedAt: text.optional(),
  actions: z.array(id).optional(),
  connector: z
    .strictObject({
      systemMatch: z.array(id),
      directions: z.array(z.enum(["inbound", "outbound", "bidirectional"])),
      operations: z.array(id),
    })
    .optional(),
});
export type PublicCapability = z.infer<typeof PublicCapabilitySchema>;
export const ApplicabilitySchema = z.strictObject({
  assurance: z.enum(["supported", "potential"]),
  system: id.optional(),
  direction: z.enum(["inbound", "outbound", "bidirectional"]).optional(),
  operations: z.array(id).min(1),
  responseQuestionId: id,
});
export const RuleSchema = z.strictObject({
  id,
  name: text.min(1),
  description: text,
  dimension: z.enum(DIMENSIONS),
  conditions: z.array(ConditionSchema).min(1).max(20),
  category: z.enum(CATEGORIES),
  recommendation: text.min(1),
  nextStep: text.min(1),
  priority: z.number().int().min(1).max(100),
  evidenceRequirements: z.array(id).min(1),
  industries: z.array(text),
  employeeBands: z.array(text),
  level: z.enum(["Foundational", "Developing", "Established", "Advanced"]).optional(),
  catalogId: id.optional(),
  applicability: ApplicabilitySchema.optional(),
});
export type FitRule = z.infer<typeof RuleSchema>;
export const RuleSetSchema = z.strictObject({
  ...base,
  ruleSetId: id,
  version: z.number().int().positive(),
  questionnaireVersionId: id,
  name: text.min(1),
  rules: z.array(RuleSchema).min(1).max(200),
  status: z.enum(["draft", "published", "retired"]),
});
export type BusinessFitRuleSetVersion = z.infer<typeof RuleSetSchema> & BaseRecord;
export type BusinessFitRuleSet = Pick<BusinessFitRuleSetVersion, "ruleSetId" | "name">;
export const SystemSchema = z.strictObject({
  function: z.enum(FUNCTIONS as [string, ...string[]]),
  kind: z.enum(["commercial", "aurumi", "custom", "spreadsheet", "manual", "none", "unknown"]),
  name: text,
});
export type FitSystem = z.infer<typeof SystemSchema>;
export const ResponsesSchema = z.record(
  id,
  z.union([text, z.array(text).max(100), z.array(SystemSchema).max(100)]),
);
export type BusinessFitResponse = z.infer<typeof ResponsesSchema>;
export const ProfileSchema = z.strictObject({
  dimension: z.enum(DIMENSIONS),
  level: z.enum([
    "Foundational",
    "Developing",
    "Established",
    "Advanced",
    "Insufficient information",
  ]),
  sufficiency: z.enum(["limited", "sufficient", "insufficient"]),
  explanation: text,
  responseRefs: z.array(id),
  ruleRefs: z.array(id),
  gaps: z.array(text),
  opportunities: z.array(text),
});
export type BusinessFitEvaluation = z.infer<typeof ProfileSchema>;
export const OpportunitySchema = z.strictObject({
  id,
  category: z.enum(CATEGORIES),
  title: text,
  why: text,
  nextStep: text,
  priority: z.number().int(),
  responseRefs: z.array(id),
  ruleRefs: z.array(id),
  validationRequired: z.boolean(),
  capability: PublicCapabilitySchema.optional(),
});
export const ReportSchema = z.strictObject({
  ...base,
  schema: z.literal("aurumi.cia.business-fit-report/1"),
  questionnaireVersionId: id,
  ruleSetVersionId: id,
  responses: ResponsesSchema,
  dimensions: z.array(ProfileSchema).length(6),
  opportunities: z.array(OpportunitySchema),
  catalog: z.array(PublicCapabilitySchema),
  limitation: z.literal(FIT_LIMITATION),
});
export type BusinessFitReport = z.infer<typeof ReportSchema> & BaseRecord;
export const SessionSchema = z.strictObject({
  ...base,
  token: z.string().min(32),
  questionnaire: QuestionnaireSchema,
  rules: RuleSetSchema,
  catalog: z.array(PublicCapabilitySchema),
  responses: ResponsesSchema,
  step: z.number().int().min(0).max(4),
  report: ReportSchema.optional(),
  consultationId: id.optional(),
  evaluationContract: z.literal(FIT_EVALUATION).optional(),
});
export type BusinessFitSession = z.infer<typeof SessionSchema> & BaseRecord;
export const SnapshotSchema = z.strictObject({
  ...base,
  schema: z.enum(["aurumi.cia.business-fit-submission/1", FIT_SCHEMA]),
  submissionId: id,
  questionnaire: QuestionnaireSchema,
  rules: RuleSetSchema,
  report: ReportSchema,
  responses: ResponsesSchema,
  systems: z.array(SystemSchema),
  provenance: z.literal("self-reported-unverified"),
  integrityContract: id.optional(),
  integrityValue: id.optional(),
  effectiveResponses: ResponsesSchema.optional(),
  businessContext: ResponsesSchema.optional(),
  operationId: id.optional(),
  sessionId: id.optional(),
});
export type BusinessFitSubmissionSnapshot = z.infer<typeof SnapshotSchema> & BaseRecord;
export const ContactSchema = z
  .strictObject({
    name: text.trim().min(1),
    businessName: text,
    email: z.email().max(200),
    phone: text,
    country: text.trim().min(1),
    preferredContact: z.enum(["email", "phone"]),
    comments: text,
    contactConsent: z.literal(true),
    marketingConsent: z.boolean(),
  })
  .refine(
    (v) => v.preferredContact !== "phone" || v.phone.trim().length > 0,
    "A phone number is required for phone contact",
  );
export type FitContact = z.infer<typeof ContactSchema>;
export const ConsultationSchema = z.strictObject({
  ...base,
  snapshotId: id,
  reference: id,
  contact: ContactSchema,
  consentAt: z.iso.datetime(),
  leadReference: id,
  integrationStatus: z.literal("simulated"),
  operationId: id.optional(),
});
export type BusinessFitConsultationRequest = z.infer<typeof ConsultationSchema> & BaseRecord;
export const INTAKE_STATUSES = [
  "new",
  "under_review",
  "qualified",
  "assessment_created",
  "closed",
  "withdrawn",
] as const;
const scoped = { ...base, ownerId: id, teamId: id, assignedUserIds: z.array(id) };
export const IntakeSchema = z.strictObject({
  ...scoped,
  snapshotId: id,
  consultationId: id,
  reference: id,
  status: z.enum(INTAKE_STATUSES),
  notes: z.array(z.strictObject({ id, body: text.min(1), by: id, at: z.iso.datetime() })),
  assessmentId: id.optional(),
  operationId: id.optional(),
  revision: z.number().int().nonnegative().optional(),
  historicalReview: z
    .strictObject({ snapshotId: id, contentValue: id, by: id, at: z.iso.datetime() })
    .optional(),
});
export type BusinessFitIntakeRecord = z.infer<typeof IntakeSchema> & ScopedRecord;
export const ConversionSchema = z.strictObject({
  ...base,
  intakeId: id,
  snapshotId: id,
  assessmentId: id.optional(),
  type: z.enum(["tenant", "partner"]),
  state: z.enum(["pending", "importing", "complete"]),
  imported: z.number().int().nonnegative(),
  operationId: id.optional(),
  sourceValue: id.optional(),
  actorId: id.optional(),
  binding: text.optional(),
});
export type BusinessFitAssessmentConversion = z.infer<typeof ConversionSchema> & BaseRecord;
export const FitOperationSchema = z.strictObject({
  ...base,
  kind: z.literal("consultation"),
  sessionId: id,
  sourceValue: id,
  snapshotId: id,
  consultationId: id,
  submissionId: id,
  intakeId: id,
  reference: id,
  contact: ContactSchema,
  state: z.enum(["pending", "lead_created", "complete"]),
  leadReference: id.optional(),
});
export type BusinessFitOperation = z.infer<typeof FitOperationSchema> & BaseRecord;
export type SessionHandle = { id: string; token: string };
export function conditionMatches(
  c: z.infer<typeof ConditionSchema>,
  responses: BusinessFitResponse,
) {
  const value = responses[c.questionId];
  if (value === undefined || value === "" || value === "Not sure") return false;
  if (c.operator === "answered") return Array.isArray(value) ? value.length > 0 : true;
  return c.operator === "equals"
    ? value === c.value
    : Array.isArray(value) && value.some((v) => typeof v === "string" && v === c.value);
}
/** Visibility is resolved recursively from valid effective parent answers, never stale raw answers. */
export function effectiveResponses(
  q: BusinessFitQuestionnaireVersion,
  input: unknown,
): BusinessFitResponse {
  const raw = validateResponses(q, input);
  const out: BusinessFitResponse = {};
  const done = new Set<string>(),
    visiting = new Set<string>();
  const visit = (question: FitQuestion): boolean => {
    if (done.has(question.id)) return Object.hasOwn(out, question.id);
    if (visiting.has(question.id)) throw new Error("Circular visibility dependencies");
    visiting.add(question.id);
    let visible = true;
    if (question.visibleWhen) {
      const parent = q.questions.find((p) => p.id === question.visibleWhen?.questionId);
      visible = !!parent && visit(parent) && conditionMatches(question.visibleWhen, out);
    }
    visiting.delete(question.id);
    done.add(question.id);
    const answer = raw[question.id];
    if (visible && answer !== undefined) out[question.id] = answer;
    return visible;
  };
  q.questions.forEach(visit);
  return out;
}
export function visibleQuestions(
  q: BusinessFitQuestionnaireVersion,
  responses: BusinessFitResponse,
  step?: number,
) {
  const effective = effectiveResponses(q, responses);
  return q.questions
    .filter(
      (x) =>
        (step === undefined || x.section === step) &&
        (!x.visibleWhen || conditionMatches(x.visibleWhen, effective)),
    )
    .sort((a, b) => a.order - b.order);
}
export function applicabilityProblems(
  r: FitRule,
  q: BusinessFitQuestionnaireVersion,
  catalog: PublicCapability[],
): string[] {
  const errors: string[] = [];
  if (!r.catalogId) return r.applicability ? ["Applicability requires a catalog item"] : [];
  const c = catalog.find((c) => c.id === r.catalogId);
  if (!c) return [`Restricted or unknown catalog reference: ${r.catalogId}`];
  const expected =
    r.category === "Integration opportunities"
      ? "connector"
      : r.category === "Native application opportunities"
        ? "native_app"
        : r.category === "AI-assisted information access"
          ? "ai_capability"
          : undefined;
  if ((expected && c.kind !== expected) || (r.applicability && !expected))
    errors.push("Catalog kind does not match recommendation category");
  const a = r.applicability;
  // A connector label alone must never promote arbitrary prose into technical availability.
  if (c.kind === "connector" && !a)
    errors.push("Connector claims require structured applicability");
  if (!a) return errors;
  const question = q.questions.find((x) => x.id === a.responseQuestionId);
  if (!question || !r.evidenceRequirements.includes(a.responseQuestionId))
    errors.push("Applicability requires supporting response evidence");
  if (a.assurance === "supported") {
    if (!c.published || c.claim !== "available" || !c.verifiedAt)
      errors.push("Capability is not published and available");
    if (c.kind === "connector") {
      if (question?.type !== "systems")
        errors.push("Connector applicability requires identified systems");
      if (!a.system || !c.connector?.systemMatch.includes(a.system.toLowerCase()))
        errors.push("Unsupported external product");
      if (!a.direction || !c.connector?.directions.includes(a.direction))
        errors.push("Unsupported integration direction");
      if (!a.operations.every((op) => c.connector?.operations.includes(op)))
        errors.push("Unsupported integration operation");
    } else if (!a.operations.every((op) => c.actions?.includes(op)))
      errors.push("Unsupported capability operation");
  }
  return errors;
}
export function validateDefinition(
  q: BusinessFitQuestionnaireVersion,
  rules?: BusinessFitRuleSetVersion,
  catalog: PublicCapability[] = [],
) {
  const errors: string[] = [];
  if (!QuestionnaireSchema.safeParse(q).success) errors.push("Invalid questionnaire structure");
  if (new Set(q.questions.map((x) => x.id)).size !== q.questions.length)
    errors.push("Question IDs must be unique");
  const check = (c: z.infer<typeof ConditionSchema>) => {
    const question = q.questions.find((x) => x.id === c.questionId);
    if (!question) errors.push(`Unknown question: ${c.questionId}`);
    else if (c.operator === "answered") {
      if (c.value !== undefined && c.value !== "")
        errors.push("Answered conditions cannot specify a value");
    } else {
      if (!c.value || !question.options.includes(c.value) || c.value === "Not sure")
        errors.push(`Unsupported answer for ${c.questionId}`);
      if (c.operator === "includes" && question.type !== "multi")
        errors.push(`Includes requires multiple selection: ${c.questionId}`);
      if (c.operator === "equals" && question.type !== "single")
        errors.push(`Equals requires single selection: ${c.questionId}`);
    }
  };
  q.questions.forEach((x) => {
    if (!x.id.trim()) errors.push("Question identifier is required");
    if (["single", "multi"].includes(x.type)) {
      if (!x.options.length || x.options.some((v) => !v.trim()))
        errors.push(`Choice question requires valid options: ${x.id}`);
      if (new Set(x.options).size !== x.options.length)
        errors.push(`Duplicate option identifiers: ${x.id}`);
    } else if (x.options.length || x.maxSelections !== undefined)
      errors.push(`Invalid answer-type configuration: ${x.id}`);
    if (x.maxSelections !== undefined && (x.type !== "multi" || x.maxSelections > x.options.length))
      errors.push(`Impossible selection constraints: ${x.id}`);
    if (x.visibleWhen) {
      check(x.visibleWhen);
      const parent = q.questions.find((p) => p.id === x.visibleWhen?.questionId);
      if (parent && (parent.order >= x.order || parent.section > x.section))
        errors.push("Visibility must reference an earlier question");
      const visited = new Set([x.id]);
      let dependency = parent;
      while (dependency) {
        if (visited.has(dependency.id)) {
          errors.push("Circular visibility dependencies");
          break;
        }
        visited.add(dependency.id);
        dependency = q.questions.find((p) => p.id === dependency?.visibleWhen?.questionId);
      }
    }
  });
  if (rules) {
    if (!RuleSetSchema.safeParse(rules).success) errors.push("Invalid rule structure");
    if (rules.questionnaireVersionId !== q.id)
      errors.push("Rule set must reference this questionnaire version");
    if (new Set(rules.rules.map((x) => x.id)).size !== rules.rules.length)
      errors.push("Rule IDs must be unique");
    rules.rules.forEach((r) => {
      r.conditions.forEach(check);
      r.evidenceRequirements.forEach((ref) => {
        if (!q.questions.some((x) => x.id === ref))
          errors.push(`Unknown evidence question: ${ref}`);
      });
      if (
        r.industries.some((v) => !q.questions.find((x) => x.id === "industry")?.options.includes(v))
      )
        errors.push("Unsupported industry filter");
      if (
        r.employeeBands.some(
          (v) => !q.questions.find((x) => x.id === "employeeBand")?.options.includes(v),
        )
      )
        errors.push("Unsupported employee band filter");
      errors.push(...applicabilityProblems(r, q, catalog));
    });
  }
  return [...new Set(errors)];
}
export function validateResponses(
  q: BusinessFitQuestionnaireVersion,
  input: unknown,
  step?: number,
): BusinessFitResponse {
  const responses = ResponsesSchema.parse(input);
  for (const [key, value] of Object.entries(responses)) {
    const question = q.questions.find((x) => x.id === key);
    if (!question) throw new Error(`Unknown question: ${key}`);
    if (question.type === "systems") {
      if (!Array.isArray(value)) throw new Error("Systems must be a list");
      z.array(SystemSchema).parse(value);
    } else if (question.type === "multi") {
      if (
        !Array.isArray(value) ||
        !value.every((v) => typeof v === "string" && question.options.includes(v))
      )
        throw new Error(`Invalid choices: ${key}`);
      if (
        new Set<unknown>(value).size !== value.length ||
        value.length > (question.maxSelections ?? 100)
      )
        throw new Error(`Choose at most ${question.maxSelections ?? 100}: ${question.prompt}`);
    } else if (
      typeof value !== "string" ||
      (question.type === "single" && value !== "" && !question.options.includes(value))
    )
      throw new Error(`Invalid answer: ${key}`);
  }
  if (step !== undefined)
    for (const x of visibleQuestions(q, responses, step)) {
      const value = responses[x.id];
      if (x.required && (!value || (Array.isArray(value) && value.length === 0)))
        throw new Error(`Please answer: ${x.prompt}`);
    }
  return responses;
}
export function identifiedSystems(responses: BusinessFitResponse): FitSystem[] {
  return z.array(SystemSchema).parse(responses["systems"] ?? []);
}
export function answerText(value: BusinessFitResponse[string] | undefined): string {
  if (value === undefined || value === "") return "Not supplied";
  return typeof value === "string"
    ? value
    : value
        .map((v) => (typeof v === "string" ? v : `${v.function}: ${v.name || v.kind}`))
        .join(", ");
}
export function evaluate(
  rawResponses: BusinessFitResponse,
  q: BusinessFitQuestionnaireVersion,
  rules: BusinessFitRuleSetVersion,
  catalog: PublicCapability[],
  record: BaseRecord,
): BusinessFitReport {
  const responses = effectiveResponses(q, rawResponses);
  const problems = validateDefinition(q, rules, catalog);
  if (problems.length) throw new Error(problems.join("; "));
  const relevant = rules.rules.filter(
    (r) =>
      (!r.industries.length || r.industries.includes(answerText(responses["industry"]))) &&
      (!r.employeeBands.length ||
        r.employeeBands.includes(answerText(responses["employeeBand"]))) &&
      r.conditions.every((c) => conditionMatches(c, responses)) &&
      r.evidenceRequirements.every((ref) =>
        conditionMatches({ questionId: ref, operator: "answered" }, responses),
      ),
  );
  const opportunities = relevant
    .map((r) => {
      const item = r.catalogId ? catalog.find((c) => c.id === r.catalogId) : undefined;
      const a = r.applicability;
      const systemRelevant =
        !a?.system ||
        identifiedSystems(responses).some(
          (s) => s.name.trim().toLowerCase() === a.system?.toLowerCase(),
        );
      const supported =
        !!a &&
        a.assurance === "supported" &&
        systemRelevant &&
        conditionMatches({ questionId: a.responseQuestionId, operator: "answered" }, responses) &&
        !applicabilityProblems(r, q, catalog).length;
      const capability = item
        ? {
            ...item,
            claim: supported
              ? ("available" as const)
              : item.claim === "unsupported"
                ? ("unsupported" as const)
                : ("potential" as const),
          }
        : undefined;
      const technicalTitle =
        supported && item
          ? `${item.name}: ${a?.operations.join(", ")}${a?.system ? ` for ${a.system} (${a.direction})` : ""} — catalog supported; installation validation required`
          : r.recommendation;
      return {
        id: r.id,
        category: r.category,
        title: technicalTitle,
        why: supported
          ? "The reported information matches the published demonstration catalog scope. This is not installation verification."
          : r.description,
        nextStep: supported
          ? "Validate the installation, interfaces, access and configuration before any technical commitment."
          : r.nextStep,
        priority: r.priority,
        responseRefs: [
          ...new Set([...r.conditions.map((c) => c.questionId), ...r.evidenceRequirements]),
        ],
        ruleRefs: [r.id],
        validationRequired:
          r.category !== "Process improvement" && r.category !== "Better use of existing software",
        ...(capability ? { capability } : {}),
      };
    })
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const dimensions = DIMENSIONS.map((d) => {
    const matched = relevant.filter((r) => r.dimension === d),
      rated = matched.filter((r) => r.level !== undefined),
      expected = [
        ...new Set(
          rules.rules.filter((r) => r.dimension === d).flatMap((r) => r.evidenceRequirements),
        ),
      ].filter((ref) => visibleQuestions(q, responses).some((question) => question.id === ref)),
      known = expected.filter((ref) =>
        conditionMatches({ questionId: ref, operator: "answered" }, responses),
      );
    const levels = ["Foundational", "Developing", "Established", "Advanced"] as const;
    const weakest = rated.reduce<number>(
      (n, r) => Math.min(n, levels.indexOf(r.level ?? "Advanced")),
      3,
    );
    return {
      dimension: d,
      level: rated.length
        ? (levels[weakest] ?? "Insufficient information")
        : "Insufficient information",
      sufficiency: rated.length
        ? known.length === expected.length
          ? "sufficient"
          : "limited"
        : "insufficient",
      explanation: rated.length
        ? rated.map((r) => opportunities.find((o) => o.id === r.id)?.why ?? r.description).join(" ")
        : "More information is needed; unanswered or uncertain responses are not evidence of low maturity.",
      responseRefs: [...new Set(matched.flatMap((r) => r.evidenceRequirements))],
      ruleRefs: matched.map((r) => r.id),
      gaps: expected
        .filter((ref) => !known.includes(ref))
        .map((ref) => q.questions.find((x) => x.id === ref)?.prompt ?? ref),
      opportunities: matched.map(
        (r) => opportunities.find((o) => o.id === r.id)?.title ?? r.recommendation,
      ),
    };
  });
  return ReportSchema.parse({
    ...record,
    schema: "aurumi.cia.business-fit-report/1",
    questionnaireVersionId: q.id,
    ruleSetVersionId: rules.id,
    responses,
    dimensions,
    opportunities,
    catalog,
    limitation: FIT_LIMITATION,
  });
}

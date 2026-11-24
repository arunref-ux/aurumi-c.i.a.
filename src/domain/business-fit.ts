/** Versioned browser-safe contracts; declarative rules never execute caller code. */
import { z } from "zod";
import type { BaseRecord, ScopedRecord } from "./types";
export const FIT_SCHEMA = "aurumi.cia.business-fit-submission/1" as const;
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
});
export type PublicCapability = z.infer<typeof PublicCapabilitySchema>;
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
});
export type BusinessFitSession = z.infer<typeof SessionSchema> & BaseRecord;
export const SnapshotSchema = z.strictObject({
  ...base,
  schema: z.literal(FIT_SCHEMA),
  submissionId: id,
  questionnaire: QuestionnaireSchema,
  rules: RuleSetSchema,
  report: ReportSchema,
  responses: ResponsesSchema,
  systems: z.array(SystemSchema),
  provenance: z.literal("self-reported-unverified"),
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
});
export type BusinessFitAssessmentConversion = z.infer<typeof ConversionSchema> & BaseRecord;
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
export function visibleQuestions(
  q: BusinessFitQuestionnaireVersion,
  responses: BusinessFitResponse,
  step?: number,
) {
  return q.questions
    .filter(
      (x) =>
        (step === undefined || x.section === step) &&
        (!x.visibleWhen || conditionMatches(x.visibleWhen, responses)),
    )
    .sort((a, b) => a.order - b.order);
}
export function validateDefinition(
  q: BusinessFitQuestionnaireVersion,
  rules?: BusinessFitRuleSetVersion,
  catalog: PublicCapability[] = [],
) {
  const errors: string[] = [];
  if (new Set(q.questions.map((x) => x.id)).size !== q.questions.length)
    errors.push("Question IDs must be unique");
  const check = (c: z.infer<typeof ConditionSchema>) => {
    const question = q.questions.find((x) => x.id === c.questionId);
    if (!question) errors.push(`Unknown question: ${c.questionId}`);
    else if (c.operator !== "answered" && (!c.value || !question.options.includes(c.value)))
      errors.push(`Unsupported answer for ${c.questionId}`);
    else if (c.operator === "includes" && question.type !== "multi")
      errors.push(`Includes requires multiple selection: ${c.questionId}`);
  };
  q.questions.forEach((x) => {
    if (x.visibleWhen) {
      check(x.visibleWhen);
      const parent = q.questions.find((p) => p.id === x.visibleWhen?.questionId);
      if (parent && parent.order >= x.order)
        errors.push("Visibility must reference an earlier question");
    }
  });
  if (rules) {
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
      if (r.catalogId && !catalog.some((c) => c.id === r.catalogId))
        errors.push(`Restricted or unknown catalog reference: ${r.catalogId}`);
    });
  }
  return errors;
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
  responses: BusinessFitResponse,
  q: BusinessFitQuestionnaireVersion,
  rules: BusinessFitRuleSetVersion,
  catalog: PublicCapability[],
  record: BaseRecord,
): BusinessFitReport {
  validateResponses(q, responses);
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
      const capability = r.catalogId ? catalog.find((c) => c.id === r.catalogId) : undefined;
      return {
        id: r.id,
        category: r.category,
        title: r.recommendation,
        why: r.description,
        nextStep: r.nextStep,
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
      ],
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
        ? rated.map((r) => r.description).join(" ")
        : "More information is needed; unanswered or uncertain responses are not evidence of low maturity.",
      responseRefs: [...new Set(matched.flatMap((r) => r.evidenceRequirements))],
      ruleRefs: matched.map((r) => r.id),
      gaps: expected
        .filter((ref) => !known.includes(ref))
        .map((ref) => q.questions.find((x) => x.id === ref)?.prompt ?? ref),
      opportunities: matched.map((r) => r.recommendation),
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

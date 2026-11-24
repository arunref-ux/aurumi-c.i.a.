/** Frozen /1 interpretation from ebe4033; never used to generate new submissions. */
import { z } from "zod";
import type { BaseRecord } from "./types";
import {
  ConditionSchema,
  ResponsesSchema,
  SystemSchema,
  ReportSchema,
  DIMENSIONS,
  FIT_LIMITATION,
  type BusinessFitQuestionnaireVersion,
  type BusinessFitRuleSetVersion,
  type PublicCapability,
  type BusinessFitResponse,
  type BusinessFitReport,
  type FitSystem,
} from "./business-fit";
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
export function evaluateHistorical(
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

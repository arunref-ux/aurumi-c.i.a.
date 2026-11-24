/** Browser-local consistency, not cryptographic authentication of customer data. */
import { canonical } from "./assessment";
import {
  evaluateHistorical,
  validateDefinition as validateHistoricalDefinition,
} from "./business-fit-historical";
import {
  FIT_SCHEMA,
  FIT_HASH_CONTRACT,
  FIT_EVALUATION,
  SnapshotSchema,
  effectiveResponses,
  evaluate,
  identifiedSystems,
  validateDefinition,
  validateResponses,
  type BusinessFitSubmissionSnapshot,
  type BusinessFitSession,
  type BusinessFitIntakeRecord,
  type BusinessFitAssessmentConversion,
} from "./business-fit";
import type { Tables } from "@/data/store";
export function fitContentValue(value: unknown): string {
  const s = canonical(value);
  let a = 2166136261,
    b = 2246822519;
  for (let i = 0; i < s.length; i++) {
    a = Math.imul(a ^ s.charCodeAt(i), 16777619);
    b = Math.imul(b ^ s.charCodeAt(i), 3266489917);
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}
/** Every snapshot field except integrityValue is canonicalized; mutable intake/contact never participates. */
export function snapshotValue(snapshot: BusinessFitSubmissionSnapshot): string {
  const { integrityValue: _value, ...immutable } = snapshot;
  return fitContentValue(immutable);
}
export function sessionValue(s: BusinessFitSession): string {
  return fitContentValue({
    id: s.id,
    questionnaire: s.questionnaire,
    rules: s.rules,
    catalog: s.catalog,
    responses: s.responses,
    report: s.report,
  });
}
export function snapshotAssurance(
  s: BusinessFitSubmissionSnapshot,
): "current-consistency" | "historical-consistency" {
  return s.schema === FIT_SCHEMA ? "current-consistency" : "historical-consistency";
}
export function snapshotProblems(s: BusinessFitSubmissionSnapshot): string[] {
  try {
    SnapshotSchema.parse(s);
    const current = s.schema === FIT_SCHEMA;
    if (current) {
      if (
        s.integrityContract !== FIT_HASH_CONTRACT ||
        !s.integrityValue ||
        !s.operationId ||
        !s.sessionId ||
        !s.effectiveResponses ||
        !s.businessContext
      )
        throw Error("Missing or unsupported current integrity contract");
      if (s.integrityValue !== snapshotValue(s))
        throw Error("Immutable snapshot integrity mismatch");
    } else if (Object.hasOwn(s, "integrityContract") || Object.hasOwn(s, "integrityValue"))
      throw Error("Unsupported historical integrity marker");
    const errors = (current ? validateDefinition : validateHistoricalDefinition)(
      s.questionnaire,
      s.rules,
      s.report.catalog,
    );
    if (errors.length) throw Error(errors.join("; "));
    validateResponses(s.questionnaire, s.responses);
    if (
      s.report.questionnaireVersionId !== s.questionnaire.id ||
      s.report.ruleSetVersionId !== s.rules.id
    )
      throw Error("Embedded definition identity mismatch");
    const responses = current ? effectiveResponses(s.questionnaire, s.responses) : s.responses;
    if (
      current &&
      (canonical(responses) !== canonical(s.effectiveResponses) ||
        canonical(responses) !== canonical(s.businessContext))
    )
      throw Error("Effective responses disagree");
    if (canonical(identifiedSystems(responses)) !== canonical(s.systems))
      throw Error("Snapshot systems disagree with responses");
    const report = (current ? evaluate : evaluateHistorical)(
      s.responses,
      s.questionnaire,
      s.rules,
      s.report.catalog,
      s.report,
    );
    if (canonical(report) !== canonical(s.report))
      throw Error("Report does not match pinned responses and rules");
    return [];
  } catch (e) {
    return [e instanceof Error ? e.message : "Invalid snapshot"];
  }
}
export function sessionProblems(s: BusinessFitSession): string[] {
  try {
    const errors = (
      s.evaluationContract === FIT_EVALUATION ? validateDefinition : validateHistoricalDefinition
    )(s.questionnaire, s.rules, s.catalog);
    if (errors.length) throw Error(errors.join("; "));
    validateResponses(s.questionnaire, s.responses);
    if (s.report) {
      const report = (s.evaluationContract === FIT_EVALUATION ? evaluate : evaluateHistorical)(
        s.responses,
        s.questionnaire,
        s.rules,
        s.catalog,
        s.report,
      );
      if (canonical(report) !== canonical(s.report))
        throw Error("Report does not match pinned responses and rules");
    }
    return [];
  } catch (e) {
    return [e instanceof Error ? e.message : "Invalid session"];
  }
}
export function intakeRelationshipProblems(row: BusinessFitIntakeRecord, tables: Tables): string[] {
  const snapshot = tables.fitSnapshots.find((s) => s.id === row.snapshotId),
    contact = tables.fitConsultations.find((c) => c.id === row.consultationId);
  if (
    !snapshot ||
    !contact ||
    snapshot.organizationId !== row.organizationId ||
    contact.organizationId !== row.organizationId ||
    contact.snapshotId !== snapshot.id ||
    contact.reference !== row.reference
  )
    return ["Submission relationships need recovery"];
  const errors = snapshotProblems(snapshot);
  if (snapshot.schema === FIT_SCHEMA) {
    const op = tables.fitOperations.find((o) => o.id === snapshot.operationId);
    if (
      !op ||
      op.state !== "complete" ||
      op.organizationId !== row.organizationId ||
      op.snapshotId !== snapshot.id ||
      op.submissionId !== snapshot.submissionId ||
      op.consultationId !== contact.id ||
      op.intakeId !== row.id ||
      row.operationId !== op.id ||
      contact.operationId !== op.id ||
      op.sessionId !== snapshot.sessionId ||
      op.reference !== row.reference ||
      op.sourceValue !==
        fitContentValue({
          id: snapshot.sessionId,
          questionnaire: snapshot.questionnaire,
          rules: snapshot.rules,
          catalog: snapshot.report.catalog,
          responses: snapshot.responses,
          report: snapshot.report,
        }) ||
      op.leadReference !== contact.leadReference ||
      canonical(op.contact) !== canonical(contact.contact) ||
      contact.consentAt !== op.createdAt
    )
      errors.push("Consent or operation relationships need recovery");
  }
  return errors;
}
export function conversionRelationshipProblems(
  c: BusinessFitAssessmentConversion,
  tables: Tables,
): string[] {
  const row = tables.fitIntakes.find((r) => r.id === c.intakeId),
    s = tables.fitSnapshots.find((s) => s.id === c.snapshotId);
  if (
    !row ||
    !s ||
    row.snapshotId !== c.snapshotId ||
    row.organizationId !== c.organizationId ||
    s.organizationId !== c.organizationId
  )
    return ["Conversion source needs recovery"];
  if (!c.assessmentId)
    return c.state === "complete" ? ["Completed conversion has no assessment"] : [];
  if (s.schema === FIT_SCHEMA && !c.operationId)
    return ["Current conversion provenance needs recovery"];
  const a = tables.assessments.find((a) => a.id === c.assessmentId),
    ws = tables.workspaces.find((w) => w.assessmentId === c.assessmentId);
  if (!a || !ws || a.organizationId !== c.organizationId || a.type !== c.type)
    return ["Conversion assessment needs recovery"];
  if (c.operationId) {
    if (
      c.id !== c.operationId ||
      c.sourceValue !== snapshotValue(s) ||
      a.crmReferenceId !== `BF:${c.operationId}:${c.sourceValue}`
    )
      return ["Conversion provenance needs recovery"];
  } else if (!ws.overview.scope.includes(s.id) || !ws.overview.scope.includes(row.reference))
    return ["Historical conversion provenance needs recovery"];
  if (c.state === "complete" && (row.assessmentId !== a.id || row.status !== "assessment_created"))
    return ["Completed conversion relationships need recovery"];
  return [];
}

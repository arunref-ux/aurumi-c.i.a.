/** Post-structural relationship validation, confined to Business Fit. Never edits immutable histories. */
import type { Tables } from "./store";
import type { QuarantineEntry } from "./persisted-schema";
import {
  conversionRelationshipProblems,
  intakeRelationshipProblems,
} from "@/domain/business-fit-integrity";
import { validateDefinition, FIT_SCHEMA } from "@/domain/business-fit";
import { publicFitCatalog } from "@/integrations/adapters/business-fit";
export function sanitizeFitRelationships(
  t: Tables,
  supplied: Record<string, unknown>,
): QuarantineEntry[] {
  const out: QuarantineEntry[] = [];
  const remove = <
    K extends "fitRules" | "fitIntakes" | "fitConversions" | "fitConsultations" | "fitOperations",
  >(
    key: K,
    problems: (row: Tables[K][number]) => string[],
  ) => {
    t[key] = t[key].filter((row, i) => {
      const errors = problems(row);
      if (errors.length)
        out.push({ table: key, path: `${key}[${i}]`, reason: errors.join("; "), value: row });
      return !errors.length;
    }) as Tables[K];
  };
  remove("fitRules", (r) => {
    const q = t.fitQuestionnaires.find((q) => q.id === r.questionnaireVersionId);
    return q ? validateDefinition(q, r, publicFitCatalog()) : ["Unknown questionnaire version"];
  });
  remove("fitConsultations", (c) => {
    const s = t.fitSnapshots.find((s) => s.id === c.snapshotId);
    if (!s || s.organizationId !== c.organizationId)
      return ["Consultation snapshot relationships need recovery"];
    if (s.schema === FIT_SCHEMA) {
      const op = t.fitOperations.find((o) => o.id === s.operationId);
      if (
        !op ||
        op.consultationId !== c.id ||
        c.operationId !== op.id ||
        op.leadReference !== c.leadReference
      )
        return ["Consultation operation relationships need recovery"];
    }
    return [];
  });
  remove("fitIntakes", (r) => intakeRelationshipProblems(r, t));
  remove("fitConversions", (c) => conversionRelationshipProblems(c, t));
  // A claimed completed intake is unusable without the validated conversion; independent assessments survive.
  remove("fitIntakes", (r) =>
    r.assessmentId &&
    !t.fitConversions.some(
      (c) => c.intakeId === r.id && c.assessmentId === r.assessmentId && c.state === "complete",
    )
      ? ["Completed intake has no valid conversion"]
      : [],
  );
  remove("fitOperations", (op) => {
    if (
      op.state === "complete" &&
      (!t.fitIntakes.some((r) => r.id === op.intakeId) ||
        !t.fitConsultations.some((c) => c.id === op.consultationId))
    )
      return ["Completed operation relationships need recovery"];
    // Pending intents survive without final records so reload/retry can resume safely.
    if (
      op.state !== "complete" &&
      supplied["fitSessions"] !== undefined &&
      !t.fitSessions.some((s) => s.id === op.sessionId)
    )
      return ["Pending operation session unavailable"];
    return [];
  });
  return out;
}

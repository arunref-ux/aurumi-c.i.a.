/** Strengthened Phase 6 evidence. This module never changes the released /1 algorithm. */
import { z } from "zod";
import { canonical } from "./assessment";

export const STRONG_CONTRACT = "aurumi.cia.delivery-content/2" as const;
export const id = z.string().trim().min(1);
export function timestampInstant(value: string): number {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!m) throw Error("Invalid observation timestamp");
  const [, year, month, day, hour, minute, second, , offset] = m;
  const date = `${year}-${month}-${day}`;
  const midnight = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(midnight.getTime()) ||
    midnight.toISOString().slice(0, 10) !== date ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  )
    throw Error("Invalid calendar date or time");
  if (offset !== "Z") {
    const h = Number(offset?.slice(1, 3)),
      n = Number(offset?.slice(4, 6));
    if (h > 14 || n > 59 || (h === 14 && n !== 0)) throw Error("Invalid time-zone offset");
  }
  const at = Date.parse(value);
  if (!Number.isFinite(at)) throw Error("Invalid observation timestamp");
  return at;
}
export const strictInstant = z.string().refine((v) => {
  try {
    timestampInstant(v);
    return true;
  } catch {
    return false;
  }
}, "Invalid timestamp");
export const EvidenceApprovalSchema = z.strictObject({
  by: id,
  at: strictInstant,
  evidence: id,
  comment: id,
  simulated: z.boolean(),
});
export const strongFields = { integrityContract: z.literal(STRONG_CONTRACT), integrityValue: id };
export function evidenceValue(value: unknown): string {
  const s = canonical(value);
  let a = 2166136261,
    b = 2246822519;
  for (let i = 0; i < s.length; i++) {
    a = Math.imul(a ^ s.charCodeAt(i), 16777619);
    b = Math.imul(b ^ s.charCodeAt(i), 3266489917);
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}
export function strongSeal<T extends object>(
  value: T,
): T & { integrityContract: typeof STRONG_CONTRACT; integrityValue: string } {
  const body = { ...structuredClone(value), integrityContract: STRONG_CONTRACT };
  Reflect.deleteProperty(body, "integrityValue");
  return { ...body, integrityValue: evidenceValue(body) };
}
export function checkStrong(value: { integrityContract: string; integrityValue: string }) {
  const { integrityValue, ...body } = value;
  if (value.integrityContract !== STRONG_CONTRACT || evidenceValue(body) !== integrityValue)
    throw Error("Altered strengthened delivery evidence");
}
export const MetricSchema = z.strictObject({
  kind: z.enum([
    "duration",
    "count",
    "percentage",
    "ratio",
    "currency",
    "signed",
    "bounded",
    "qualitative",
  ]),
  unit: z.string(),
  direction: z.enum(["increase", "decrease", "qualitative"]),
  minimum: z.number().finite().nullable(),
  maximum: z.number().finite().nullable(),
  integer: z.boolean(),
  comparison: z.enum(["relative", "absolute", "percentage_points", "qualitative"]),
});
export type MeasurementDefinition = z.infer<typeof MetricSchema>;
export function metricFor(
  o: { type: string; unit: string; direction: MeasurementDefinition["direction"] },
  explicit?: MeasurementDefinition,
  historical = false,
): MeasurementDefinition {
  const kind =
    o.type === "qualitative"
      ? "qualitative"
      : /^(minutes?|hours?|seconds?|days?)$/i.test(o.unit)
        ? "duration"
        : /^(count|items?|records?)$/i.test(o.unit)
          ? "count"
          : o.unit === "%"
            ? "percentage"
            : "signed";
  if (kind === "signed" && !explicit && !historical)
    throw Error("Custom numeric outcomes require an explicit measurement domain and comparison");
  const metric = MetricSchema.parse(
    explicit ?? {
      kind,
      unit: o.unit,
      direction: o.direction,
      minimum: ["duration", "count", "percentage", "ratio"].includes(kind) ? 0 : null,
      maximum: kind === "percentage" ? 100 : null,
      integer: kind === "count",
      comparison:
        kind === "qualitative"
          ? "qualitative"
          : kind === "signed"
            ? "absolute"
            : kind === "percentage"
              ? "percentage_points"
              : "relative",
    },
  );
  if (
    metric.unit !== o.unit ||
    metric.direction !== o.direction ||
    (o.type === "qualitative") !== (metric.kind === "qualitative") ||
    (metric.minimum !== null && metric.maximum !== null && metric.minimum > metric.maximum) ||
    (metric.kind === "bounded" && metric.minimum === null && metric.maximum === null)
  )
    throw Error("Incompatible measurement definition");
  if (metric.kind === "qualitative" && metric.comparison !== "qualitative")
    throw Error("Qualitative comparison is required");
  if (metric.kind !== "qualitative" && metric.comparison === "qualitative")
    throw Error("Numeric comparison semantics are required");
  if (metric.kind === "percentage" && (metric.minimum !== 0 || metric.maximum !== 100))
    throw Error("Percentage metrics require explicit 0–100 bounds");
  return metric;
}
export function validateMetric(
  metric: MeasurementDefinition,
  value: number | null,
  unit = metric.unit,
  required = false,
) {
  if (unit !== metric.unit) throw Error("Incompatible measurement units");
  if (metric.kind === "qualitative") {
    if (value !== null) throw Error("Qualitative observations cannot contain fabricated numbers");
    return;
  }
  if (value === null) {
    if (required) throw Error("A numeric observation is required");
    return;
  }
  if (
    !Number.isFinite(value) ||
    (metric.integer && !Number.isInteger(value)) ||
    (["duration", "count"].includes(metric.kind) && value < 0) ||
    (metric.minimum !== null && value < metric.minimum) ||
    (metric.maximum !== null && value > metric.maximum)
  )
    throw Error("Measurement is outside its permitted domain");
}
const recordIdentity = {
  id,
  organizationId: id,
  engagementId: id,
  outcomeId: id,
  number: z.number().int().positive(),
  createdAt: strictInstant,
  createdBy: id,
};
export const DefinitionSchema = z.strictObject({
  ...recordIdentity,
  metric: MetricSchema,
  objective: id,
  definition: id,
  target: z.number().finite().nullable(),
  targetDescription: z.string(),
  frequency: id,
  baselineId: z.string(),
  previousId: z.string(),
  reason: id,
  ...strongFields,
});
export const BaselineSchema = z.strictObject({
  ...recordIdentity,
  definitionId: id,
  value: z.number().finite().nullable(),
  unit: z.string(),
  description: z.string(),
  observedAt: strictInstant,
  source: id,
  evidence: z.array(id).min(1),
  previousId: z.string(),
  reason: id,
  approval: EvidenceApprovalSchema,
  ...strongFields,
});
export const MeasurementBindingSchema = z.strictObject({
  measurementId: id,
  organizationId: id,
  engagementId: id,
  outcomeId: id,
  definitionId: id,
  definitionValue: id,
  baselineId: z.string(),
  baselineValue: z.string(),
  content: z.record(z.string(), z.unknown()),
  supersedesId: z.string(),
  reason: z.string(),
  ...strongFields,
});
export const VerificationBindingSchema = z.strictObject({
  measurementId: id,
  measurementValue: id,
  baselineId: z.string(),
  baselineValue: z.string(),
  definitionId: id,
  approval: EvidenceApprovalSchema,
  decision: z.literal("verified"),
  ...strongFields,
});
export const OutcomeEvidenceSchema = z.strictObject({
  definitions: z.array(DefinitionSchema).min(1),
  baselines: z.array(BaselineSchema),
  currentDefinitionId: id,
  currentBaselineId: z.string(),
});
export const AuthorizationSchema = EvidenceApprovalSchema.extend({
  engagementId: id,
  organizationId: id,
  initiationId: id,
  initiationValue: id,
  scopeId: id,
  scopeValue: id,
  commercialValue: id,
  authorizationType: z.enum(["proposal", "direct", "follow_on"]),
  ...strongFields,
});
export const ObligationSchema = z.strictObject({
  id,
  organizationId: id,
  engagementId: id,
  sourceId: id,
  sourceValue: id,
  sourceReference: id,
  description: id,
  criteria: id,
  required: z.boolean(),
  acceptance: z.enum(["customer_acceptance", "internal_approval", "review_evidence"]),
  amendmentId: z.string(),
  replacesId: z.string(),
  ...strongFields,
});
export const ObligationMappingSchema = z.strictObject({
  obligationId: id,
  deliverableIds: z.array(id),
  milestoneIds: z.array(id),
  workstreamIds: z.array(id),
  reviewIds: z.array(id),
  coverage: id,
  evidence: z.array(id).min(1),
  approval: EvidenceApprovalSchema,
  ...strongFields,
});
export const ObligationAmendmentSchema = z.strictObject({
  obligationId: id,
  action: z.enum(["remove", "supersede"]),
  description: z.string(),
  criteria: z.string(),
  reason: id,
});
export const ReviewBindingSchema = z.strictObject({
  engagementId: id,
  organizationId: id,
  stateValue: id,
  state: z.record(z.string(), z.unknown()),
  ...strongFields,
});
export const HistoricalRevalidationSchema = z.strictObject({
  engagementId: id,
  organizationId: id,
  initiationValue: id,
  sourceValue: id,
  decision: z.literal("revalidated_for_follow_on"),
  approval: EvidenceApprovalSchema,
  ...strongFields,
});
export const LifecycleEventSchema = z.strictObject({
  id,
  engagementId: id,
  organizationId: id,
  from: id,
  to: id,
  authorizationValue: z.string(),
  approval: EvidenceApprovalSchema,
  ...strongFields,
});

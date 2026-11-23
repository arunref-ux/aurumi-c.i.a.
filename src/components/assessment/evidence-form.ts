/**
 * Lossless mapping between an evidence record and the evidence form (P1-02).
 * The form shows one source and date-only fields; everything it does not show
 * (extra sources, full timestamps, publisher, observedAt, confidence score)
 * is carried over from the original record unchanged.
 */
import type { EvidenceRecord } from "@/domain/assessment";

export const toDate = (iso: string | undefined) => (iso ? iso.slice(0, 10) : "");
const toIso = (d: unknown) => (typeof d === "string" && d ? `${d}T00:00:00Z` : "");
/** Keeps the original full timestamp when the user left its date unchanged. */
const keepIso = (original: string | undefined, formDate: unknown) =>
  original && toDate(original) === formDate ? original : toIso(formDate);

export function evidenceToForm(e: EvidenceRecord): Record<string, unknown> {
  const src = e.sources[0];
  return {
    statement: e.statement,
    attribute: e.attribute,
    status: e.status,
    applicability: e.applicability ?? "general",
    connectorItemId: e.connectorItemId ?? "",
    sourceType: src?.sourceType ?? "interview",
    sourceTitle: src?.title ?? "",
    sourceUrl: src?.url ?? "",
    researchedAt: toDate(e.researchedAt),
    retrievedAt: toDate(src?.retrievedAt),
    confidence: e.confidence.level,
    confidenceNote:
      e.confidence.level === "unknown" ? e.confidence.reason : (e.confidence.rationale ?? ""),
    verification: e.verification.state,
    verificationNote:
      e.verification.state === "verified"
        ? e.verification.method
        : e.verification.state === "disputed"
          ? e.verification.note
          : "",
    generatedBy: e.generatedBy ?? "",
    links: e.links.map((l) => `${l.kind}:${l.id}`),
    notes: e.notes,
  };
}

export function formToEvidenceInput(
  v: Record<string, unknown>,
  original?: EvidenceRecord,
): Record<string, unknown> {
  const s = (k: string) => String(v[k] ?? "");
  const first = original?.sources[0];
  const rest = original?.sources.slice(1) ?? [];
  let sources: unknown[] = rest;
  if (s("sourceTitle")) {
    const head: Record<string, unknown> = {
      ...(first ? structuredClone(first) : {}),
      title: s("sourceTitle"),
      sourceType: s("sourceType"),
      retrievedAt: keepIso(first?.retrievedAt, v["retrievedAt"]),
    };
    if (s("sourceUrl")) head["url"] = s("sourceUrl");
    else delete head["url"];
    sources = [head, ...structuredClone(rest)];
  }
  const conf = s("confidence");
  const prevConf = original?.confidence;
  const prevScore = prevConf && prevConf.level !== "unknown" ? prevConf.score : undefined;
  const confidence =
    conf === "unknown"
      ? { level: "unknown", reason: s("confidenceNote") }
      : {
          level: conf,
          // A numeric score belongs to the level it was given for.
          ...(prevConf?.level === conf && prevScore !== undefined ? { score: prevScore } : {}),
          ...(s("confidenceNote") ? { rationale: s("confidenceNote") } : {}),
        };
  const ver = s("verification");
  return {
    statement: s("statement"),
    attribute: s("attribute"),
    status: s("status"),
    applicability: s("applicability") || "general",
    ...(s("connectorItemId").trim() ? { connectorItemId: s("connectorItemId").trim() } : {}),
    sources,
    researchedAt: keepIso(original?.researchedAt, v["researchedAt"]),
    confidence,
    verification:
      ver === "verified"
        ? { state: "verified", method: s("verificationNote") }
        : ver === "disputed"
          ? { state: "disputed", note: s("verificationNote") }
          : { state: "unverified" },
    ...(s("generatedBy") ? { generatedBy: s("generatedBy") } : {}),
    links: ((v["links"] as string[]) ?? []).map((x) => {
      const [kind, ...r] = x.split(":");
      return { kind, id: r.join(":") };
    }),
    notes: s("notes"),
  };
}

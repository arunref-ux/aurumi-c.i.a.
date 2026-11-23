/**
 * Research provenance rules (§2.2). A finding must say where it came from,
 * when it was researched, how confident we are (or that we don't know) and
 * whether a person has verified it. Record creation time is separate.
 */
import type { Confidence, ID, ISODate, ResearchEvidence, ResearchFinding, Verification } from "./types";

const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const isIso = (v: unknown) => typeof v === "string" && ISO_RE.test(v) && !Number.isNaN(Date.parse(v));
const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;

export function validateFinding(f: ResearchFinding): string[] {
  const errors: string[] = [];
  if (!filled(f.attribute)) errors.push("attribute is required");
  if (!filled(f.statement)) errors.push("statement is required");
  if (!isIso(f.researchedAt)) errors.push("researchedAt must be an ISO date");
  if (!Array.isArray(f.sources)) { errors.push("sources must be a list"); return errors; }
  for (const s of f.sources) {
    if (!filled(s.title)) errors.push("every source needs a title");
    if (!isIso(s.retrievedAt)) errors.push("every source needs retrievedAt");
    if (s.observedAt !== undefined && !isIso(s.observedAt)) errors.push("observedAt must be an ISO date");
  }
  const c = f.confidence as Confidence | undefined;
  if (!c || !["high", "medium", "low", "unknown"].includes(c.level)) errors.push("confidence level is required");
  else if (c.level === "unknown") { if (!filled(c.reason)) errors.push("unknown confidence needs a reason"); }
  else if (c.score !== undefined && (typeof c.score !== "number" || !Number.isFinite(c.score) || c.score < 0 || c.score > 1)) errors.push("confidence score must be a finite number from 0 to 1");
  const v = f.verification as Verification | undefined;
  if (!v || !["unverified", "verified", "disputed"].includes(v.state)) errors.push("verification state is required");
  else if (v.state === "verified") {
    if (!filled(v.verifiedBy)) errors.push("verification needs verifiedBy");
    if (!isIso(v.verifiedAt)) errors.push("verification needs a valid verifiedAt");
    if (!filled(v.method)) errors.push("verification needs a method");
  } else if (v.state === "disputed") {
    if (!filled(v.reviewedBy)) errors.push("dispute needs reviewedBy");
    if (!isIso(v.reviewedAt)) errors.push("dispute needs a valid reviewedAt");
    if (!filled(v.note)) errors.push("dispute needs a note");
  }
  const humanSources = f.sources.filter((s) => s.sourceType !== "ai_model");

  switch (f.status) {
    case "confirmed_fact":
      if (v?.state !== "verified") errors.push("a confirmed fact must be verified");
      if (humanSources.length === 0) errors.push("a confirmed fact needs at least one non-AI source");
      break;
    case "research_finding":
      if (humanSources.length === 0) errors.push("a research finding needs at least one non-AI source");
      break;
    case "ai_inference":
      if (!f.generatedBy?.trim()) errors.push("an AI inference must name what generated it");
      if (v?.state === "verified") errors.push("a verified AI inference must be re-classified as a confirmed fact");
      break;
    default:
      break;
  }
  return errors;
}

export function assertValidFinding(f: ResearchFinding): ResearchFinding {
  const errors = validateFinding(f);
  if (errors.length) throw new Error(`Invalid research finding (${f.attribute}): ${errors.join("; ")}`);
  return f;
}

/** Wrap a finding as an evidence record without losing provenance; createdAt is record time, not research time. */
export function findingToEvidence(f: ResearchFinding, meta: { id: ID; organizationId: ID; subjectId: ID; actorId: ID; now: ISODate }): ResearchEvidence {
  assertValidFinding(f);
  return { ...structuredClone(f), id: meta.id, organizationId: meta.organizationId, subjectId: meta.subjectId, createdAt: meta.now, createdBy: meta.actorId, updatedAt: meta.now, updatedBy: meta.actorId };
}

export function evidenceToFinding(e: ResearchEvidence): ResearchFinding {
  const { attribute, statement, status, sources, researchedAt, confidence, verification, generatedBy } = structuredClone(e);
  return { attribute, statement, status, sources, researchedAt, confidence, verification, ...(generatedBy !== undefined ? { generatedBy } : {}) };
}

/**
 * Research provenance rules (§2.2). A finding must say where it came from,
 * when it was researched, how confident we are (or that we don't know) and
 * whether a person has verified it. Record creation time is separate.
 */
import type { ID, ISODate, ResearchEvidence, ResearchFinding } from "./types";

const isIso = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));

export function validateFinding(f: ResearchFinding): string[] {
  const errors: string[] = [];
  if (!f.statement?.trim()) errors.push("statement is required");
  if (!isIso(f.researchedAt)) errors.push("researchedAt must be an ISO date");
  for (const s of f.sources) {
    if (!s.title?.trim()) errors.push("every source needs a title");
    if (!isIso(s.retrievedAt)) errors.push("every source needs retrievedAt");
    if (s.observedAt !== undefined && !isIso(s.observedAt)) errors.push("observedAt must be an ISO date");
  }
  const c = f.confidence;
  if (c.level === "unknown" && !c.reason?.trim()) errors.push("unknown confidence needs a reason");
  if (c.level !== "unknown" && c.score !== undefined && (c.score < 0 || c.score > 1)) errors.push("confidence score must be 0–1");
  const humanSources = f.sources.filter((s) => s.sourceType !== "ai_model");

  switch (f.status) {
    case "confirmed_fact":
      if (f.verification.state !== "verified") errors.push("a confirmed fact must be verified");
      if (humanSources.length === 0) errors.push("a confirmed fact needs at least one non-AI source");
      break;
    case "research_finding":
      if (humanSources.length === 0) errors.push("a research finding needs at least one non-AI source");
      break;
    case "ai_inference":
      if (!f.generatedBy?.trim()) errors.push("an AI inference must name what generated it");
      if (f.verification.state === "verified") errors.push("a verified AI inference must be re-classified as a confirmed fact");
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

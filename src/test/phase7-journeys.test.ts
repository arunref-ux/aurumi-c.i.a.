import { beforeEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { businessFitPublic as B } from "@/data/business-fit-public";
import { businessFitInternal as I } from "@/data/business-fit-internal";
import { assessmentStudio as AS } from "@/data/assessment-studio";
import { solutionStudio as SS } from "@/data/solution-studio";
import { proposalStudio as PS } from "@/data/proposal-studio";
import { engagementService as E } from "@/data/delivery";
import { FIT_SCENARIOS } from "@/data/business-fit-seed";
import { store, memoryBackend, STORAGE_KEY } from "@/data/store";
import { canonical } from "@/domain/assessment";
import { cleanStudioJourney, deliverAndComplete } from "./phase7-journey-fixtures";
import { reset, first, M, P, A, R, PARTNER } from "./delivery-fixtures";

beforeEach(() => {
  reset();
  store.reset();
});

describe("Phase 7 complete cross-studio journeys", () => {
  it("J01 clean hotel consultation to immutable completion retains the whole source chain after three reloads", async () => {
    const backend = memoryBackend();
    store.attach(backend);
    const journey = await cleanStudioJourney();
    expect(journey.imported.workspace.systems.map((s) => s.name)).toContain("Hotel PMS");
    expect(
      journey.imported.workspace.evidence.every((e) => e.verification.state === "unverified"),
    ).toBe(true);
    expect(journey.assessmentSnapshot.assessment.id).toBe(journey.assessmentId);
    expect(journey.solutionSnapshot.sourceAssessment.id).toBe(journey.assessmentSnapshot.id);
    expect(journey.issued.document.solution.id).toBe(journey.solutionSnapshot.id);
    expect(journey.issued.issue).toBeDefined();
    expect(
      (await PS.get(M, journey.proposal.id)).shares.find((s) => s.id === journey.share.id)
        ?.effective,
    ).toBe("accepted");
    const completed = await deliverAndComplete(journey.engagementId);
    expect(completed.engagement.status).toBe("completed");
    expect(
      completed.obligations.filter((o) => o.required).every((o) => o.status === "satisfied"),
    ).toBe(true);
    const c = completed.completion;
    if (!c || c.initiation.source.kind !== "proposal") throw Error("Missing completion source");
    expect(c.initiation.source.versionId).toBe(journey.issued.id);
    expect(c.initiation.source.version).toEqual(journey.issued);
    expect(c.authorization).toBeDefined();
    expect(first(c.outcomes).measurements.at(-1)?.value).toBe(80);
    expect(first(c.outcomes).target).toBe(60);
    expect(first(c.continuations).obligation).toBe(false);
    expect(first(c.continuations).opportunityReference).toMatch(/^mock:\/\/shoptalk\//);
    const original = canonical(c);
    for (let n = 0; n < 3; n++) {
      store.attach(backend);
      expect(canonical((await E.get(A, journey.engagementId)).completion)).toBe(original);
      expect(I.get(P, journey.intakeId).conversion?.assessmentId).toBe(journey.assessmentId);
      expect(I.contact(P, journey.intakeId).leadReference).toBe(journey.consultation.leadReference);
      expect(
        (await AS.get(P, journey.assessmentId)).snapshots.some(
          (s) => s.id === journey.assessmentSnapshot.id,
        ),
      ).toBe(true);
      expect(
        (await SS.get(P, journey.solution.id)).snapshots.some(
          (s) => s.id === journey.solutionSnapshot.id,
        ),
      ).toBe(true);
      expect(
        (await PS.get(M, journey.proposal.id)).versions.find((v) => v.id === journey.issued.id),
      ).toEqual(journey.issued);
    }
    await expect(E.get(PARTNER, journey.engagementId)).rejects.toThrow();
    expect((await E.get(R, journey.engagementId)).commercialVisible).toBe(false);
    if (process.env["PHASE7_CAPTURE"] === "1") {
      const saved = backend.read(STORAGE_KEY);
      if (!saved) throw Error("Missing captured committed work");
      writeFileSync("/tmp/phase7-journey-envelope.json", saved);
      writeFileSync(
        "/tmp/phase7-journey-ids.json",
        JSON.stringify({
          engagementId: journey.engagementId,
          proposalId: journey.proposal.id,
          assessmentId: journey.assessmentId,
          solutionId: journey.solution.id,
          intakeId: journey.intakeId,
        }),
      );
    }
  });
  it("J02 distribution report remains contact-free, isolated and restartable", () => {
    const handle = B.begin();
    B.save(handle, first(FIT_SCENARIOS.slice(1)).responses, 4);
    const report = B.generate(handle);
    expect(report.dimensions).toHaveLength(6);
    expect(I.list(M)).toHaveLength(0);
    expect(store.table("fitConsultations")).toHaveLength(0);
    expect(store.table("fitOperations")).toHaveLength(0);
    const other = B.begin();
    expect(() => B.get({ id: handle.id, token: other.token })).toThrow();
    B.clear(handle);
    expect(() => B.get(handle)).toThrow();
    expect(B.get(other).report).toBeUndefined();
  });
  it("J09 clean custom ERP remains uncertain throughout imported assessment, conditional solution and proposal", async () => {
    const j = await cleanStudioJourney(3);
    expect(j.imported.workspace.systems.some((s) => s.name === "Custom ERP")).toBe(true);
    expect(
      j.report.opportunities.some(
        (o) => o.capability?.kind === "connector" && o.capability.claim === "available",
      ),
    ).toBe(false);
    expect(
      j.solutionSnapshot.integrations.every((i) => i.feasibility === "possible_uncommitted"),
    ).toBe(true);
    expect(j.issued.document.deliverables.every((d) => d.qualification.includes("excluded"))).toBe(
      true,
    );
  });
});

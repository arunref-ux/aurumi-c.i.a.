/** Phase 7 print scenario: amended scope + 120→80→180 (target 60) honestly unachieved completion. */
import { writeFileSync } from "node:fs";
import { beforeEach, expect, it } from "vitest";
import { engagementService as E } from "@/data/delivery";
import { store, STORAGE_KEY } from "@/data/store";
import {
  reset,
  first,
  M,
  A,
  HOTEL,
  O,
  faults,
  readyCompletion,
  completionInput,
} from "./delivery-fixtures";

beforeEach(() => {
  reset();
  store.reset();
});

it("amended, unsuccessful completion keeps original and amended commitments distinguishable", async () => {
  const backend = faults().backend;
  const prior = await E.get(M, HOTEL),
    obligation = first(prior.obligations);
  await E.change(M, HOTEL, {
    requested: "Revised integration feasibility report",
    reason: "Fictional customer authorized a revised report",
    impact: "Replace only the named reporting commitment",
    scheduleImpact: "Within agreed period",
    commercialImpact: "No commercial change",
    terms: first(prior.scopes).terms,
    revisedProposalVersionId: "",
    obligationAmendments: [
      {
        obligationId: obligation.id,
        action: "supersede",
        description: "Revised integration feasibility report",
        criteria: "Customer acknowledges revised interface uncertainty report",
        reason: "Explicit changed criterion",
      },
    ],
  });
  const change = first((await E.get(M, HOTEL)).workspace.changes);
  await E.approveChange(
    A,
    HOTEL,
    change.id,
    "approved",
    "mock://approval",
    "Independent amendment",
  );
  await E.applyChange(A, HOTEL, change.id);
  // Deliver and accept the amended (replacement) commitment through the governed workflow.
  let amended = await E.get(M, HOTEL);
  const replacement = amended.obligations.find((o) => o.replacesId === obligation.id);
  if (!replacement) throw Error("Missing replacement obligation");
  const streamId = first(amended.workspace.workstreams).id;
  amended = await E.deliverable(M, HOTEL, {
    workstreamId: streamId,
    ownerProfessionalId: first(amended.workspace.deliverables).ownerProfessionalId,
    title: replacement.description,
    description: "Fictional revised interface uncertainty report",
    criteria: replacement.criteria,
    due: "2026-12-01",
    required: true,
    independentReview: true,
    acceptanceKind:
      replacement.acceptance === "review_evidence" ? "customer_acceptance" : replacement.acceptance,
    artifactReference: "mock://file-hub/revised-report",
  });
  const d = amended.workspace.deliverables.at(-1);
  if (!d) throw Error("Missing revised deliverable");
  await E.mapObligation(M, HOTEL, {
    obligationId: replacement.id,
    deliverableIds: [d.id],
    milestoneIds: [],
    workstreamIds: [streamId],
    reviewIds: [],
    coverage: replacement.criteria,
    evidence: ["mock://mapping-revised"],
    comment: "Amended criterion mapping",
  });
  amended = await E.submitDeliverable(M, HOTEL, d.id);
  const dv = amended.workspace.deliverables.find((r) => r.id === d.id)?.versions.at(-1);
  if (!dv) throw Error("Missing revised version");
  await E.reviewDeliverable(
    A,
    HOTEL,
    d.id,
    dv.id,
    d.acceptanceKind,
    "accepted",
    "mock://file-hub/revised-acceptance",
    "Simulated customer acceptance of the revised report",
  );
  await readyCompletion();
  const measurement = first(first((await E.get(M, HOTEL)).workspace.outcomes).measurements);
  await E.verifyMeasurement(
    A,
    HOTEL,
    O,
    measurement.id,
    "mock://verify80",
    "Verify 80-minute result",
  );
  const view180 = await E.measure(
    M,
    HOTEL,
    O,
    {
      value: 180,
      observedAt: new Date().toISOString(),
      qualitative: "Unfavorable later observation",
      source: "Fictional customer observation",
      provenance: "customer_reported",
      evidence: ["mock://180"],
    },
    "not_achieved",
    "Reporting now takes 180 minutes; target 60 not achieved",
  );
  const later = first(view180.workspace.outcomes).measurements.at(-1);
  if (!later) throw Error("Missing observation");
  await E.verifyMeasurement(A, HOTEL, O, later.id, "mock://verify180", "Verify unfavorable result");
  await E.review(M, HOTEL, {
    kind: "completion",
    scheduledAt: new Date().toISOString(),
    calendarReference: "mock://calendar",
    summary: "Amended scope delivered; outcome unachieved, reviewed honestly",
    customerFeedback: completionInput.customerFeedback,
    nextActions: completionInput.outstandingResponsibilities,
    outstandingResponsibilities: completionInput.outstandingResponsibilities,
    participants: ["customer"],
    evidence: "mock://review180",
    comment: "Fresh review after amendment and unfavorable observation",
  });
  const view = await E.complete(A, HOTEL, {
    ...completionInput,
    summary:
      "Amended service completed. Reporting time: baseline 120 min, then 80 min, latest 180 min against a 60 min target — not achieved.",
  });
  expect(view.engagement.status).toBe("completed");
  const out = first(view.completion?.outcomes ?? []);
  expect(out.status).toBe("not_achieved");
  expect(out.measurements.map((m) => m.value)).toEqual([80, 180]);
  expect(view.scopes).toHaveLength(2);
  expect(view.obligations.find((o) => o.id === obligation.id)?.status).toBe(
    "superseded_by_amendment",
  );
  store.attach(backend);
  expect((await E.get(A, HOTEL)).completion).toEqual(view.completion);
  if (process.env["PHASE7_CAPTURE"] === "1") {
    writeFileSync("/tmp/phase7-amended-envelope.json", backend.read(STORAGE_KEY) ?? "");
    writeFileSync("/tmp/phase7-amended-ids.json", JSON.stringify({ engagementId: HOTEL }));
  }
}, 30000);

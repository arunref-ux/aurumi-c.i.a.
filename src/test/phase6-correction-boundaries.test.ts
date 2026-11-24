import { beforeEach, expect, it } from "vitest";
import { engagementService as E } from "@/data/delivery";
import { store, memoryBackend, STORAGE_KEY } from "@/data/store";
import { deliveryControls } from "@/data/network";
import { canonical } from "@/domain/assessment";
import { measurementChange, acceptedVersion, type ServiceTerms } from "@/domain/delivery";
import {
  reset,
  M,
  A,
  R,
  HOTEL,
  STREAM,
  D,
  O,
  first,
  creation,
  readyCompletion,
  completionInput,
  faults,
} from "./delivery-fixtures";
import history from "./fixtures/phase6-9ce518a-history.json";
import assignments from "./fixtures/phase6-9ce518a-assignment-history.json";
beforeEach(reset);
it("material outcome definition revision preserves the definition reviewed before the change", async () => {
  await E.measure(M, HOTEL, O, observation(), "partially_achieved", "Actual partial observation");
  await review();
  const before = await E.get(M, HOTEL),
    original = first(before.workspace.outcomes),
    historical = first(before.workspace.reviews);
  if (!original.measurementDefinition) throw Error("Missing metric");
  await E.reviseOutcomeDefinition(M, HOTEL, O, {
    objective: original.objective,
    definition: original.definition,
    unit: original.unit,
    type: original.type,
    target: 50,
    targetDescription: "Revised authorized target",
    direction: original.direction,
    frequency: original.frequency,
    measurementDefinition: original.measurementDefinition,
    reason: "Target corrected after review",
    evidence: "mock://definition-approval",
  });
  const after = await E.get(M, HOTEL);
  expect(first(after.workspace.outcomes).evidenceHistory?.definitions.map((d) => d.target)).toEqual(
    [60, 50],
  );
  expect(first(after.workspace.reviews)).toEqual(historical);
  expect(historical.outcomeEvidence?.[0]?.target).toBe(60);
  expect(after.staleReviewIds).toContain(historical.id);
});
it("direct service criteria are pinned separately from descriptive scope", async () => {
  const v = await E.create(
    M,
    creation({
      completionCriteria:
        "Customer acknowledges two advisory sessions and documented recommendations",
    }),
  );
  expect(first(v.obligations).criteria).toBe(
    "Customer acknowledges two advisory sessions and documented recommendations",
  );
  expect(v.initiation?.completionCriteria).toBe(first(v.obligations).criteria);
});
const observation = (value = 80) => ({
  value,
  observedAt: new Date().toISOString(),
  qualitative: "Actual result",
  source: "Customer report",
  provenance: "customer_reported" as const,
  evidence: ["mock://evidence"],
});
const review = () =>
  E.review(M, HOTEL, {
    kind: "completion",
    scheduledAt: new Date().toISOString(),
    calendarReference: "",
    summary: "Current material state reviewed",
    customerFeedback: completionInput.customerFeedback,
    nextActions: completionInput.outstandingResponsibilities,
    participants: ["customer"],
    evidence: "mock://review",
    comment: "Current state",
  });

it("superseded required deliverable cannot reuse old-version acceptance and stales the review", async () => {
  let v = await E.submitDeliverable(M, HOTEL, D);
  const version = first(first(v.workspace.deliverables).versions);
  await E.reviewDeliverable(
    A,
    HOTEL,
    D,
    version.id,
    "customer_acceptance",
    "accepted",
    "mock://accept",
    "Accepted current version",
  );
  await review();
  await E.editDeliverable(M, HOTEL, D, {
    description: "Changed findings",
    artifactReference: "mock://new-artifact",
  });
  v = await E.submitDeliverable(M, HOTEL, D);
  expect(acceptedVersion(first(v.workspace.deliverables))).toBeUndefined();
  expect(first(v.obligations).status).toBe("awaiting_acceptance");
  expect(v.staleReviewIds).toHaveLength(1);
});
it("reopened material issue invalidates current completion review", async () => {
  const v = await E.concern(M, HOTEL, {
    workstreamId: STREAM,
    kind: "issue",
    description: "Material access failure",
    category: "Access",
    likelihood: "high",
    impact: "high",
    ownerProfessionalId: "pro_rohan",
    response: "Customer provides access",
    alternatives: "",
    reviewDate: "2026-12-04",
    evidence: ["mock://issue"],
    verification: "professional_observation",
  });
  const issue = first(v.workspace.concerns);
  await E.resolveConcern(M, HOTEL, issue.id, "resolved", "mock://resolved", "Access restored");
  await readyCompletion();
  await E.reopenConcern(M, HOTEL, issue.id, "mock://reopened", "Access failed again");
  await expect(E.complete(A, HOTEL, completionInput)).rejects.toThrow("stale");
});
it("changed outcome ownership does not erase original authorship but stales a material review", async () => {
  await readyCompletion();
  await E.reassignOutcome(
    A,
    HOTEL,
    O,
    "pro_ananya",
    STREAM,
    "mock://assign",
    "Responsibility reassigned",
  );
  expect(first((await E.get(M, HOTEL)).workspace.outcomes).createdBy).toBe("u_admin");
  await expect(E.complete(A, HOTEL, completionInput)).rejects.toThrow("stale");
});
it("earlier observation improvement continues using its immutable baseline after correction", async () => {
  const v = await E.measure(
      M,
      HOTEL,
      O,
      observation(),
      "partially_achieved",
      "Actual partial result",
    ),
    old = first(first(v.workspace.outcomes).measurements);
  await E.correctBaseline(A, HOTEL, O, {
    value: 600,
    description: "Corrected baseline",
    evidence: ["mock://baseline"],
    reason: "Correction with explicit approval",
    approvalEvidence: "mock://approve",
  });
  const current = first((await E.get(M, HOTEL)).workspace.outcomes);
  expect(measurementChange(current, old)?.value).toBeCloseTo(33.333, 2);
  expect(current.baseline).toBe(600);
});
it("percentage-point change is distinct from relative percentage change", async () => {
  const v = await E.outcome(M, HOTEL, {
    objective: "Adoption percentage",
    definition: "0–100 scale",
    unit: "%",
    type: "quantitative",
    baseline: 40,
    baselineDescription: "40 percent adoption",
    baselineEvidence: ["mock://baseline"],
    target: 80,
    targetDescription: "Target",
    direction: "increase",
    frequency: "Monthly",
    ownerProfessionalId: "pro_rohan",
    workstreamId: STREAM,
  });
  const o = v.workspace.outcomes.at(-1);
  if (!o) throw Error("Missing outcome");
  const measured = await E.measure(
    M,
    HOTEL,
    o.id,
    observation(60),
    "partially_achieved",
    "20 percentage-point change",
  );
  const result = measured.workspace.outcomes.at(-1);
  if (!result) throw Error("Missing result");
  expect(measurementChange(result, first(result.measurements))).toEqual({
    value: 20,
    kind: "percentage_points",
    unit: "percentage points",
  });
});
it("custom numeric outcomes require explicit comparison semantics", async () => {
  await expect(
    E.outcome(M, HOTEL, {
      objective: "Custom score",
      definition: "Custom numeric metric",
      unit: "score",
      type: "quantitative",
      baseline: 10,
      baselineDescription: "Original score",
      baselineEvidence: ["mock://baseline"],
      target: 20,
      targetDescription: "Target",
      direction: "increase",
      frequency: "Monthly",
      ownerProfessionalId: "pro_rohan",
    }),
  ).rejects.toThrow("explicit measurement");
});
it("the lexically earlier timestamp nine hours in the future is rejected by its actual instant", async () => {
  const misleading = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().replace("Z", "-12:00");
  expect(misleading < new Date().toISOString()).toBe(true);
  await expect(
    E.measure(M, HOTEL, O, { ...observation(50), observedAt: misleading }, "achieved", ""),
  ).rejects.toThrow("future");
});
it("verification authority removed during an await cannot commit", async () => {
  const v = await E.measure(M, HOTEL, O, observation(), "partially_achieved", "Actual observation"),
    m = first(first(v.workspace.outcomes).measurements);
  deliveryControls.latencyMs = 25;
  const pending = E.verifyMeasurement(
    A,
    HOTEL,
    O,
    m.id,
    "mock://verify",
    "Independent verification",
  );
  store.replace(
    "users",
    store.table("users").map((u) => (u.id === A.user.id ? { ...u, roles: [] } : u)),
  );
  await expect(pending).rejects.toThrow();
  expect(
    first(first(store.table("deliveryWorkspaces")).outcomes).measurements[0]?.verification,
  ).toBeNull();
});
it("owner assignment removal during outcome creation leaves no new record", async () => {
  deliveryControls.latencyMs = 25;
  const pending = E.outcome(M, HOTEL, {
    objective: "Specialist result",
    definition: "Reporting minutes",
    unit: "minutes",
    type: "quantitative",
    baseline: 120,
    baselineDescription: "Baseline",
    baselineEvidence: ["mock://baseline"],
    target: 60,
    targetDescription: "Target",
    direction: "decrease",
    frequency: "Monthly",
    ownerProfessionalId: "pro_ananya",
    workstreamId: STREAM,
  });
  const w = first(store.table("deliveryWorkspaces"));
  const owner = w.assignments.find((a) => a.professionalId === "pro_ananya");
  if (!owner) throw Error("Missing owner");
  owner.status = "ended";
  owner.end = "2026-11-24";
  store.replace(
    "deliveryWorkspaces",
    store.table("deliveryWorkspaces").map((r) => (r.id === w.id ? w : r)),
  );
  store.replace(
    "engagements",
    store
      .table("engagements")
      .map((e) => (e.id === HOTEL ? { ...e, assignedUserIds: ["u_manager"] } : e)),
  );
  await expect(pending).rejects.toThrow();
  expect(first(store.table("deliveryWorkspaces")).outcomes).toHaveLength(1);
});
it("commercial permission removed during amendment application blocks commitment", async () => {
  const terms = first((await E.get(M, HOTEL)).scopes).terms;
  await E.change(M, HOTEL, {
    requested: "Additional service",
    reason: "Customer request",
    impact: "One session",
    scheduleImpact: "",
    commercialImpact: "Restricted amount",
    terms: { ...terms, amount: 999999 },
    revisedProposalVersionId: "",
  });
  const c = first((await E.get(A, HOTEL)).workspace.changes);
  await E.approveChange(
    A,
    HOTEL,
    c.id,
    "approved",
    "mock://commercial",
    "Direct commercial approval",
  );
  deliveryControls.latencyMs = 25;
  const pending = E.applyChange(A, HOTEL, c.id);
  store.replace(
    "users",
    store
      .table("users")
      .map((u) => (u.id === A.user.id ? { ...u, roles: ["proposal_reviewer"] } : u)),
  );
  await expect(pending).rejects.toThrow();
  expect(first(store.table("deliveryWorkspaces")).scopes).toHaveLength(1);
});
it("postcommencement cancellation without any artifacts cannot lose its authorization history", async () => {
  const f = faults(),
    v = await E.create(M, creation());
  for (const next of ["pending_authorization", "authorized"])
    await E.transition(M, v.engagement.id, next, "mock://auth", "Explicit authorization");
  await E.transition(
    M,
    v.engagement.id,
    "cancelled",
    "mock://cancel",
    "Cancelled after authorization",
  );
  const raw = f.saved();
  raw.tables.deliveryWorkspaces.find(
    (w: { engagementId: string }) => w.engagementId === v.engagement.id,
  ).authorization = null;
  f.backend.write(STORAGE_KEY, JSON.stringify(raw));
  store.attach(f.backend);
  expect(store.table("deliveryWorkspaces").some((w) => w.engagementId === v.engagement.id)).toBe(
    false,
  );
});
it("genuine released assignment history survives repeated reload without invalidating former authors", async () => {
  const b = memoryBackend();
  b.write(STORAGE_KEY, JSON.stringify(assignments.envelope));
  for (let i = 0; i < 3; i++) {
    store.attach(b);
    const expected = assignments.envelope.tables.deliveryWorkspaces.find(
      (w) => w.engagementId === "delivery_distribution",
    );
    expect(expected).toBeDefined();
    const actual = store
      .table("deliveryWorkspaces")
      .find((w) => w.engagementId === "delivery_distribution");
    expect(actual).toEqual(expected);
    expect(
      actual?.assignments.some((a) => a.professionalId === "pro_rohan" && a.status === "ended"),
    ).toBe(true);
  }
  expect(store.persistence().quarantined).toBe(0);
});
it("historical adapter recovery requires explicit source-bound review and reuses its original operation", async () => {
  const b = memoryBackend();
  b.write(STORAGE_KEY, JSON.stringify(history.envelope));
  store.attach(b);
  const op = first(await E.pendingOperations(M, "delivery_distribution"));
  await expect(E.retryOperation(M, op.id)).rejects.toThrow("revalidation");
  await E.revalidateHistorical(
    M,
    "delivery_distribution",
    "mock://historical-review",
    "Authorized recovery of this exact historical operation",
  );
  const v = await E.retryOperation(M, op.id);
  expect(first(v.workspace.tasks).operationId).toBe(op.id);
  await E.retryOperation(M, op.id);
  expect((await E.get(M, "delivery_distribution")).workspace.tasks).toHaveLength(1);
  store.attach(b);
  expect((await E.get(M, "delivery_distribution")).workspace.tasks).toHaveLength(1);
});
it("revalidation never rewrites historical completion or transfers old verification assurance", async () => {
  const b = memoryBackend();
  b.write(STORAGE_KEY, JSON.stringify(history.envelope));
  store.attach(b);
  const before = await E.get(A, HOTEL);
  await E.revalidateHistorical(
    A,
    HOTEL,
    "mock://review",
    "Reviewed historical source for prospective work only",
  );
  const after = await E.get(A, HOTEL);
  expect(after.initiation).toEqual(before.initiation);
  expect(after.completion).toEqual(before.completion);
  expect(after.assurance).toBe("historical_only");
  expect(first(first(after.workspace.outcomes).measurements).verificationBinding).toBeUndefined();
  const follow = await E.create(
    M,
    creation({
      operationKey: "historical-follow",
      origin: "follow_on",
      previousEngagementId: HOTEL,
      customerReference: before.overview.customerReference,
      customerName: before.overview.customerName,
    }),
  );
  expect(follow.assurance).toBe("strengthened");
  expect(follow.initiation?.source.kind).toBe("follow_on");
  expect(canonical((await E.get(A, HOTEL)).completion)).toBe(canonical(before.completion));
});
it("noncommercial users cannot extract revised proposal or scope commercial fields", async () => {
  const f = faults();
  await readyCompletion();
  const before = await E.get(A, HOTEL);
  const terms: ServiceTerms = first(before.scopes).terms;
  await E.change(M, HOTEL, {
    requested: "Additional review",
    reason: "Customer request",
    impact: "Operational extension",
    scheduleImpact: "",
    commercialImpact: "Restricted 999999 pricing",
    terms: { ...terms, amount: 999999, commercialBasis: "Restricted 999999 basis" },
    revisedProposalVersionId: "",
  });
  const canonicalBefore = canonical(first(store.table("deliveryWorkspaces")));
  const view = await E.get(R, HOTEL);
  expect(JSON.stringify(view)).not.toContain("999999");
  expect(first(view.workspace.changes).revisedProposal).toBeUndefined();
  expect(first(view.workspace.changes).terms.amount).toBeUndefined();
  expect(canonical(first(store.table("deliveryWorkspaces")))).toBe(canonicalBefore);
  store.attach(f.backend);
  expect(first((await E.get(A, HOTEL)).workspace.changes).terms.amount).toBe(999999);
});

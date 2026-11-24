import { afterEach, beforeEach, expect, it } from "vitest";
import { engagementService as E } from "@/data/delivery";
import { networkService as N } from "@/data/network";
import { proposalStudio as PS } from "@/data/proposal-studio";
import { proposalClock } from "@/domain/proposal";
import { canonical } from "@/domain/assessment";
import { store } from "@/data/store";
import { deliveryAdapters } from "@/integrations/adapters/delivery";
import { mockControls } from "@/integrations/adapters/mock";
import { issuedProposal } from "./proposal-fixtures";
import { reset, first, M, A, P, PARTNER, HOTEL, STREAM, O, creation, faults, readyCompletion, completionInput } from "./delivery-fixtures";

const clock = proposalClock.now;
beforeEach(() => { reset(); store.reset(); });
afterEach(() => { proposalClock.now = clock; });
it("deferred share expiry rejects February 30 instead of silently authorizing a March share", async () => {
  proposalClock.now = () => "2026-02-01T00:00:00.000Z";
  const { p, issued } = await issuedProposal();
  await expect(PS.share(M, p.id, { versionId: issued.id, recipient: { name: "Fictional manager", email: "fictional@example.invalid" }, expiresAt: "2026-02-30T12:00:00.000Z" })).rejects.toThrow("valid expiry");
  expect(store.table("proposalShares")).toHaveLength(0);
});
it("J03 specialist authorship survives removal while self-review, unrelated outcomes and later task access are denied", async () => {
  let v = await E.deliverable(P, HOTEL, { workstreamId: STREAM, ownerProfessionalId: "pro_ananya", title: "Fictional specialist report", description: "Accounting interface uncertainty", criteria: "Independent review", due: "2026-12-01", required: false, independentReview: true, acceptanceKind: "internal_approval", artifactReference: "mock://specialist-report" });
  const d = v.workspace.deliverables.at(-1); if (!d) throw Error("Missing specialist artifact");
  v = await E.submitDeliverable(P, HOTEL, d.id); const version = v.workspace.deliverables.find((x) => x.id === d.id)?.versions.at(-1); if (!version) throw Error("Missing specialist version");
  await expect(E.reviewDeliverable(P, HOTEL, d.id, version.id, "internal_approval", "accepted", "mock://self", "Self approval")).rejects.toThrow();
  await E.reviewDeliverable(A, HOTEL, d.id, version.id, "internal_approval", "accepted", "mock://independent", "Independent professional review");
  expect((await E.get(P, HOTEL)).commercialVisible).toBe(false);
  const assignment = first((await E.get(M, HOTEL)).workspace.assignments.filter((a) => a.userId === P.user.id));
  await E.removeAssignment(M, HOTEL, assignment.id, "mock://remove", "Service ended");
  await expect(E.task(P, HOTEL, { key: "removed-task", workstreamId: STREAM, milestoneId: "", title: "Unauthorized task" })).rejects.toThrow();
  expect((await E.get(M, HOTEL)).workspace.deliverables.find((x) => x.id === d.id)?.versions).toContainEqual(version);
  expect(d.createdBy).toBe(P.user.id);
});
it("J04 reseller affiliation never exposes unrelated hotel delivery or commercial commitments", async () => {
  expect((await E.list(PARTNER)).map((x) => x.engagement.id)).toEqual(["delivery_reseller"]);
  await expect(E.get(PARTNER, HOTEL)).rejects.toThrow();
  await expect(E.create(PARTNER, creation({ operationKey: "partner-bypass" }))).rejects.toThrow();
  const reseller = await E.get(PARTNER, "delivery_reseller");
  expect(reseller.workspace.assignments.every((a) => a.userId === PARTNER.user.id)).toBe(true);
});
it("J05 clean limited direct training completes with service-review evidence and no artificial documents", async () => {
  const initial = await E.create(M, creation({ operationKey: "training-phase7", services: ["ongoing_advisory"], completionCriteria: "Customer acknowledges the agreed training and operational advice" }));
  const id = initial.engagement.id;
  for (const state of ["pending_authorization", "authorized", "mobilizing", "active"]) await E.transition(M, id, state, "mock://authorization", "Explicit direct advisory authorization");
  await E.review(M, id, { kind: "monthly", scheduledAt: new Date().toISOString(), calendarReference: "mock://calendar", summary: "Customer acknowledges agreed training and advice", customerFeedback: "Service accepted", nextActions: "None", participants: ["customer"], evidence: "mock://service-acceptance", comment: "Authorized service delivered" });
  const v = await E.get(M, id); const obligation = first(v.obligations);
  await E.mapObligation(M, id, { obligationId: obligation.id, deliverableIds: [], milestoneIds: [], workstreamIds: [], reviewIds: [first(v.workspace.reviews).id], coverage: obligation.criteria, evidence: ["mock://service-acceptance"], comment: "Exact reviewed commitment" });
  const completion = { evidence: "mock://closure", comment: "Independent authorization", summary: "Limited advisory service delivered", customerFeedback: "Service accepted", outstandingResponsibilities: "None" };
  await E.review(M, id, { kind: "completion", scheduledAt: new Date().toISOString(), calendarReference: "mock://calendar", summary: completion.summary, customerFeedback: completion.customerFeedback, nextActions: "None", outstandingResponsibilities: "None", participants: ["customer"], evidence: "mock://review", comment: "Fresh completion state" });
  await E.transition(M, id, "completion_review", "mock://request", "Independent closure requested");
  const result = await E.complete(A, id, completion); expect(result.engagement.status).toBe("completed"); expect(result.completion?.deliverables).toHaveLength(0); expect(result.completion?.initiation.source.kind).toBe("direct");
});
it("J06 multiple advisory reviews preserve history without closing delivery; health/demand/renewal stay simulated", async () => {
  const review = { kind: "monthly" as const, scheduledAt: new Date().toISOString(), calendarReference: "mock://calendar", summary: "Review adoption, not proof of customer value", customerFeedback: "Input quality still uncertain", nextActions: "Investigate unmet requirement", participants: ["customer"], evidence: "mock://monthly", comment: "Periodic review, not closure" };
  await E.review(M, HOTEL, review); const original = first((await E.get(M, HOTEL)).workspace.reviews);
  await E.review(M, HOTEL, { ...review, summary: "Second monthly review" });
  let v = await E.concern(M, HOTEL, { workstreamId: STREAM, kind: "gap", description: "Unmet conditional custom ERP import requirement", category: "Integration", likelihood: "unknown", impact: "medium", ownerProfessionalId: "pro_rohan", response: "Investigate feasibility; no implementation promise", alternatives: "Manual import", reviewDate: "2026-12-01", evidence: ["mock://gap"], verification: "professional_observation" });
  const gap = first(v.workspace.concerns); await E.demand(M, HOTEL, gap.id, "phase7-demand", "Conditional custom ERP import feasibility");
  v = await E.continuation(M, HOTEL, { kind: "renewal", recommendation: "Consider further advisory after customer review", customerNeed: "Improve data quality", evidence: ["mock://need"] });
  await E.handoffContinuation(M, HOTEL, first(v.workspace.continuations).id, "phase7-renewal");
  v = await E.get(M, HOTEL); expect(v.engagement.status).toBe("active"); expect(first(v.workspace.reviews)).toEqual(original); expect(first(v.workspace.continuations).obligation).toBe(false);
  expect((await deliveryAdapters.signals("mock://customer")).simulated).toBe(true);
  expect(store.table("deliveryOperations").every((op) => op.reference.startsWith("mock://"))).toBe(true);
});
it("J10 failed acknowledged task commitment survives reload and same-key retry without duplication", async () => {
  const f = faults(); const original = canonical((await E.get(M, HOTEL)).workspace.tasks);
  mockControls.failing.add("delivery_task");
  const input = { key: "phase7-recovery", workstreamId: STREAM, milestoneId: "", title: "Fictional recoverable task" };
  await expect(E.task(M, HOTEL, input)).rejects.toThrow();
  store.attach(f.backend); expect(canonical((await E.get(M, HOTEL)).workspace.tasks)).toBe(original);
  mockControls.failing.clear(); await E.task(M, HOTEL, input); await E.task(M, HOTEL, input);
  store.attach(f.backend); expect((await E.get(M, HOTEL)).workspace.tasks).toHaveLength(1);
  await N.status(A, "pro_rohan", "suspended", "mock://suspend", "Suspend governed operations");
  await expect(E.task(M, HOTEL, { ...input, key: "suspended-operation" })).rejects.toThrow();
});
it("J07 independently approved supersession retains original obligation and idempotent application never duplicates it", async () => {
  await readyCompletion();
  const prior = await E.get(M, HOTEL), obligation = first(prior.obligations);
  await E.change(M, HOTEL, {
    requested: "Additional conditional integration investigation", reason: "Fictional customer authorized a revised report", impact: "Replace only the named reporting commitment", scheduleImpact: "Within agreed period", commercialImpact: "No commercial change", terms: first(prior.scopes).terms, revisedProposalVersionId: "",
    obligationAmendments: [{ obligationId: obligation.id, action: "supersede", description: "Revised integration feasibility report", criteria: "Customer acknowledges revised interface uncertainty report", reason: "Explicit changed criterion" }],
  });
  const change = first((await E.get(M, HOTEL)).workspace.changes);
  await expect(E.approveChange(M, HOTEL, change.id, "approved", "mock://self", "Own amendment")).rejects.toThrow("Independent");
  await E.approveChange(A, HOTEL, change.id, "approved", "mock://approval", "Independent obligation-specific amendment");
  await E.applyChange(A, HOTEL, change.id);
  const once = await E.get(M, HOTEL);
  expect((await E.applyChange(A, HOTEL, change.id)).scopes).toEqual(once.scopes);
  expect((await E.get(M, HOTEL)).scopes).toHaveLength(2);
  expect(once.initiation).toEqual(prior.initiation);
  expect(once.obligations.find((o) => o.id === obligation.id)?.status).toBe("superseded_by_amendment");
  expect(once.obligations.filter((o) => o.replacesId === obligation.id)).toHaveLength(1);
  await expect(E.complete(A, HOTEL, completionInput)).rejects.toThrow("stale");
});
it("J08 120 to 80 to 180 minutes preserves verified observations, blocks the old review and honestly completes after fresh review", async () => {
  const backend = faults().backend;
  await readyCompletion();
  const before = await E.get(M, HOTEL), measurement = first(first(before.workspace.outcomes).measurements);
  await E.verifyMeasurement(A, HOTEL, O, measurement.id, "mock://verify80", "Verify exact 80-minute result");
  await E.review(M, HOTEL, { kind: "completion", scheduledAt: new Date().toISOString(), calendarReference: "mock://calendar", summary: "120 to 80, target 60 unmet", customerFeedback: completionInput.customerFeedback, nextActions: completionInput.outstandingResponsibilities, outstandingResponsibilities: completionInput.outstandingResponsibilities, participants: ["customer"], evidence: "mock://review80", comment: "Intermediate exact state" });
  const oldReview = (await E.get(M, HOTEL)).workspace.reviews.at(-1);
  let view = await E.measure(M, HOTEL, O, { value: 180, observedAt: new Date().toISOString(), qualitative: "Unfavorable later observation", source: "Fictional customer observation", provenance: "customer_reported", evidence: ["mock://180"] }, "not_achieved", "Reporting now takes 180 minutes, target 60 not achieved");
  const later = first(view.workspace.outcomes).measurements.at(-1); if (!later) throw Error("Missing observation");
  await E.verifyMeasurement(A, HOTEL, O, later.id, "mock://verify180", "Verify exact unfavorable observation");
  await expect(E.complete(A, HOTEL, completionInput)).rejects.toThrow("stale");
  await E.review(M, HOTEL, { kind: "completion", scheduledAt: new Date().toISOString(), calendarReference: "mock://calendar", summary: "Unachieved outcome reviewed honestly", customerFeedback: completionInput.customerFeedback, nextActions: completionInput.outstandingResponsibilities, outstandingResponsibilities: completionInput.outstandingResponsibilities, participants: ["customer"], evidence: "mock://review180", comment: "Fresh unsuccessful outcome review" });
  view = await E.complete(A, HOTEL, { ...completionInput, summary: "Agreed service completed; reporting worsened from 120 to 180 minutes; target 60 unachieved" });
  expect(first(view.completion?.outcomes ?? []).measurements.map((m) => m.value)).toEqual([80, 180]);
  expect(first(view.completion?.outcomes ?? []).status).toBe("not_achieved");
  expect(view.completion?.reviews).toContainEqual(oldReview);
  store.attach(backend); expect((await E.get(A, HOTEL)).completion).toEqual(view.completion);
});
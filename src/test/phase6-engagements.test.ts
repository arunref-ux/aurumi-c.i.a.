import { beforeEach, describe, expect, it, vi } from "vitest";
import { engagementService as E } from "@/data/delivery";
import { networkService as N, deliveryControls } from "@/data/network";
import { store } from "@/data/store";
import { repos } from "@/data/repositories";
import { deliveryAdapters } from "@/integrations/adapters/delivery";
import { acceptedVersion, improvement, workspaceProblems } from "@/domain/delivery";
import { issuedProposal, readyProposal } from "./proposal-fixtures";
import {
  reset,
  M,
  A,
  P,
  R,
  PM,
  PARTNER,
  HOTEL,
  STREAM,
  D,
  MS,
  O,
  creation,
  first,
  readyCompletion,
  completionInput,
} from "./delivery-fixtures";
beforeEach(reset);
describe("Phase 6 authorized origins and lifecycle", () => {
  it("creates an authorized direct draft without fabricating a proposal", async () => {
    const v = await E.create(M, creation());
    expect(v.engagement.status).toBe("draft");
    expect(v.engagement.proposalId).toBe("");
    expect(v.initiation?.source.kind).toBe("direct");
    expect(v.workspace.authorization).toBeNull();
  });
  it("rejects unauthorized direct service and missing authorization", async () => {
    await expect(E.create(P, creation())).rejects.toThrow();
    await expect(E.create(M, creation({ authorizationEvidence: "" }))).rejects.toThrow();
    expect(store.table("deliveryOperations")).toHaveLength(0);
  });
  it("creates once for concurrent requests with the same stable operation", async () => {
    const input = creation();
    const [a, b] = await Promise.all([E.create(M, input), E.create(M, input)]);
    expect(a.engagement.id).toBe(b.engagement.id);
    expect(store.table("engagements").filter((e) => e.title === input.title)).toHaveLength(1);
    expect(store.table("deliveryOperations")).toHaveLength(1);
  });
  it("retry never changes customer or source actor", async () => {
    await E.create(M, creation());
    await expect(E.create(M, creation({ customerName: "Different customer" }))).rejects.toThrow(
      "original source",
    );
    await expect(E.create(A, creation())).rejects.toThrow("original source");
  });
  it("pins the exact eligible issued proposal and preserves historical proposal content", async () => {
    const r = await issuedProposal(),
      version = first(store.table("proposalVersions"));
    const prior = structuredClone(version);
    const total = first(version.document.commercials.summary.totals);
    const input = creation({
      origin: "proposal",
      customerName: version.document.recipient.organization || version.document.recipient.name,
      proposalVersionId: version.id,
      allocationId: "authorized-implementation-portion",
      terms: { ...creation().terms, currency: total.currency, amount: total.initialCost },
    });
    const v = await E.create(M, input);
    expect(v.initiation?.source.kind).toBe("proposal");
    if (v.initiation?.source.kind !== "proposal") throw Error("Missing pinned proposal");
    expect(v.initiation.source.version).toEqual(prior);
    expect(store.table("proposalVersions").find((v) => v.id === version.id)).toEqual(prior);
    expect(v.initiation.source.versionId).toBe(r.issued.id);
  });
  it("rejects unissued versions and nonexistent proposal IDs", async () => {
    const r = await readyProposal();
    await expect(
      E.create(
        M,
        creation({ origin: "proposal", proposalVersionId: r.p.id, allocationId: "allocation" }),
      ),
    ).rejects.toThrow("issued");
    await expect(
      E.create(
        M,
        creation({ origin: "proposal", proposalVersionId: "missing", allocationId: "allocation" }),
      ),
    ).rejects.toThrow();
  });
  it("proposal commercials cannot be silently substituted", async () => {
    const r = await issuedProposal();
    await expect(
      E.create(
        M,
        creation({
          origin: "proposal",
          customerName:
            r.issued.document.recipient.organization || r.issued.document.recipient.name,
          proposalVersionId: r.issued.id,
          allocationId: "allocation",
          terms: { ...creation().terms, amount: 1 },
        }),
      ),
    ).rejects.toThrow("commercials");
  });
  it("requires explicit proposal allocation and rejects duplicate allocation", async () => {
    const r = await issuedProposal(),
      v = r.issued,
      total = first(v.document.commercials.summary.totals);
    const input = creation({
      origin: "proposal",
      proposalVersionId: v.id,
      customerName: v.document.recipient.organization || v.document.recipient.name,
      allocationId: "allocation",
      terms: { ...creation().terms, currency: total.currency, amount: total.initialCost },
    });
    await expect(E.create(M, { ...input, allocationId: "" })).rejects.toThrow("allocation");
    await E.create(M, input);
    await expect(E.create(M, { ...input, operationKey: "second" })).rejects.toThrow(
      "allocation already",
    );
  });
  it("follow-on provenance binds prior initiation and the same customer", async () => {
    const previous = await E.get(M, HOTEL);
    const v = await E.create(
      M,
      creation({
        origin: "follow_on",
        previousEngagementId: HOTEL,
        customerReference: previous.overview.customerReference,
        customerName: previous.overview.customerName,
      }),
    );
    expect(v.initiation?.source.kind).toBe("follow_on");
    if (v.initiation?.source.kind !== "follow_on") throw Error("Missing source");
    expect(v.initiation.source.previousInitiationValue).toBe(previous.initiation?.integrityValue);
    await expect(
      E.create(
        M,
        creation({ origin: "follow_on", previousEngagementId: HOTEL, operationKey: "other" }),
      ),
    ).rejects.toThrow("customer");
  });
  it("commencement is explicit and legal transitions are enforced", async () => {
    let v = await E.create(M, creation());
    await expect(
      E.transition(M, v.engagement.id, "active", "mock://auth", "Skip authorization"),
    ).rejects.toThrow("Invalid");
    v = await E.transition(
      M,
      v.engagement.id,
      "pending_authorization",
      "mock://request",
      "Submit request",
    );
    v = await E.transition(
      M,
      v.engagement.id,
      "authorized",
      "mock://auth",
      "Explicit commencement",
    );
    expect(v.workspace.authorization?.evidence).toBe("mock://auth");
    v = await E.transition(
      M,
      v.engagement.id,
      "mobilizing",
      "mock://mobilize",
      "Start mobilization",
    );
    v = await E.transition(M, v.engagement.id, "active", "mock://active", "Mobilization complete");
    expect(v.engagement.status).toBe("active");
  });
  it("professional cannot authorize commencement or completion", async () => {
    await expect(
      E.transition(P, HOTEL, "completion_review", "mock://decision", "Self authorize"),
    ).rejects.toThrow();
    await expect(E.complete(P, HOTEL, completionInput)).rejects.toThrow();
  });
  it("hold, resume and cancellation require authorized recorded decisions", async () => {
    let v = await E.transition(M, HOTEL, "on_hold", "mock://hold", "Customer access delayed");
    expect(v.workspace.holdReason).toBe("Customer access delayed");
    v = await E.transition(M, HOTEL, "active", "mock://resume", "Access restored");
    expect(v.engagement.status).toBe("active");
    v = await E.transition(M, HOTEL, "cancelled", "mock://cancel", "Customer cancelled");
    expect(v.workspace.cancellation?.comment).toBe("Customer cancelled");
    await expect(
      E.transition(M, HOTEL, "active", "mock://restart", "Undo cancellation"),
    ).rejects.toThrow();
  });
  it("generic repositories cannot change governed engagement lifecycle", () => {
    expect(() => repos.engagements.update(M, HOTEL, { status: "completed" })).toThrow("workflow");
  });
  it("stale canonical role changes reject actual commitment", async () => {
    deliveryControls.latencyMs = 25;
    const wait = E.interaction(M, HOTEL, {
      workstreamId: STREAM,
      type: "advisory",
      at: new Date().toISOString(),
      participants: ["customer"],
      summary: "Observation",
      decisions: "",
      followUps: "",
      evidence: [],
      messengerReference: "",
      calendarReference: "",
    });
    store.replace(
      "users",
      store.table("users").map((u) => (u.id === M.user.id ? { ...u, roles: [] } : u)),
    );
    await expect(wait).rejects.toThrow();
    expect(first(store.table("deliveryWorkspaces")).interactions).toHaveLength(0);
  });
  it("suspension during an await revokes the final write", async () => {
    deliveryControls.latencyMs = 25;
    const wait = E.interaction(P, HOTEL, {
      workstreamId: STREAM,
      type: "advisory",
      at: new Date().toISOString(),
      participants: ["customer"],
      summary: "Observation",
      decisions: "",
      followUps: "",
      evidence: [],
      messengerReference: "",
      calendarReference: "",
    });
    store.replace(
      "networkProfiles",
      store
        .table("networkProfiles")
        .map((p) => (p.id === "pro_ananya" ? { ...p, status: "suspended" } : p)),
    );
    await expect(wait).rejects.toThrow();
    expect(first(store.table("deliveryWorkspaces")).interactions).toHaveLength(0);
  });
  it("cross-organization direct service calls fail closed", async () => {
    await expect(
      E.get({ user: { ...A.user, organizationId: "org_other" } }, HOTEL),
    ).rejects.toThrow();
  });
});
describe("Phase 6 delivery, version acceptance and change control", () => {
  it("responsible professionals must belong to this engagement", async () => {
    await expect(
      E.outcome(M, HOTEL, {
        objective: "Unassigned observation",
        definition: "Same metric",
        unit: "minutes",
        type: "quantitative",
        baseline: null,
        baselineDescription: "",
        baselineEvidence: [],
        target: 1,
        targetDescription: "",
        direction: "decrease",
        frequency: "Monthly",
        ownerProfessionalId: "pro_liam",
      }),
    ).rejects.toThrow("not part");
  });
  it("workstream completion requires its required accepted delivery commitments", async () => {
    await expect(E.workstreamStatus(M, HOTEL, STREAM, "completed")).rejects.toThrow("incomplete");
    await E.workstreamStatus(M, HOTEL, STREAM, "blocked");
    expect(first((await E.get(M, HOTEL)).workspace.workstreams).status).toBe("blocked");
  });
  it("governed generic reads cannot bypass suspended professional checks", async () => {
    await N.status(A, "pro_ananya", "suspended", "mock://approval", "Suspended delivery access");
    expect(repos.engagements.list(P).some((e) => e.id === HOTEL)).toBe(false);
    expect(() => repos.engagements.get(P, HOTEL)).toThrow();
  });
  it("adds workstreams and validates unresolved dependencies", async () => {
    const v = await E.workstream(M, HOTEL, {
      name: "Training",
      description: "Departmental adoption",
      ownerProfessionalId: "pro_rohan",
      start: "2026-11-24",
      end: "2026-12-01",
      dependencies: [STREAM],
    });
    expect(v.workspace.workstreams).toHaveLength(2);
    await expect(
      E.workstream(M, HOTEL, {
        name: "Bad dependency",
        description: "",
        ownerProfessionalId: "pro_rohan",
        start: "2026-11-24",
        end: "2026-12-01",
        dependencies: ["missing"],
      }),
    ).rejects.toThrow("dependency");
  });
  it("independent specialists cannot change another workstream", async () => {
    const v = await E.workstream(M, HOTEL, {
      name: "Commercial mobilization",
      description: "Restricted",
      ownerProfessionalId: "pro_rohan",
      start: "2026-11-24",
      end: "2026-12-01",
      dependencies: [],
    });
    const s = v.workspace.workstreams.at(-1);
    if (!s) throw Error("No stream");
    expect((await E.get(P, HOTEL)).workspace.workstreams.map((s) => s.id)).not.toContain(s.id);
    await expect(
      E.interaction(P, HOTEL, {
        workstreamId: s.id,
        type: "advisory",
        at: new Date().toISOString(),
        participants: ["customer"],
        summary: "Outside scope",
        decisions: "",
        followUps: "",
        evidence: [],
        messengerReference: "",
        calendarReference: "",
      }),
    ).rejects.toThrow();
  });
  it("milestones cannot complete before exact accepted prerequisites", async () => {
    await expect(E.milestoneStatus(M, HOTEL, MS, "completed", ["mock://evidence"])).rejects.toThrow(
      "prerequisites",
    );
    expect(first((await E.get(M, HOTEL)).workspace.milestones).status).toBe("planned");
  });
  it("version submission freezes content and author cannot independently accept own version", async () => {
    const v = await E.submitDeliverable(M, HOTEL, D),
      version = first(first(v.workspace.deliverables).versions);
    await expect(
      E.reviewDeliverable(
        M,
        HOTEL,
        D,
        version.id,
        "customer_acceptance",
        "accepted",
        "mock://accept",
        "Self acceptance",
      ),
    ).rejects.toThrow("independent");
    expect(version.integrityValue).toBeTruthy();
    await expect(
      E.reviewDeliverable(
        A,
        HOTEL,
        D,
        "missing-version",
        "customer_acceptance",
        "accepted",
        "mock://accept",
        "Wrong version",
      ),
    ).rejects.toThrow("exact");
  });
  it("acceptance binds exact current version and material edits do not reuse it", async () => {
    let v = await E.submitDeliverable(M, HOTEL, D),
      d = first(v.workspace.deliverables);
    const version = first(d.versions);
    await E.reviewDeliverable(
      A,
      HOTEL,
      D,
      version.id,
      "customer_acceptance",
      "accepted",
      "mock://accept",
      "Simulated customer acceptance",
    );
    v = await E.editDeliverable(M, HOTEL, D, {
      description: "Materially changed content",
      artifactReference: "mock://file-hub/revision",
    });
    d = first(v.workspace.deliverables);
    expect(d.status).toBe("draft");
    expect(acceptedVersion(d)).toBeUndefined();
    expect(first(d.versions)).toEqual(version);
    v = await E.submitDeliverable(M, HOTEL, D);
    expect(first(v.workspace.deliverables).versions).toHaveLength(2);
    expect(first(v.workspace.deliverables).reviews).toHaveLength(1);
  });
  it("an accepted completed milestone cannot be silently overwritten", async () => {
    await readyCompletion();
    await expect(
      E.editDeliverable(M, HOTEL, D, {
        description: "Changed after completion",
        artifactReference: "mock://changed",
      }),
    ).rejects.toThrow("silently superseded");
  });
  it("scope approval is independent and original initiation is preserved", async () => {
    const prior = await E.get(M, HOTEL),
      scope = first(prior.scopes);
    let v = await E.change(P, HOTEL, {
      requested: "Additional training",
      reason: "Customer adoption need",
      impact: "One extra training session",
      scheduleImpact: "No schedule change",
      commercialImpact: "No commercial change",
      terms: { ...scope.terms, included: "Original service plus authorized training" },
      revisedProposalVersionId: "",
    });
    const change = first(
      v.workspace.changes.length ? v.workspace.changes : (await E.get(M, HOTEL)).workspace.changes,
    );
    await expect(
      E.approveChange(P, HOTEL, change.id, "approved", "mock://approval", "Self approval"),
    ).rejects.toThrow();
    await E.approveChange(
      M,
      HOTEL,
      change.id,
      "approved",
      "mock://approval",
      "Scope amendment authorized",
    );
    v = await E.applyChange(M, HOTEL, change.id);
    expect(first(v.scopes)).toEqual(scope);
    expect(v.initiation).toEqual(prior.initiation);
    expect(v.scopes).toHaveLength(2);
    expect(v.workspace.changes[0]?.status).toBe("applied");
  });
  it("scope request author cannot approve their own amendment", async () => {
    const prior = await E.get(M, HOTEL);
    const v = await E.change(M, HOTEL, {
      requested: "Same price extension",
      reason: "Customer request",
      impact: "Additional week",
      scheduleImpact: "One week",
      commercialImpact: "None",
      terms: first(prior.scopes).terms,
      revisedProposalVersionId: "",
    });
    await expect(
      E.approveChange(
        M,
        HOTEL,
        first(v.workspace.changes).id,
        "approved",
        "mock://approval",
        "Approve own",
      ),
    ).rejects.toThrow("Independent");
  });
  it("task retries are duplicate-safe and carry a source-bound operation reference", async () => {
    const input = {
      key: "task-operation",
      workstreamId: STREAM,
      milestoneId: MS,
      title: "Review agreed findings",
    };
    await E.task(M, HOTEL, input);
    const v = await E.task(M, HOTEL, input);
    expect(v.workspace.tasks).toHaveLength(1);
    expect(first(v.workspace.tasks).simulated).toBe(true);
    expect(first(store.table("deliveryOperations")).state).toBe("complete");
  });
  it("continuation remains a recommendation without automatic contract", async () => {
    const v = await E.continuation(M, HOTEL, {
      kind: "advisory",
      recommendation: "Monthly adoption review",
      customerNeed: "Sustain operating process",
      evidence: ["mock://customer-feedback"],
    });
    expect(first(v.workspace.continuations).obligation).toBe(false);
    expect(store.table("proposals")).toHaveLength(4);
  });
});
describe("Phase 6 truthful outcomes and completion", () => {
  it("percentage improvement rejects missing/zero baselines and supports valid observed decrease", async () => {
    const o = first((await E.get(M, HOTEL)).workspace.outcomes);
    expect(improvement({ ...o, baseline: null }, 80)).toBeNull();
    expect(improvement({ ...o, baseline: 0 }, 80)).toBeNull();
    expect(improvement({ ...o, type: "qualitative" }, 80)).toBeNull();
    expect(improvement(o, 80)).toBeCloseTo(33.333, 2);
  });
  it("never presents estimates or unmet targets as achievement", async () => {
    await expect(
      E.measure(
        M,
        HOTEL,
        O,
        {
          observedAt: new Date().toISOString(),
          value: 80,
          qualitative: "",
          source: "Observed report",
          provenance: "customer_reported",
          evidence: ["mock://evidence"],
        },
        "achieved",
        "",
      ),
    ).rejects.toThrow("does not meet");
    await expect(
      E.measure(
        M,
        HOTEL,
        O,
        {
          observedAt: new Date().toISOString(),
          value: 50,
          qualitative: "",
          source: "Estimate only",
          provenance: "estimate",
          evidence: ["mock://estimate"],
        },
        "achieved",
        "",
      ),
    ).rejects.toThrow("not an estimate");
  });
  it("qualitative observations retain source and do not invent numbers", async () => {
    let v = await E.outcome(M, HOTEL, {
      objective: "Better reporting confidence",
      definition: "Monthly structured manager feedback",
      unit: "",
      type: "qualitative",
      baseline: null,
      baselineDescription: "Confidence initially low",
      baselineEvidence: ["mock://feedback"],
      target: null,
      targetDescription: "Better management confidence",
      direction: "qualitative",
      frequency: "Monthly",
      ownerProfessionalId: "pro_rohan",
    });
    const o = v.workspace.outcomes.at(-1);
    if (!o) throw Error("Missing outcome");
    v = await E.measure(
      M,
      HOTEL,
      o.id,
      {
        observedAt: new Date().toISOString(),
        value: null,
        qualitative: "Manager reports better confidence",
        source: "Structured customer interview",
        provenance: "customer_reported",
        evidence: ["mock://feedback"],
      },
      "partially_achieved",
      "Remaining data quality limitations",
    );
    expect(v.workspace.outcomes.at(-1)?.measurements[0]?.value).toBeNull();
  });
  it("missing baseline remains explicit and measurement history is append-only", async () => {
    const training = await E.get(M, "delivery_training");
    expect(first(training.workspace.outcomes).baseline).toBeNull();
    const o = first((await E.get(M, HOTEL)).workspace.outcomes);
    for (const value of [100, 80])
      await E.measure(
        M,
        HOTEL,
        o.id,
        {
          observedAt: new Date().toISOString(),
          value,
          qualitative: "",
          source: "Customer observation",
          provenance: "customer_reported",
          evidence: ["mock://observation"],
        },
        "in_progress",
        "",
      );
    expect(
      first((await E.get(M, HOTEL)).workspace.outcomes).measurements.map((m) => m.value),
    ).toEqual([100, 80]);
  });
  it("independent measurement verification requires observed evidence", async () => {
    let v = await E.measure(
      M,
      HOTEL,
      O,
      {
        observedAt: new Date().toISOString(),
        value: 80,
        qualitative: "",
        source: "Customer observation",
        provenance: "customer_reported",
        evidence: ["mock://observation"],
      },
      "partially_achieved",
      "Remaining cleanup",
    );
    const m = first(first(v.workspace.outcomes).measurements);
    await expect(
      E.verifyMeasurement(M, HOTEL, O, m.id, "mock://verification", "Self verification"),
    ).rejects.toThrow("Independent");
    v = await E.verifyMeasurement(
      A,
      HOTEL,
      O,
      m.id,
      "mock://verification",
      "Independent verification",
    );
    expect(first(first(v.workspace.outcomes).measurements).verification?.by).toBe("u_admin");
  });
  it("completion blocks missing required deliverables, actual results and review", async () => {
    await E.transition(M, HOTEL, "completion_review", "mock://request", "Request completion");
    await expect(E.complete(M, HOTEL, completionInput)).rejects.toThrow("Required");
  });
  it("honest partial outcomes can complete with immutable results and outstanding responsibility", async () => {
    await readyCompletion();
    const v = await E.complete(A, HOTEL, completionInput);
    expect(v.engagement.status).toBe("completed");
    expect(v.completion?.outcomes[0]?.status).toBe("partially_achieved");
    expect(v.completion?.outstandingResponsibilities).toBe(
      completionInput.outstandingResponsibilities,
    );
    const w = store.table("deliveryWorkspaces").find((w) => w.engagementId === HOTEL);
    expect(workspaceProblems(w)).toEqual([]);
    await expect(
      E.measure(
        M,
        HOTEL,
        O,
        {
          observedAt: new Date().toISOString(),
          value: 60,
          qualitative: "",
          source: "After close",
          provenance: "customer_reported",
          evidence: ["mock://source"],
        },
        "achieved",
        "",
      ),
    ).rejects.toThrow();
    expect((await E.complete(A, HOTEL, completionInput)).completion).toEqual(v.completion);
  });
});

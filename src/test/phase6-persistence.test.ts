import { beforeEach, describe, expect, it, vi } from "vitest";
import { engagementService as E } from "@/data/delivery";
import { networkService as N } from "@/data/network";
import { store, memoryBackend, STORAGE_KEY, QUARANTINE_KEY } from "@/data/store";
import { deliveryAdapters } from "@/integrations/adapters/delivery";
import { mockControls } from "@/integrations/adapters/mock";
import { seal, contentValue } from "@/domain/delivery";
import { canonical } from "@/domain/assessment";
import { issuedProposal } from "./proposal-fixtures";
import legacyOriginal from "./fixtures/legacy-e696c05-issued.json";
import legacyStrengthened from "./fixtures/legacy-8da73f4-issued.json";
import fitHistory from "./fixtures/phase5-ebe4033-converted.json";
import {
  reset,
  M,
  A,
  P,
  HOTEL,
  STREAM,
  D,
  MS,
  O,
  creation,
  first,
  faults,
  readyCompletion,
  completionInput,
} from "./delivery-fixtures";
beforeEach(reset);
const parsed = (value: string) => JSON.parse(value);
function reloadCorruption(edit: (saved: ReturnType<typeof parsed>) => void) {
  const b = memoryBackend();
  store.attach(b);
  store.durable(() => {});
  const serialized = b.read(STORAGE_KEY);
  if (!serialized) throw Error("No persisted state");
  const saved = parsed(serialized);
  edit(saved);
  b.write(STORAGE_KEY, JSON.stringify(saved));
  store.attach(b);
  return b;
}
describe("Phase 6 acknowledged persistence and retry recovery", () => {
  it("saved pending operation can be discovered and recovered after reload only by its bound actor", async () => {
    const f = faults();
    mockControls.failing.add("delivery_task");
    await expect(
      E.task(M, HOTEL, {
        key: "recover-ui",
        workstreamId: STREAM,
        milestoneId: MS,
        title: "Saved recovery task",
      }),
    ).rejects.toThrow();
    mockControls.failing.clear();
    store.attach(f.backend);
    const pending = first(await E.pendingOperations(M, HOTEL));
    expect(await E.pendingOperations(A, HOTEL)).toEqual([]);
    await expect(E.retryOperation(A, pending.id)).rejects.toThrow();
    await E.retryOperation(M, pending.id);
    expect((await E.get(M, HOTEL)).workspace.tasks).toHaveLength(1);
    expect(await E.pendingOperations(M, HOTEL)).toEqual([]);
  });
  it("missing attached persistence cannot report engagement creation", async () => {
    store.attach(null);
    await expect(E.create(M, creation())).rejects.toThrow("persistent storage is unavailable");
    expect(store.table("deliveryOperations")).toHaveLength(0);
  });
  it("failure before durable creation intent never creates engagement or operation", async () => {
    const f = faults();
    f.fail((k) => k === STORAGE_KEY);
    await expect(E.create(M, creation())).rejects.toThrow();
    expect(store.table("deliveryOperations")).toHaveLength(0);
    expect(store.table("engagements").filter((e) => e.title === creation().title)).toHaveLength(0);
  });
  it("local creation failure preserves intent and reload retry creates exactly one engagement", async () => {
    const f = faults();
    f.fail(
      (k, v) =>
        k === STORAGE_KEY &&
        parsed(v).tables.deliveryOperations.some((o: { state: string }) => o.state === "complete"),
    );
    await expect(E.create(M, creation())).rejects.toThrow();
    expect(f.saved().tables.deliveryOperations[0].state).toBe("pending");
    expect(
      f.saved().tables.engagements.some((e: { title: string }) => e.title === creation().title),
    ).toBe(false);
    f.repair();
    store.attach(f.backend);
    await E.create(M, creation());
    await E.create(M, creation());
    expect(
      f.saved().tables.engagements.filter((e: { title: string }) => e.title === creation().title),
    ).toHaveLength(1);
  });
  it("adapter failure preserves source-bound task intent for retry", async () => {
    const f = faults();
    mockControls.failing.add("delivery_task");
    const input = {
      key: "task-retry",
      workstreamId: STREAM,
      milestoneId: MS,
      title: "Review findings",
    };
    await expect(E.task(M, HOTEL, input)).rejects.toThrow("Simulated");
    expect(f.saved().tables.deliveryOperations[0].state).toBe("pending");
    mockControls.failing.clear();
    store.attach(f.backend);
    const v = await E.task(M, HOTEL, input);
    expect(v.workspace.tasks).toHaveLength(1);
  });
  it("failure after external side effect but before reference save reuses stable external identity", async () => {
    const f = faults(),
      refs: string[] = [];
    const original = deliveryAdapters.execute;
    vi.spyOn(deliveryAdapters, "execute").mockImplementation(async (...args) => {
      const r = await original(...args);
      refs.push(r.reference);
      return r;
    });
    f.fail(
      (k, v) =>
        k === STORAGE_KEY &&
        parsed(v).tables.deliveryOperations.some(
          (o: { state: string }) => o.state === "external_created",
        ),
    );
    const input = {
      key: "task-side-effect",
      workstreamId: STREAM,
      milestoneId: MS,
      title: "Customer review",
    };
    await expect(E.task(M, HOTEL, input)).rejects.toThrow();
    expect(f.saved().tables.deliveryOperations[0].state).toBe("pending");
    f.repair();
    store.attach(f.backend);
    await E.task(M, HOTEL, input);
    expect(new Set(refs).size).toBe(1);
    expect(first((await E.get(M, HOTEL)).workspace.tasks).reference).toBe(refs[0]);
  });
  it("reference-persisted local handoff failure retries without another adapter call", async () => {
    const f = faults(),
      spy = vi.spyOn(deliveryAdapters, "execute");
    f.fail(
      (k, v) =>
        k === STORAGE_KEY &&
        parsed(v).tables.deliveryWorkspaces.some((w: { tasks: unknown[] }) => w.tasks.length > 0),
    );
    const input = {
      key: "task-final",
      workstreamId: STREAM,
      milestoneId: MS,
      title: "Customer training",
    };
    await expect(E.task(M, HOTEL, input)).rejects.toThrow();
    expect(f.saved().tables.deliveryOperations[0].state).toBe("external_created");
    expect(first(store.table("deliveryWorkspaces")).tasks).toHaveLength(0);
    f.repair();
    store.attach(f.backend);
    const v = await E.task(M, HOTEL, input);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(v.workspace.tasks).toHaveLength(1);
    expect(f.saved().tables.deliveryOperations[0].state).toBe("complete");
  });
  it("retry with a different actor or source cannot recover another operation", async () => {
    const f = faults();
    mockControls.failing.add("delivery_task");
    const input = {
      key: "task-owner",
      workstreamId: STREAM,
      milestoneId: MS,
      title: "Authorized source",
    };
    await expect(E.task(M, HOTEL, input)).rejects.toThrow();
    mockControls.failing.clear();
    await expect(E.task(A, HOTEL, input)).rejects.toThrow("another source or actor");
    await expect(E.task(M, HOTEL, { ...input, title: "Other source" })).rejects.toThrow(
      "another source or actor",
    );
    expect(f.saved().tables.deliveryOperations[0].state).toBe("pending");
  });
  it("assignment removal during actual adapter await blocks the final commitment", async () => {
    const f = faults();
    let release: () => void = () => {};
    const wait = new Promise<void>((r) => {
      release = r;
    });
    const original = deliveryAdapters.execute;
    vi.spyOn(deliveryAdapters, "execute").mockImplementation(async (...args) => {
      await wait;
      return original(...args);
    });
    const pending = E.task(P, HOTEL, {
      key: "specialist-task",
      workstreamId: STREAM,
      milestoneId: MS,
      title: "Specialist validation",
    });
    const assignment = (await E.get(M, HOTEL)).workspace.assignments.find(
      (a) => a.userId === "u_pro",
    );
    if (!assignment) throw Error("No specialist assignment");
    await E.removeAssignment(
      M,
      HOTEL,
      assignment.id,
      "mock://end",
      "Specialist removed before handoff",
    );
    release();
    await expect(pending).rejects.toThrow();
    expect(f.saved().tables.deliveryWorkspaces[0].tasks).toHaveLength(0);
  });
  it("deliverable acceptance write failure cannot report accepted status", async () => {
    const f = faults();
    const v = await E.submitDeliverable(M, HOTEL, D),
      version = first(first(v.workspace.deliverables).versions);
    f.fail(
      (k, v) =>
        k === STORAGE_KEY &&
        parsed(v).tables.deliveryWorkspaces.some(
          (w: { engagementId: string; deliverables: { status: string }[] }) =>
            w.engagementId === HOTEL && w.deliverables.some((d) => d.status === "accepted"),
        ),
    );
    await expect(
      E.reviewDeliverable(
        A,
        HOTEL,
        D,
        version.id,
        "customer_acceptance",
        "accepted",
        "mock://accept",
        "Customer accepted",
      ),
    ).rejects.toThrow();
    expect(f.saved().tables.deliveryWorkspaces[0].deliverables[0].status).toBe("submitted");
    f.repair();
    store.attach(f.backend);
    await E.reviewDeliverable(
      A,
      HOTEL,
      D,
      version.id,
      "customer_acceptance",
      "accepted",
      "mock://accept",
      "Customer accepted",
    );
    expect(f.saved().tables.deliveryWorkspaces[0].deliverables[0].reviews).toHaveLength(1);
  });
  it("scope amendment failure retains approved request and original scope", async () => {
    const f = faults(),
      prior = await E.get(M, HOTEL),
      terms = first(prior.scopes).terms;
    await E.change(P, HOTEL, {
      requested: "Extra training",
      reason: "Adoption need",
      impact: "One more session",
      scheduleImpact: "",
      commercialImpact: "",
      terms: { ...terms, included: `${terms.included}; extra training` },
      revisedProposalVersionId: "",
    });
    const change = first((await E.get(M, HOTEL)).workspace.changes);
    await E.approveChange(
      M,
      HOTEL,
      change.id,
      "approved",
      "mock://approval",
      "Separately approved scope extension",
    );
    f.fail(
      (k, v) =>
        k === STORAGE_KEY &&
        parsed(v).tables.deliveryWorkspaces.some((w: { scopes: unknown[] }) => w.scopes.length > 1),
    );
    await expect(E.applyChange(M, HOTEL, change.id)).rejects.toThrow();
    expect(f.saved().tables.deliveryWorkspaces[0].scopes).toHaveLength(1);
    expect(f.saved().tables.deliveryWorkspaces[0].changes[0].status).toBe("approved");
    f.repair();
    store.attach(f.backend);
    await E.applyChange(M, HOTEL, change.id);
    await E.applyChange(M, HOTEL, change.id);
    expect(f.saved().tables.deliveryWorkspaces[0].scopes).toHaveLength(2);
  });
  it("completion failure preserves prior saved state and retries exactly one snapshot", async () => {
    const f = faults();
    await readyCompletion();
    f.fail(
      (k, v) =>
        k === STORAGE_KEY &&
        parsed(v).tables.deliveryWorkspaces.some(
          (w: { engagementId: string; completion: unknown }) =>
            w.engagementId === HOTEL && w.completion !== null,
        ),
    );
    await expect(E.complete(A, HOTEL, completionInput)).rejects.toThrow();
    expect(f.saved().tables.deliveryWorkspaces[0].completion).toBeNull();
    expect(f.saved().tables.engagements.find((e: { id: string }) => e.id === HOTEL).status).toBe(
      "completion_review",
    );
    f.repair();
    store.attach(f.backend);
    const v = await E.complete(A, HOTEL, completionInput);
    await E.complete(A, HOTEL, completionInput);
    expect(f.saved().tables.deliveryWorkspaces[0].completion.id).toBe(v.completion?.id);
  });
  it("network save failure preserves previous professional status", async () => {
    const f = faults();
    f.fail(
      (k, v) =>
        k === STORAGE_KEY &&
        parsed(v).tables.networkProfiles.some(
          (p: { id: string; status: string }) => p.id === "pro_ananya" && p.status === "suspended",
        ),
    );
    await expect(
      N.status(A, "pro_ananya", "suspended", "mock://suspend", "Suspend access"),
    ).rejects.toThrow();
    expect((await N.get(A, "pro_ananya")).status).toBe("active");
  });
});
describe("Phase 6 strict restoration and independent sibling preservation", () => {
  it.each([
    [
      "engagement identity",
      (s: ReturnType<typeof parsed>) => {
        s.tables.engagements.find((e: { id: string }) => e.id === HOTEL).id =
          "corrupted-engagement";
      },
    ],
    [
      "organization identity",
      (s: ReturnType<typeof parsed>) => {
        s.tables.deliveryWorkspaces[0].organizationId = "org_other";
      },
    ],
    [
      "initiation customer",
      (s: ReturnType<typeof parsed>) => {
        s.tables.deliveryWorkspaces[0].initiation.customer.name = "Changed customer";
      },
    ],
    [
      "scope content",
      (s: ReturnType<typeof parsed>) => {
        s.tables.deliveryWorkspaces[0].scopes[0].terms.amount = 1;
      },
    ],
    [
      "unknown integrity marker",
      (s: ReturnType<typeof parsed>) => {
        s.tables.deliveryWorkspaces[0].initiation.integrityContract =
          "aurumi.cia.delivery-content/unknown";
      },
    ],
    [
      "missing integrity marker",
      (s: ReturnType<typeof parsed>) => {
        delete s.tables.deliveryWorkspaces[0].initiation.integrityContract;
      },
    ],
    [
      "assignment professional",
      (s: ReturnType<typeof parsed>) => {
        s.tables.deliveryWorkspaces[0].assignments[0].professionalId = "missing";
      },
    ],
    [
      "assignment user",
      (s: ReturnType<typeof parsed>) => {
        s.tables.deliveryWorkspaces[0].assignments[0].userId = "u_admin";
      },
    ],
    [
      "assignment organization",
      (s: ReturnType<typeof parsed>) => {
        s.tables.deliveryWorkspaces[0].assignments[0].organizationId = "org_other";
      },
    ],
    [
      "assignment access mirror",
      (s: ReturnType<typeof parsed>) => {
        s.tables.engagements
          .find((e: { id: string }) => e.id === HOTEL)
          .assignedUserIds.push("u_admin");
      },
    ],
    [
      "outcome measurement reference",
      (s: ReturnType<typeof parsed>) => {
        s.tables.deliveryWorkspaces[0].outcomes[0].measurements = [
          {
            ...s.tables.deliveryWorkspaces[5].outcomes[0].measurements[0],
            engagementId: HOTEL,
            outcomeId: "missing",
          },
        ];
      },
    ],
  ] as const)(
    "quarantines altered %s without deleting independent valid siblings",
    async (_name, edit) => {
      const b = reloadCorruption(edit);
      expect(store.table("deliveryWorkspaces").some((w) => w.engagementId === HOTEL)).toBe(false);
      expect((await E.get(M, "delivery_completed")).completion?.outcomes[0]?.status).toBe(
        "partially_achieved",
      );
      expect(b.read(QUARANTINE_KEY)).toBeTruthy();
      expect(store.table("engagements").some((e) => e.id === "eng_e")).toBe(true);
    },
  );
  it("quarantines altered embedded issued proposal without rewriting history", async () => {
    const liveBackend = memoryBackend();
    store.attach(liveBackend); // Build exact proposal-origin fixture anew; never mutate production readonly fields.
    const next = await issuedProposal(),
      nextTotal = first(next.issued.document.commercials.summary.totals);
    const created = await E.create(
      M,
      creation({
        origin: "proposal",
        customerName:
          next.issued.document.recipient.organization || next.issued.document.recipient.name,
        proposalVersionId: next.issued.id,
        allocationId: "exact-source",
        terms: { ...creation().terms, currency: nextTotal.currency, amount: nextTotal.initialCost },
      }),
    );
    const encoded = liveBackend.read(STORAGE_KEY);
    if (!encoded) throw Error("No fixture");
    const data = parsed(encoded);
    const row = data.tables.deliveryWorkspaces.find(
      (w: { engagementId: string }) => w.engagementId === created.engagement.id,
    );
    row.initiation.source.version.document.solution.catalog.items[0].name =
      "Altered embedded capability";
    liveBackend.write(STORAGE_KEY, JSON.stringify(data));
    store.attach(liveBackend);
    expect(
      store.table("deliveryWorkspaces").some((w) => w.engagementId === created.engagement.id),
    ).toBe(false);
    expect(canonical(store.table("proposalVersions").find((v) => v.id === next.issued.id))).toBe(
      canonical(next.issued),
    );
    expect(
      store.table("deliveryWorkspaces").some((w) => w.engagementId === "delivery_completed"),
    ).toBe(true);
  });
  it.each(["deliverable version", "acceptance version", "completion content"] as const)(
    "quarantines altered %s while valid siblings survive",
    async (kind) => {
      const f = faults();
      await readyCompletion();
      await E.complete(A, HOTEL, completionInput);
      const s = f.saved(),
        w = s.tables.deliveryWorkspaces[0];
      if (kind === "deliverable version") w.deliverables[0].versions[0].description = "Altered";
      if (kind === "acceptance version") w.deliverables[0].reviews[0].versionId = "missing-version";
      if (kind === "completion content") w.completion.executiveSummary = "Changed settled history";
      f.backend.write(STORAGE_KEY, JSON.stringify(s));
      store.attach(f.backend);
      expect(store.table("deliveryWorkspaces").some((w) => w.engagementId === HOTEL)).toBe(false);
      expect((await E.get(M, "delivery_completed")).completion).not.toBeNull();
    },
  );
  it("changed approved amendment cannot become an authorized new scope", async () => {
    const f = faults(),
      terms = first((await E.get(M, HOTEL)).scopes).terms;
    await E.change(P, HOTEL, {
      requested: "Additional session",
      reason: "Customer request",
      impact: "Training extension",
      scheduleImpact: "",
      commercialImpact: "",
      terms,
      revisedProposalVersionId: "",
    });
    const c = first((await E.get(M, HOTEL)).workspace.changes);
    await E.approveChange(
      M,
      HOTEL,
      c.id,
      "approved",
      "mock://approval",
      "Approved exact amendment",
    );
    const s = f.saved();
    s.tables.deliveryWorkspaces[0].changes[0].terms.amount = 1;
    f.backend.write(STORAGE_KEY, JSON.stringify(s));
    store.attach(f.backend);
    expect(store.table("deliveryWorkspaces").some((w) => w.engagementId === HOTEL)).toBe(false);
  });
  it("repeated valid reloads preserve immutable initiation and completed history byte-for-byte", async () => {
    const f = faults();
    await E.continuation(M, HOTEL, {
      kind: "advisory",
      recommendation: "Future advisory",
      customerNeed: "Sustain adoption",
      evidence: ["mock://feedback"],
    });
    const initiation = canonical((await E.get(M, HOTEL)).initiation),
      completion = canonical((await E.get(M, "delivery_completed")).completion);
    for (let i = 0; i < 3; i++) {
      store.attach(f.backend);
      expect(canonical((await E.get(M, HOTEL)).initiation)).toBe(initiation);
      expect(canonical((await E.get(M, "delivery_completed")).completion)).toBe(completion);
    }
    expect(store.persistence().quarantined).toBe(0);
  });
  it("failed quarantine backup protects original storage and rejects further writes", async () => {
    const f = faults();
    await E.continuation(M, HOTEL, {
      kind: "advisory",
      recommendation: "Advisory",
      customerNeed: "Quality",
      evidence: ["mock://evidence"],
    });
    const s = f.saved();
    s.tables.deliveryWorkspaces[0].initiation.terms.amount = 1;
    const original = JSON.stringify(s);
    f.backend.write(STORAGE_KEY, original);
    f.fail((k) => k === QUARANTINE_KEY);
    store.attach(f.backend);
    expect(f.backend.read(STORAGE_KEY)).toBe(original);
    await expect(E.create(M, creation())).rejects.toThrow();
    expect(() => store.reset()).toThrow();
    f.repair();
    store.retryRecovery();
    expect(f.backend.read(QUARANTINE_KEY)).toBeTruthy();
    expect(
      store.table("deliveryWorkspaces").some((w) => w.engagementId === "delivery_completed"),
    ).toBe(true);
  });
  it.each([
    ["original proposal hash", legacyOriginal],
    ["strengthened historical proposal hash", legacyStrengthened],
    ["Phase 5 converted intake", fitHistory],
  ] as const)(
    "preserves compatible %s when adding new Phase 6 sample records",
    (_name, fixture) => {
      const b = memoryBackend();
      const envelope = "envelope" in fixture ? fixture.envelope : fixture;
      const copy = canonical(envelope);
      b.write(STORAGE_KEY, JSON.stringify(envelope));
      store.attach(b);
      expect(store.table("deliveryWorkspaces")).toHaveLength(6);
      expect(canonical(envelope)).toBe(copy);
      expect(store.table("engagements").some((e) => e.id === "eng_e")).toBe(true);
      if ("versionId" in fixture)
        expect(store.table("proposalVersions").find((v) => v.id === fixture.versionId)).toEqual(
          fixture.envelope.tables.proposalVersions.find((v) => v.id === fixture.versionId),
        );
    },
  );
});

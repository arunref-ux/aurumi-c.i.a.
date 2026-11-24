import { beforeEach, expect, it } from "vitest";
import { store, memoryBackend, STORAGE_KEY } from "@/data/store";
import { engagementService as E } from "@/data/delivery";
import { reset, M } from "./delivery-fixtures";
import original from "./fixtures/phase7-released-25909e3-issued.json";
import marked from "./fixtures/phase7-released-aa406c5-issued.json";
import compatibility from "./fixtures/phase7-released-e49e770-issued.json";
import businessFit from "./fixtures/phase7-released-9e19f209-business-fit.json";
import strengthened from "./fixtures/phase7-released-47ec5df-delivery.json";

beforeEach(() => {
  reset();
  store.reset();
});
it.each([
  ["25909e3", original],
  ["aa406c5", marked],
  ["e49e770", compatibility],
  ["9e19f209", businessFit],
  ["47ec5df", strengthened],
] as const)(
  "restores genuine released %s immutable content and pending operations unchanged over three reloads",
  (_name, fixture) => {
    const backend = memoryBackend();
    backend.write(STORAGE_KEY, JSON.stringify(fixture.envelope));
    const tables = fixture.envelope.tables as unknown as Record<string, unknown[]>;
    for (let reload = 0; reload < 3; reload++) {
      store.attach(backend);
      expect(store.persistence().protected).toBe(false);
      expect(store.persistence().quarantined).toBe(0);
      for (const key of [
        "snapshots",
        "solutionSnapshots",
        "proposalVersions",
        "fitSnapshots",
        "fitConsultations",
        "deliveryWorkspaces",
        "deliveryOperations",
      ] as const) {
        if (tables[key]?.length) expect(store.table(key)).toEqual(tables[key]);
      }
    }
  },
);
it("recovers a genuine strengthened released failed task with the same operation identity, without fabricating history", async () => {
  const backend = memoryBackend();
  backend.write(STORAGE_KEY, JSON.stringify(strengthened.envelope));
  store.attach(backend);
  const before = store
    .table("deliveryOperations")
    .find((o) => o.key === "released-strengthened-recovery");
  if (!before) throw Error("Missing actual released pending task");
  await E.task(M, "delivery_distribution", {
    key: before.key,
    workstreamId: "workstream_delivery_distribution",
    milestoneId: "",
    title: "Fictional recoverable released task",
  });
  store.attach(backend);
  const after = store.table("deliveryOperations").filter((o) => o.key === before.key);
  expect(after).toHaveLength(1);
  expect(after[0]?.id).toBe(before.id);
  expect(after[0]?.state).toBe("complete");
  expect((await E.get(M, "delivery_distribution")).workspace.tasks).toHaveLength(1);
  expect((await E.get(M, "delivery_hotel")).completion).toEqual(
    strengthened.envelope.tables.deliveryWorkspaces.find((w) => w.engagementId === "delivery_hotel")
      ?.completion,
  );
});

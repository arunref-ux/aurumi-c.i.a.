import { beforeEach, describe, expect, it } from "vitest";
import { store, memoryBackend } from "@/data/store";
import { seedUsers } from "@/data/seed";
import { businessFitInternal as I } from "@/data/business-fit-internal";
import { loadDemoBusinessFit } from "@/data/demo-business-fit";

const MGR = { user: seedUsers.find((u) => u.id === "u_manager")! };
beforeEach(() => {
  store.attach(memoryBackend());
  store.reset();
});
describe("sample data loaders", () => {
  it("business fit sample creates four submissions in different states", async () => {
    await loadDemoBusinessFit();
    const rows = I.list(MGR);
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.intake.status))).toEqual(
      new Set(["qualified", "under_review", "new", "closed"]),
    );
  });
});

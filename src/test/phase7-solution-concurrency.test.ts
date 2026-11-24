import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { solutionStudio as S } from "@/data/solution-studio";
import { assessmentStudio as AS } from "@/data/assessment-studio";
import { solutionCatalog } from "@/integrations/adapters/solution-catalog";
import { store } from "@/data/store";
import { readySolution, PRO, MGR, resetSolutionTestState } from "./solution-fixtures";

beforeEach(resetSolutionTestState);
afterEach(() => vi.restoreAllMocks());
function holdCatalog() {
  const original = solutionCatalog.getSnapshot;
  let start = () => {},
    release = () => {};
  const entered = new Promise<void>((resolve) => {
    start = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(solutionCatalog, "getSnapshot").mockImplementationOnce(async () => {
    start();
    await gate;
    return original();
  });
  return { entered, release };
}
it("rejects delayed child writes rather than overwriting a newer Solution overview", async () => {
  const { sol } = await readySolution(),
    gate = holdCatalog();
  const pending = S.upsertChild(PRO, sol.id, "values", {
    description: "Delayed value",
    assumptionSource: "Fictional interview",
  });
  await gate.entered;
  await S.saveOverview(PRO, sol.id, { executiveSummary: "Newer canonical change must survive" });
  gate.release();
  await expect(pending).rejects.toThrow("changed");
  expect((await S.get(PRO, sol.id)).workspace.overview.executiveSummary).toBe(
    "Newer canonical change must survive",
  );
});
it("rejects delayed approval after the review was returned instead of approving stale state", async () => {
  const { sol } = await readySolution();
  await S.submitForReview(PRO, sol.id);
  const gate = holdCatalog(),
    pending = S.approve(MGR, sol.id, "Independent review");
  await gate.entered;
  await S.returnForRevision(MGR, sol.id, "Correct current assumptions");
  gate.release();
  await expect(pending).rejects.toThrow("changed");
  expect((await S.get(PRO, sol.id)).solution.status).toBe("returned");
  expect(store.table("solutionSnapshots")).toHaveLength(0);
});
it("rejects delayed rebase if the editable solution was submitted for review during catalog retrieval", async () => {
  const { sol, a } = await readySolution();
  await AS.reopen(MGR, a.id, "New baseline findings");
  await AS.saveFindings(PRO, a.id, { nextSteps: "Updated findings" });
  await AS.submitForReview(PRO, a.id);
  const snapshot = await AS.approve(MGR, a.id),
    gate = holdCatalog();
  const pending = S.rebase(PRO, sol.id, snapshot.id, "Explicit baseline change");
  await gate.entered;
  await S.submitForReview(PRO, sol.id);
  gate.release();
  await expect(pending).rejects.toThrow("changed");
  const view = await S.get(PRO, sol.id);
  expect(view.solution.revision).toBe(1);
  expect(view.solution.baseline.snapshotId).toBe(sol.baseline.snapshotId);
  expect(view.solution.status).toBe("in_review");
});

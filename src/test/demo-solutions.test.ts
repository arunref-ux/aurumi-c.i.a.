import { beforeEach, expect, it } from "vitest";
import { loadDemoSolutions } from "@/data/demo-solutions";
import { solutionStudio as S } from "@/data/solution-studio";
import { store } from "@/data/store";
import { resetSolutionTestState, ADMIN } from "./solution-fixtures";

beforeEach(() => {
  resetSolutionTestState();
  store.attach(null);
});

it("loads three reference solutions in approved, review and draft states", async () => {
  await loadDemoSolutions();
  const list = await S.list(ADMIN);
  expect(list.map((r) => r.solution.status).sort()).toEqual(["approved", "draft", "in_review"]);
});

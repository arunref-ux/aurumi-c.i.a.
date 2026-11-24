import { beforeEach, expect, it } from "vitest";
import { sanitizeTable } from "@/data/persisted-schema";
import { solutionStudio as S } from "@/data/solution-studio";
import { solutionReadiness, emptyPartnerSolution, type SolutionWorkspace } from "@/domain/solution";
import { MOCK_CATALOG } from "@/integrations/adapters/solution-catalog";
import { readySolution, PRO, resetSolutionTestState } from "./solution-fixtures";
beforeEach(resetSolutionTestState);
it("quarantines malformed partner text before readiness calls trim, preserving the valid workspace and original corruption", async () => {
  const { sol, snap } = await readySolution(),
    ws = (await S.get(PRO, sol.id)).workspace;
  const corrupt = {
    ...ws,
    partner: {
      ...emptyPartnerSolution(),
      hypothesis: 7,
      technicalValidation: "Requires validation",
    },
  };
  const result = sanitizeTable("solutionWorkspaces", [corrupt]);
  expect(result.rows).toHaveLength(1);
  expect(result.quarantined).toContainEqual(
    expect.objectContaining({ path: "solutionWorkspaces[0].partner.hypothesis", value: 7 }),
  );
  const restored = result.rows[0] as SolutionWorkspace;
  expect(restored.recommendations).toEqual(ws.recommendations);
  expect(() =>
    solutionReadiness({ ...sol, kind: "partner" }, restored, snap, MOCK_CATALOG),
  ).not.toThrow();
  expect(restored.partner?.hypothesis).toBe("");
});
it("isolates malformed archived revisions intact without deleting the live solution or valid sibling revision", async () => {
  const { sol } = await readySolution(),
    ws = (await S.get(PRO, sol.id)).workspace;
  const { revisions: _ignored, ...archived } = ws;
  const good = {
    revision: 1,
    baseline: sol.baseline,
    archivedAt: sol.createdAt,
    archivedBy: sol.createdBy,
    reason: "Actual prior workspace",
    workspace: archived,
  };
  const bad = {
    ...good,
    revision: 2,
    workspace: {
      ...archived,
      partner: { hypothesis: 3 },
      recommendations: [{ id: "bad", title: 4 }],
    },
  };
  const result = sanitizeTable("solutionWorkspaces", [{ ...ws, revisions: [good, bad] }]);
  expect((result.rows[0] as SolutionWorkspace).revisions).toEqual([good]);
  expect(result.quarantined).toContainEqual(
    expect.objectContaining({ path: "solutionWorkspaces[0].revisions[1]", value: bad }),
  );
});

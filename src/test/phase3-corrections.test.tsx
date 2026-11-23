/** Phase 3 blocking corrections — P1-01 claim applicability, P1-02 dependencies, P1-03 self-contained hand-offs. */
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assessmentStudio as A } from "@/data/assessment-studio";
import { ValidationError } from "@/data/repositories";
import { solutionStudio as S } from "@/data/solution-studio";
import { store } from "@/data/store";
import {
  analyzeDependencies,
  unresolvedHandoffRefs,
  type CatalogSnapshot,
} from "@/domain/solution";
import { MOCK_CATALOG } from "@/integrations/adapters/solution-catalog";
import {
  approvedAssessment,
  evidence,
  MGR,
  PRO,
  readySolution,
  resetSolutionTestState,
} from "./solution-fixtures";

beforeEach(resetSolutionTestState);
afterEach(cleanup);

/** Approved assessment whose baseline also holds verified "connector supported" evidence for TallyPrime. */
async function withConnectorEvidence(connectorItemId: string | undefined) {
  const base = await approvedAssessment();
  await A.reopen(PRO, base.a.id, "Add connector evidence");
  const connEv = await A.upsertChild(
    PRO,
    base.a.id,
    "evidence",
    evidence({
      applicability: "connector_supported",
      statement: "Tally connector tested in a pilot",
      links: [{ kind: "system", id: base.sys }],
      ...(connectorItemId ? { connectorItemId } : {}),
    }),
  );
  await A.submitForReview(PRO, base.a.id);
  const snap = await A.approve(MGR, base.a.id);
  const sol = await S.create(PRO, { assessmentId: base.a.id, snapshotId: snap.id, title: "C" });
  return { ...base, snap, sol, connEv };
}
const integration = (sys: string, ev: string, over: Record<string, unknown> = {}) => ({
  systemId: sys,
  proposalKind: "connector" as const,
  catalogItemId: "conn_tally",
  feasibility: "confirmed_working" as const,
  direction: "inbound" as const,
  access: "read" as const,
  evidenceIds: [ev],
  ...over,
});

describe("P1-01 catalog claim applicability", () => {
  it("rejects a connector recommendation that references only a native app", async () => {
    const { sol } = await readySolution();
    await expect(
      S.upsertChild(PRO, sol.id, "recommendations", {
        category: "connector",
        title: "Tally connector",
        catalogItemIds: ["app_receivables"],
        provenance: "verified_catalog_capability",
      }),
    ).rejects.toThrow(/needs a selected Connector/);
    await expect(
      S.upsertChild(PRO, sol.id, "recommendations", {
        category: "connector",
        title: "Tally connector",
        catalogItemIds: ["app_receivables"],
      }),
    ).rejects.toThrow(ValidationError);
  });
  it("rejects a read-only Tally connector used for outbound writes", async () => {
    const { sol, sys, connEv } = await withConnectorEvidence("conn_tally");
    await expect(
      S.upsertChild(
        PRO,
        sol.id,
        "integrations",
        integration(sys, connEv, { direction: "outbound", access: "write" }),
      ),
    ).rejects.toThrow(/does not support outbound data flow.*does not support write/);
    await expect(
      S.upsertChild(PRO, sol.id, "integrations", integration(sys, connEv, { access: "unknown" })),
    ).rejects.toThrow(/operations are unknown/);
  });
  it("rejects evidence that is about a different (or unnamed) connector", async () => {
    const other = await withConnectorEvidence("conn_essl");
    await expect(
      S.upsertChild(PRO, other.sol.id, "integrations", integration(other.sys, other.connEv)),
    ).rejects.toThrow(/names the selected connector/);
    resetSolutionTestState();
    const unnamed = await withConnectorEvidence(undefined);
    await expect(
      S.upsertChild(PRO, unnamed.sol.id, "integrations", integration(unnamed.sys, unnamed.connEv)),
    ).rejects.toThrow(/names the selected connector/);
  });
  it("accepts a correctly supported connector and operation", async () => {
    const { sol, sys, connEv } = await withConnectorEvidence("conn_tally");
    const id = await S.upsertChild(PRO, sol.id, "integrations", integration(sys, connEv));
    const i = (await S.get(PRO, sol.id)).workspace.integrations.find((x) => x.id === id)!;
    expect(i).toMatchObject({ feasibility: "confirmed_working", direction: "inbound" });
    // Possible-but-uncommitted stays speculative; it is never promoted.
    const p = await S.upsertChild(
      PRO,
      sol.id,
      "integrations",
      integration(sys, connEv, { feasibility: "possible_uncommitted", access: "write" }),
    );
    expect(
      (await S.get(PRO, sol.id)).workspace.integrations.find((x) => x.id === p)!.feasibility,
    ).toBe("possible_uncommitted");
  });
  it("allows legitimate mixed catalog dependencies", async () => {
    const { sol, rec } = await readySolution(); // native app + its Tally connector dependency
    const v = await S.get(PRO, sol.id);
    expect(v.availability[rec]).toBe("available");
    expect(v.readiness.find((i) => i.key === "catalog")!.ok).toBe(true);
  });
  it("flags an existing invalid claim and blocks approval instead of promoting it", async () => {
    const { sol, rec } = await readySolution();
    const ws = store.table("solutionWorkspaces");
    const w = ws.find((x) => x.solutionId === sol.id)!;
    const r = w.recommendations.find((x) => x.id === rec)!;
    r.category = "connector";
    r.catalogRefs = r.catalogRefs.filter((c) => c.itemId === "app_receivables");
    store.replace("solutionWorkspaces", ws);
    const v = await S.get(PRO, sol.id);
    expect(v.workspace.recommendations[0]!.provenance).toBe("verified_catalog_capability"); // kept, not discarded
    expect(v.availability[rec]).toBe("unsupported");
    expect(v.readiness.find((i) => i.key === "catalog")!.ok).toBe(false);
    expect(v.readiness.find((i) => i.key === "claims")!.ok).toBe(false);
    await S.submitForReview(PRO, sol.id);
    await expect(S.approve(MGR, sol.id)).rejects.toThrow(/not ready/);
  });
});

describe("P1-02 dependency validation", () => {
  async function withAiSkill() {
    const r = await readySolution();
    const ai = await S.upsertChild(PRO, r.sol.id, "recommendations", {
      category: "ai",
      title: "Ask Aura about receivables",
      needIds: [r.need],
      rationale: "Answers overdue questions",
    });
    await S.upsertChild(PRO, r.sol.id, "aiDesigns", {
      recommendationId: ai,
      capabilityItemIds: ["ai_receivables_skill"],
      rolesAndScopes: "Finance team",
      sensitiveDataRisks: "Customer balances",
    });
    return { ...r, ai };
  }
  it("flags an AI skill whose required applications are not selected", async () => {
    const { sol } = await withAiSkill();
    const v = await S.get(PRO, sol.id);
    expect(v.dependencies.catalogGaps).toEqual([
      expect.objectContaining({
        source: expect.objectContaining({ kind: "aiDesign" }),
        itemId: "ai_receivables_skill",
        needs: "app_crm_followups",
      }),
    ]);
    expect(v.readiness.find((i) => i.key === "dependencies")!.ok).toBe(false);
  });
  it("resolves transitive dependencies (skill → app → connector)", async () => {
    const { a, snap } = await approvedAssessment();
    const sol = await S.create(PRO, { assessmentId: a.id, snapshotId: snap.id, title: "T" });
    const ai = await S.upsertChild(PRO, sol.id, "recommendations", { category: "ai", title: "AI" });
    await S.upsertChild(PRO, sol.id, "aiDesigns", {
      recommendationId: ai,
      capabilityItemIds: ["ai_receivables_skill"],
    });
    const gaps = (await S.get(PRO, sol.id)).dependencies.catalogGaps;
    expect(gaps.map((g) => g.needs).sort()).toEqual([
      "app_crm_followups",
      "app_receivables",
      "conn_tally",
    ]);
    expect(gaps.find((g) => g.needs === "conn_tally")!.path).toEqual([
      "ai_receivables_skill",
      "app_receivables",
      "conn_tally",
    ]);
  });
  it("flags an integration whose connector prerequisite is missing or unsupported", () => {
    const cat: CatalogSnapshot = {
      ...MOCK_CATALOG,
      items: [
        ...MOCK_CATALOG.items,
        {
          ...MOCK_CATALOG.items.find((i) => i.id === "conn_tally")!,
          id: "conn_x",
          dependencies: ["app_ops_reports", "conn_gone"],
        },
      ],
    };
    const r = analyzeDependencies(
      {
        recommendations: [],
        integrations: [
          {
            id: "int1",
            proposal: {
              kind: "connector",
              catalogRef: { itemId: "conn_x", catalogVersion: "v", nameAtSelection: "" },
            },
          },
        ],
      },
      cat,
    );
    expect(r.catalogGaps.map((g) => [g.source.kind, g.needs])).toEqual([
      ["integration", "app_ops_reports"],
      ["integration", "conn_gone"],
    ]);
    expect(r.unsupported).toEqual([
      { itemId: "conn_x", needs: "conn_gone", reason: "not in the catalog" },
    ]);
  });
  it("does not let a rejected alternative satisfy a prerequisite", async () => {
    const { sol, need } = await withAiSkill();
    await S.upsertChild(PRO, sol.id, "recommendations", {
      category: "native_app",
      title: "CRM follow-ups (rejected)",
      needIds: [need],
      rationale: "Considered",
      catalogItemIds: ["app_crm_followups"],
      status: "not_recommended",
    });
    const v = await S.get(PRO, sol.id);
    expect(v.dependencies.catalogGaps.map((g) => g.needs)).toContain("app_crm_followups");
    expect(v.readiness.find((i) => i.key === "dependencies")!.ok).toBe(false);
  });
  it("blocks approval while a mandatory dependency is missing, and passes once added", async () => {
    const { sol, need } = await withAiSkill();
    await S.submitForReview(PRO, sol.id);
    await expect(S.approve(MGR, sol.id)).rejects.toThrow(/Mandatory catalog prerequisites/);
    await S.returnForRevision(MGR, sol.id, "Add CRM");
    await S.upsertChild(PRO, sol.id, "recommendations", {
      category: "native_app",
      title: "CRM follow-ups",
      needIds: [need],
      rationale: "Tracks pending follow-ups",
      catalogItemIds: ["app_crm_followups"],
    });
    const v = await S.get(PRO, sol.id);
    expect(v.dependencies.catalogGaps).toEqual([]);
    expect(v.readinessPercent).toBe(100);
    await S.submitForReview(PRO, sol.id);
    await expect(S.approve(MGR, sol.id)).resolves.toMatchObject({ version: 1 });
  });
});

describe("P1-03 self-contained hand-offs", () => {
  async function approved() {
    const r = await readySolution();
    await S.submitForReview(PRO, r.sol.id);
    const h = await S.approve(MGR, r.sol.id, "ok");
    return { ...r, h };
  }
  it("embeds the source assessment so every reference resolves inside the hand-off", async () => {
    const { h, req, ev, sys, snap } = await approved();
    expect(h.schema).toBe("aurumi.cia.solution-handoff/2");
    expect(unresolvedHandoffRefs(h)).toEqual([]);
    expect(h.sourceAssessment).toMatchObject({ id: snap.id, schema: snap.schema, version: 1 });
    // Evidence targets a requirement that is not a selected need — still resolvable.
    expect(h.needs.some((n) => n.source.id === req)).toBe(false);
    const cited = h.sourceAssessment.evidence.find((e) => e.id === ev)!;
    expect(cited.links).toContainEqual({ kind: "requirement", id: req });
    expect(h.sourceAssessment.requirements.map((r) => r.id)).toContain(req);
    expect(h.sourceAssessment.systems.map((s) => s.id)).toContain(sys);
    expect(h.sourceAssessment.processes.length).toBe(1);
    expect(h.sourceAssessment.questions.length).toBeGreaterThan(0);
    expect(cited.verification.state).toBe("verified");
    expect(Object.isFrozen(h.sourceAssessment.requirements)).toBe(true);
  });
  it("keeps catalog dependencies interpretable after catalog changes", async () => {
    const { h, sol } = await approved();
    const item = MOCK_CATALOG.items.find((i) => i.id === "app_receivables")!;
    const before = structuredClone(item);
    item.product = "Renamed product";
    item.dependencies = ["conn_essl"];
    try {
      const stored = (await S.get(PRO, sol.id)).snapshots[0]!;
      const embedded = stored.catalog.items.find((i) => i.id === "app_receivables")!;
      expect(embedded.product).toBe(before.product);
      expect(embedded.dependencies).toEqual(["conn_tally"]);
      expect(stored.catalog.items.map((i) => i.id)).toContain("conn_tally");
      expect(stored).toEqual(h);
    } finally {
      Object.assign(item, before);
    }
  });
  it("stays interpretable when source assessment records are gone from the live store", async () => {
    const { sol, req } = await approved();
    store.replace("snapshots", []);
    store.replace("assessments", []);
    const h = (await S.get(PRO, sol.id)).snapshots[0]!;
    expect(unresolvedHandoffRefs(h)).toEqual([]);
    expect(h.sourceAssessment.requirements.find((r) => r.id === req)!.statement).toBe(
      "See overdue invoices daily",
    );
  });
  it("a later successful edit and re-approval create a separate version; v1 never changes", async () => {
    const { sol, rec, h } = await approved();
    const v1 = structuredClone(h);
    await S.reopen(PRO, sol.id, "Retitle");
    const cur = (await S.get(PRO, sol.id)).workspace.recommendations[0]!;
    await S.upsertChild(PRO, sol.id, "recommendations", {
      id: rec,
      category: cur.category,
      title: "Receivables app v2",
      needIds: cur.needIds,
      rationale: cur.rationale,
      catalogItemIds: cur.catalogRefs.map((c) => c.itemId),
      provenance: "professional_judgment",
    });
    expect((await S.get(PRO, sol.id)).workspace.recommendations[0]!.title).toBe(
      "Receivables app v2",
    );
    await S.submitForReview(PRO, sol.id);
    const h2 = await S.approve(MGR, sol.id);
    expect(h2.version).toBe(2);
    expect(h2.id).not.toBe(h.id);
    const snaps = (await S.get(PRO, sol.id)).snapshots;
    expect(snaps.find((x) => x.version === 1)).toEqual(v1);
    expect(snaps.find((x) => x.version === 2)!.recommendations[0]!.title).toBe(
      "Receivables app v2",
    );
  });
});

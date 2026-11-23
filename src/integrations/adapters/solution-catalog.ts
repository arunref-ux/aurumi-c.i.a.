/**
 * Read-only, versioned Aurumi offering catalog for Solution Studio (mock).
 * Production replaces this with DevHarmony (apps/features), the connector
 * registry (connectors) and AI Studio (AI capabilities / Business Skills).
 * Every record here is ILLUSTRATIVE: it states no live integration,
 * certification or commercial availability.
 */
import type { CatalogItem, CatalogSnapshot } from "@/domain/solution";
import type { AdapterResult } from "./types";

export interface SolutionCatalogAdapter {
  /** The whole catalog at one version, so references can be pinned. */
  getSnapshot(): Promise<AdapterResult<CatalogSnapshot>>;
}

const V = "mock-catalog-2026.11";
const AT = "2026-11-15T00:00:00Z";
const item = (
  i: Omit<CatalogItem, "version" | "verifiedAt"> & { version?: string },
): CatalogItem => ({
  version: "1.0",
  verifiedAt: AT,
  ...i,
});

export const MOCK_CATALOG: CatalogSnapshot = {
  catalogVersion: V,
  retrievedAt: AT,
  items: [
    item({
      id: "app_ops_reports",
      kind: "native_app",
      provider: "DevHarmony (mock)",
      product: "Operations Reporting",
      capability: "Scheduled operational reports",
      readiness: "available",
      useCases: ["Replace manual report exports", "Daily KPI digest"],
      dependencies: [],
      actions: ["report.view", "report.schedule"],
      limitations: ["Reads only data already in Aurumi"],
      source: "DevHarmony app registry (illustrative)",
    }),
    item({
      id: "app_guest_desk",
      kind: "native_app",
      provider: "DevHarmony (mock)",
      product: "Guest Desk",
      capability: "Front-desk requests and room status",
      readiness: "beta",
      useCases: ["Housekeeping turnover", "Guest requests"],
      dependencies: ["conn_pms_generic"],
      actions: ["request.create", "room.status.update"],
      limitations: ["Needs a PMS feed for room status"],
      source: "DevHarmony app registry (illustrative)",
    }),
    item({
      id: "app_receivables",
      kind: "native_app",
      provider: "DevHarmony (mock)",
      product: "Accounting — Receivables",
      capability: "Invoice ageing and overdue lists",
      readiness: "available",
      useCases: ["Overdue invoice follow-up"],
      dependencies: ["conn_tally"],
      actions: ["invoice.read", "invoice.ageing.read"],
      limitations: ["No payment collection"],
      source: "DevHarmony app registry (illustrative)",
    }),
    item({
      id: "app_crm_followups",
      kind: "native_app",
      provider: "DevHarmony (mock)",
      product: "CRM — Follow-ups",
      capability: "Customer follow-up tasks",
      readiness: "beta",
      useCases: ["Track pending follow-up actions"],
      dependencies: [],
      actions: ["task.read", "task.create"],
      limitations: ["Beta: task assignment rules are limited"],
      source: "DevHarmony app registry (illustrative)",
    }),
    item({
      id: "ai_summaries",
      kind: "ai_capability",
      provider: "AI Studio (mock)",
      product: "Aura",
      capability: "Conversation summaries",
      readiness: "available",
      useCases: ["Summarise customer conversations"],
      dependencies: [],
      actions: ["summary.generate"],
      limitations: ["Read-only; never takes actions"],
      source: "AI Studio capability registry (illustrative)",
    }),
    item({
      id: "ai_receivables_skill",
      kind: "ai_capability",
      provider: "AI Studio (mock)",
      product: "Aura Business Skill",
      capability: "Receivables follow-up questions",
      readiness: "beta",
      useCases: [
        "“Which customers have overdue invoices, and what follow-up actions are pending?”",
      ],
      dependencies: ["app_receivables", "app_crm_followups"],
      actions: ["invoice.ageing.read", "task.read"],
      limitations: [
        "Answers only from connected Receivables and CRM data",
        "Write actions need confirmation",
      ],
      source: "AI Studio capability registry (illustrative)",
    }),
    item({
      id: "conn_tally",
      kind: "connector",
      provider: "Connector registry (mock)",
      product: "TallyPrime connector",
      capability: "Ledger and invoice sync",
      readiness: "available",
      useCases: ["Bring invoices into Receivables"],
      dependencies: [],
      actions: ["ledger.read", "invoice.read"],
      limitations: ["One-way (read) sync"],
      connector: { systemMatch: ["tally"], directions: ["inbound"], operations: ["read"] },
      source: "Connector registry (illustrative)",
    }),
    item({
      id: "conn_essl",
      kind: "connector",
      provider: "Connector registry (mock)",
      product: "eSSL attendance connector",
      capability: "Attendance punches",
      readiness: "planned",
      useCases: ["Attendance-based payroll inputs"],
      dependencies: [],
      actions: [],
      limitations: ["Planned — not available"],
      connector: { systemMatch: ["essl"], directions: ["inbound"], operations: ["read"] },
      source: "Connector registry (illustrative)",
    }),
    item({
      id: "conn_pms_generic",
      kind: "connector",
      provider: "Connector registry (mock)",
      product: "Generic PMS connector",
      capability: "Room status feed",
      readiness: "not_supported",
      useCases: [],
      dependencies: [],
      actions: [],
      limitations: ["No supported PMS connector today"],
      connector: { systemMatch: ["pms"], directions: ["inbound"], operations: ["read"] },
      source: "Connector registry (illustrative)",
    }),
    item({
      id: "roadmap_custom_bridge",
      kind: "roadmap",
      provider: "Proposed (not published)",
      product: "Custom integration bridge",
      capability: "Project-specific integration",
      readiness: "proposed",
      useCases: ["Systems without a catalog connector"],
      dependencies: [],
      actions: [],
      limitations: ["Proposed only — no commitment, scope or date"],
      source: "Professional proposal",
    }),
  ],
};

export const solutionCatalog: SolutionCatalogAdapter = {
  getSnapshot: () => Promise.resolve({ ok: true, data: structuredClone(MOCK_CATALOG) }),
};

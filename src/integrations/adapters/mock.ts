/** Mock implementations with simulated latency and switchable failure mode. */
import type {
  AdapterDescriptor, AdapterResult, CapabilityCatalogAdapter, CRMAdapter, DemandSignalAdapter,
  DocumentAdapter, PricingSubscriptionAdapter, ResearchAdapter, TenantHealthAdapter, TenantSuccessAdapter, Capability,
} from "./types";

export const mockControls = { latencyMs: 450, failing: new Set<string>(), empty: new Set<string>() };

function respond<T>(adapter: string, data: T, emptyValue?: T): Promise<AdapterResult<T>> {
  return new Promise((resolve) =>
    setTimeout(() => {
      if (mockControls.failing.has(adapter)) resolve({ ok: false, error: `${adapter}: simulated upstream failure (mock)` });
      else resolve({ ok: true, data: mockControls.empty.has(adapter) && emptyValue !== undefined ? emptyValue : data });
    }, mockControls.latencyMs),
  );
}

const CAPS: Capability[] = [
  { id: "app_ops_reports", name: "Operations Reporting (native app)", source: "devharmony", readiness: "available", dependencies: [] },
  { id: "app_guest_desk", name: "Guest Desk (native app)", source: "devharmony", readiness: "beta", dependencies: ["conn_pms_generic"] },
  { id: "ai_summaries", name: "Conversation summaries (AI)", source: "ai_studio", readiness: "available", dependencies: [] },
  { id: "conn_tally", name: "TallyPrime connector", source: "connector_catalog", readiness: "available", dependencies: [] },
  { id: "conn_essl", name: "eSSL attendance connector", source: "connector_catalog", readiness: "planned", dependencies: [] },
  { id: "conn_pms_generic", name: "Generic PMS connector", source: "connector_catalog", readiness: "not_supported", dependencies: [] },
];

export const crm: CRMAdapter = {
  search: (q) => respond("crm", [{ id: "crm_org_1", kind: "organization", name: `Shreeji Precision (match: ${q})` }], []),
  getRecord: (id) => respond("crm", { id, kind: "organization", name: "Shreeji Precision Components" }, null),
  createConsentedLead: (i) => respond("crm", { id: "crm_lead_new", kind: "lead", name: i.name }),
  linkAssessment: () => respond("crm", { linked: true as const }),
};
export const catalog: CapabilityCatalogAdapter = {
  listNativeApps: () => respond("catalog", CAPS.filter((c) => c.source === "devharmony"), []),
  listAICapabilities: () => respond("catalog", CAPS.filter((c) => c.source === "ai_studio"), []),
  listConnectors: () => respond("catalog", CAPS.filter((c) => c.source === "connector_catalog"), []),
  getReadiness: (id) => respond("catalog", { readiness: CAPS.find((c) => c.id === id)?.readiness ?? "unknown", dependencies: CAPS.find((c) => c.id === id)?.dependencies ?? [] }),
};
export const pricing: PricingSubscriptionAdapter = {
  getPublishedCatalog: () => respond("pricing", [
    { itemId: "app_ops_reports", name: "Operations Reporting", unitAmount: 1200, currency: "INR", priceBookVersion: "PB-2026.4 (mock)" },
    { itemId: "conn_tally", name: "TallyPrime connector", unitAmount: 600, currency: "INR", priceBookVersion: "PB-2026.4 (mock)" },
  ], []),
  getPlans: () => respond("pricing", [{ id: "plan_growth", name: "Growth (mock)", inclusions: ["5 apps", "2 connectors"] }], []),
  calculate: (items) => respond("pricing", { total: items.reduce((s, i) => s + i.quantity * 900, 0), currency: "INR", quoteReference: "Q-MOCK-0001" }),
  validateCoupon: (code) => respond("pricing", { valid: code.toUpperCase() === "PILOT10" }),
  prepareSubscriptionHandoff: (q) => respond("pricing", { handoffUrl: `mock://subscription-builder/handoff/${q}` }),
  getSubscriptionStatus: () => respond("pricing", { status: "active (mock)" }),
};
export const tenantHealth: TenantHealthAdapter = {
  getAdoption: () => respond("tenant_health", { activeUsers: 48, adoptionScore: 72, topApps: ["Operations Reporting", "Inbox"] }),
};
export const tenantSuccess: TenantSuccessAdapter = {
  getReferences: () => respond("tenant_success", [{ id: "ts_1042", stage: "Onboarding complete" }], []),
};
export const research: ResearchAdapter = {
  lookupSoftware: (name, website) => respond("research", { vendor: `${name} vendor (curated mock)`, category: "Unclassified", readiness: "unknown" as const, sources: website ? [{ title: `${name} product page`, url: website }] : [] }),
};
export const documents: DocumentAdapter = {
  generate: (v, f) => respond("documents", { fileName: `${v}.${f}`, bytes: 184_320 }),
};
export const demandSignals: DemandSignalAdapter = {
  prepareSignal: () => respond("demand", { signalId: "sig_mock_1", status: "prepared" as const }),
};

export const adapterRegistry: AdapterDescriptor[] = [
  { key: "crm", name: "CRMAdapter", sourceApp: "ShopTalk CRM", responsibility: "Leads, organizations, contacts, deals", status: "mock", operations: [
    { name: "search", exampleRequest: { q: "Shreeji" }, run: () => crm.search("Shreeji") },
    { name: "createConsentedLead", exampleRequest: { name: "Priya N.", email: "priya@example.com", consentAt: "2026-11-23T10:00:00Z" }, run: () => crm.createConsentedLead({ name: "Priya N.", email: "priya@example.com", consentAt: "2026-11-23T10:00:00Z" }) },
  ] },
  { key: "catalog", name: "CapabilityCatalogAdapter", sourceApp: "DevHarmony + AI Studio", responsibility: "Native apps, AI capabilities, connectors, readiness", status: "mock", operations: [
    { name: "listConnectors", exampleRequest: {}, run: () => catalog.listConnectors() },
    { name: "getReadiness", exampleRequest: { id: "conn_essl" }, run: () => catalog.getReadiness("conn_essl") },
  ] },
  { key: "pricing", name: "PricingSubscriptionAdapter", sourceApp: "Pricing Studio / Subscription Builder", responsibility: "Published prices, plans, calculations, coupon validation, handoff", status: "mock", operations: [
    { name: "getPublishedCatalog", exampleRequest: {}, run: () => pricing.getPublishedCatalog() },
    { name: "calculate", exampleRequest: { items: [{ itemId: "app_ops_reports", quantity: 2 }] }, run: () => pricing.calculate([{ itemId: "app_ops_reports", quantity: 2 }]) },
  ] },
  { key: "tenant_health", name: "TenantHealthAdapter", sourceApp: "Tenant Health", responsibility: "Usage and adoption metrics", status: "mock", operations: [
    { name: "getAdoption", exampleRequest: { tenantId: "tnt_kairo" }, run: () => tenantHealth.getAdoption("tnt_kairo") },
  ] },
  { key: "tenant_success", name: "TenantSuccessAdapter", sourceApp: "Tenant Success", responsibility: "Onboarding and success references", status: "mock", operations: [
    { name: "getReferences", exampleRequest: { tenantId: "tnt_kairo" }, run: () => tenantSuccess.getReferences("tnt_kairo") },
  ] },
  { key: "research", name: "ResearchAdapter", sourceApp: "Curated research (mock)", responsibility: "External software research and sources", status: "mock", operations: [
    { name: "lookupSoftware", exampleRequest: { name: "eSSL eTimeTrackLite", website: "https://example.com" }, run: () => research.lookupSoftware("eSSL eTimeTrackLite", "https://example.com") },
  ] },
  { key: "documents", name: "DocumentAdapter", sourceApp: "Document generation / File Hub", responsibility: "Proposal PDF/DOCX export and version metadata", status: "mock", operations: [
    { name: "generate", exampleRequest: { proposalVersionId: "pv_1", format: "pdf" }, run: () => documents.generate("pv_1", "pdf") },
  ] },
  { key: "demand", name: "DemandSignalAdapter", sourceApp: "Demand Studio", responsibility: "Reviewed, aggregated unmet-demand signals", status: "mock", operations: [
    { name: "prepareSignal", exampleRequest: { theme: "PMS connector", occurrences: 3 }, run: () => demandSignals.prepareSignal({ theme: "PMS connector", occurrences: 3 }) },
  ] },
];

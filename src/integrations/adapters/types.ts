/**
 * Integration contracts (§14). Existing Aurumi apps stay authoritative; C.I.A.
 * talks to them only through these interfaces. No production endpoints are assumed.
 */
import type { ISODate, ReadinessLevel, ResearchFinding } from "@/domain/types";

export type IntegrationStatus = "mock" | "connected" | "degraded" | "unavailable";
export type AdapterResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface CrmRecord {
  id: string;
  kind: "organization" | "contact" | "lead" | "deal";
  name: string;
}
export interface CRMAdapter {
  search(q: string): Promise<AdapterResult<CrmRecord[]>>;
  getRecord(id: string): Promise<AdapterResult<CrmRecord | null>>;
  createConsentedLead(input: {
    name: string;
    email: string;
    consentAt: string;
  }): Promise<AdapterResult<CrmRecord>>;
  linkAssessment(assessmentId: string, crmId: string): Promise<AdapterResult<{ linked: true }>>;
}

export interface Capability {
  id: string;
  name: string;
  source: "devharmony" | "ai_studio" | "connector_catalog";
  readiness: ReadinessLevel;
  dependencies: string[];
}
export interface CapabilityCatalogAdapter {
  listNativeApps(): Promise<AdapterResult<Capability[]>>;
  listAICapabilities(): Promise<AdapterResult<Capability[]>>;
  listConnectors(): Promise<AdapterResult<Capability[]>>;
  getReadiness(
    id: string,
  ): Promise<AdapterResult<{ readiness: ReadinessLevel; dependencies: string[] }>>;
}

export interface CatalogPrice {
  itemId: string;
  name: string;
  unitAmount: number;
  currency: string;
  priceBookVersion: string;
}
export interface PricingSubscriptionAdapter {
  getPublishedCatalog(): Promise<AdapterResult<CatalogPrice[]>>;
  getPlans(): Promise<AdapterResult<{ id: string; name: string; inclusions: string[] }[]>>;
  calculate(
    items: { itemId: string; quantity: number }[],
  ): Promise<AdapterResult<{ total: number; currency: string; quoteReference: string }>>;
  /** Validation only — coupon administration stays in Pricing Studio. */
  validateCoupon(code: string): Promise<AdapterResult<{ valid: boolean }>>;
  prepareSubscriptionHandoff(
    quoteReference: string,
  ): Promise<AdapterResult<{ handoffUrl: string }>>;
  getSubscriptionStatus(id: string): Promise<AdapterResult<{ status: string }>>;
}

export interface TenantHealthAdapter {
  getAdoption(
    tenantId: string,
  ): Promise<AdapterResult<{ activeUsers: number; adoptionScore: number; topApps: string[] }>>;
}
export interface TenantSuccessAdapter {
  getReferences(tenantId: string): Promise<AdapterResult<{ id: string; stage: string }[]>>;
}
/** Every research attribute is a ResearchFinding carrying provenance, confidence and verification. */
export interface SoftwareResearchResult {
  query: { name: string; website?: string };
  researchedAt: ISODate;
  /** Best current readiness; "unknown" unless a finding supports otherwise. */
  readiness: ReadinessLevel;
  findings: ResearchFinding[];
}
export interface ResearchAdapter {
  lookupSoftware(name: string, website?: string): Promise<AdapterResult<SoftwareResearchResult>>;
}
export interface DocumentAdapter {
  generate(
    proposalVersionId: string,
    format: "pdf" | "docx",
  ): Promise<AdapterResult<{ fileName: string; bytes: number }>>;
}
export interface DemandSignalAdapter {
  prepareSignal(input: {
    theme: string;
    occurrences: number;
  }): Promise<AdapterResult<{ signalId: string; status: "prepared" }>>;
}

export interface AdapterOperation {
  name: string;
  exampleRequest: unknown;
  run: () => Promise<AdapterResult<unknown>>;
}
export interface AdapterDescriptor {
  key: string;
  name: string;
  sourceApp: string;
  responsibility: string;
  status: IntegrationStatus;
  operations: AdapterOperation[];
}

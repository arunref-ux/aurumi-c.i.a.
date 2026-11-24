/** Public allowlist projection, never the internal catalog response. All claims remain illustrative. */
import { MOCK_CATALOG } from "./solution-catalog";
import type { PublicCapability, FitContact } from "@/domain/business-fit";
import type { AdapterResult } from "./types";
export const businessFitDestinations = {
  aurumi: "https://www.aurumi.ai/cia",
  cia: "https://www.aurumi.ai/cia",
};
const PUBLIC_IDS = [
  "app_ops_reports",
  "app_crm_followups",
  "ai_summaries",
  "conn_tally",
  "conn_pms_generic",
];
export function publicFitCatalog(): PublicCapability[] {
  return MOCK_CATALOG.items
    .filter((i) => PUBLIC_IDS.includes(i.id) && i.kind !== "roadmap")
    .map((i) => ({
      id: i.id,
      version: i.version,
      name: i.product,
      description: i.capability,
      kind: i.kind as PublicCapability["kind"],
      claim:
        i.readiness === "available"
          ? "available"
          : i.readiness === "not_supported"
            ? "unsupported"
            : "potential",
      qualification:
        i.kind === "connector"
          ? "Illustrative catalog entry only. Compatibility with your installation, interfaces and required operations must be validated."
          : "Illustrative capability; suitability, deployment and access requirements need validation.",
      published: true,
      verifiedAt: i.verifiedAt,
      actions: [...i.actions],
      ...(i.connector ? { connector: structuredClone(i.connector) } : {}),
      source: "Aurumi demonstration catalog — simulated, not a live availability commitment",
    }));
}
export interface BusinessFitLeadAdapter {
  createOrAssociate(
    key: string,
    contact: FitContact,
  ): Promise<AdapterResult<{ reference: string; status: "simulated" }>>;
}
export const businessFitLeadConfig = { failNext: false };
export const businessFitLead: BusinessFitLeadAdapter = {
  async createOrAssociate(key, _contact) {
    if (businessFitLeadConfig.failNext) {
      businessFitLeadConfig.failNext = false;
      return {
        ok: false,
        error: "Simulated ShopTalk is temporarily unavailable. Retry this request.",
      };
    }
    // The submission ID is a stable idempotency key, including after an interrupted retry.
    return { ok: true, data: { reference: `ST-DEMO-${key}`, status: "simulated" } };
  },
};

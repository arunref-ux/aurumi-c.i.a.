/**
 * Read-only, versioned Pricing Studio price book (mock). Pricing Studio stays
 * the authority for published Aurumi prices; Proposal Studio only pins
 * references to these records and never writes back. Every amount here is
 * ILLUSTRATIVE — not a live, published or authorized Aurumi price.
 */
import type { AdapterResult } from "./types";

export type PriceRecurrence = "one_time" | "monthly" | "annual";
export type PriceCategory =
  "aurumi_subscription" | "connector_addon" | "implementation" | "training" | "advisory";
export interface PriceBookItem {
  id: string;
  name: string;
  category: PriceCategory;
  currency: string;
  unit: string;
  recurrence: PriceRecurrence;
  /** Published list amount per unit. */
  amount: number;
  basis: string;
  validUntil: string;
  /** Catalog item this price applies to, when there is one. */
  catalogItemId?: string;
}
export interface PriceBook {
  priceBookVersion: string;
  retrievedAt: string;
  illustrative: true;
  items: PriceBookItem[];
}
export interface PricingStudioAdapter {
  getPriceBook(): Promise<AdapterResult<PriceBook>>;
}

const VALID = "2027-03-31";
export const MOCK_PRICE_BOOK: PriceBook = {
  priceBookVersion: "mock-pricebook-2026.11",
  retrievedAt: "2026-11-15T00:00:00Z",
  illustrative: true,
  items: [
    {
      id: "pb_core_user",
      name: "Aurumi workspace subscription (illustrative)",
      category: "aurumi_subscription",
      currency: "INR",
      unit: "user",
      recurrence: "monthly",
      amount: 450,
      basis: "Per named user per month, list price",
      validUntil: VALID,
    },
    {
      id: "pb_receivables",
      name: "Accounting — Receivables app (illustrative)",
      category: "aurumi_subscription",
      currency: "INR",
      unit: "organization",
      recurrence: "monthly",
      amount: 2500,
      basis: "Per organization per month, list price",
      validUntil: VALID,
      catalogItemId: "app_receivables",
    },
    {
      id: "pb_conn_tally",
      name: "TallyPrime connector add-on (illustrative)",
      category: "connector_addon",
      currency: "INR",
      unit: "connection",
      recurrence: "monthly",
      amount: 1200,
      basis: "Per connected Tally company per month",
      validUntil: VALID,
      catalogItemId: "conn_tally",
    },
    {
      id: "pb_impl_standard",
      name: "Standard implementation package (illustrative)",
      category: "implementation",
      currency: "INR",
      unit: "project",
      recurrence: "one_time",
      amount: 60000,
      basis: "Fixed package for up to two apps and one connector",
      validUntil: VALID,
    },
    {
      id: "pb_training",
      name: "Onboarding training session (illustrative)",
      category: "training",
      currency: "INR",
      unit: "session",
      recurrence: "one_time",
      amount: 8000,
      basis: "Per remote session, up to 15 attendees",
      validUntil: VALID,
    },
    {
      id: "pb_cia_day",
      name: "C.I.A. advisory day (illustrative)",
      category: "advisory",
      currency: "INR",
      unit: "day",
      recurrence: "one_time",
      amount: 15000,
      basis: "Per professional day",
      validUntil: VALID,
    },
    {
      id: "pb_core_annual",
      name: "Aurumi workspace subscription, annual (illustrative)",
      category: "aurumi_subscription",
      currency: "INR",
      unit: "user",
      recurrence: "annual",
      amount: 4800,
      basis: "Per named user per year, list price",
      validUntil: VALID,
    },
    {
      id: "pb_support_usd",
      name: "International support plan (illustrative)",
      category: "aurumi_subscription",
      currency: "USD",
      unit: "organization",
      recurrence: "monthly",
      amount: 99,
      basis: "Per organization per month, billed in USD",
      validUntil: VALID,
    },
  ],
};

export const pricingStudio: PricingStudioAdapter = {
  getPriceBook: () => Promise.resolve({ ok: true, data: structuredClone(MOCK_PRICE_BOOK) }),
};

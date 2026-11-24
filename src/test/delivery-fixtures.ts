import { vi } from "vitest";
import { store, memoryBackend, STORAGE_KEY, type PersistenceBackend } from "@/data/store";
import { seedUsers } from "@/data/seed";
import { engagementService as E, type EngagementCreation } from "@/data/delivery";
import { deliveryControls } from "@/data/network";
import { demoTerms } from "@/data/delivery-seed";
import { mockControls } from "@/integrations/adapters/mock";
import { studioConfig } from "@/data/assessment-studio";
import { solutionConfig } from "@/data/solution-studio";
import { proposalConfig } from "@/data/proposal-studio";
export function ctx(id: string) {
  const user = seedUsers.find((u) => u.id === id);
  if (!user) throw Error("Missing test identity");
  return { user };
}
export const M = ctx("u_manager"),
  A = ctx("u_admin"),
  P = ctx("u_pro"),
  R = ctx("u_reviewer"),
  PARTNER = ctx("u_partner_pro"),
  PM = ctx("u_pm");
export const HOTEL = "delivery_hotel",
  STREAM = "workstream_delivery_hotel",
  D = "deliverable_delivery_hotel",
  MS = "milestone_delivery_hotel",
  O = "outcome_delivery_hotel";
export function first<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) throw Error("Missing test record");
  return row;
}
export function reset() {
  vi.restoreAllMocks();
  deliveryControls.latencyMs = 0;
  studioConfig.latencyMs = 0;
  solutionConfig.latencyMs = 0;
  proposalConfig.latencyMs = 0;
  mockControls.latencyMs = 0;
  mockControls.failing.clear();
  store.attach(memoryBackend());
}
export function creation(overrides: Partial<EngagementCreation> = {}): EngagementCreation {
  return {
    operationKey: "direct-operation",
    title: "Authorized fictional training",
    origin: "direct",
    customerReference: "mock://shoptalk/new-training",
    customerName: "Fictional Training Customer",
    customerKind: "customer",
    partnerAffiliationId: "",
    services: ["adoption_training"],
    leadProfessionalId: "pro_rohan",
    terms: demoTerms("Departmental training only"),
    authorizationEvidence: "mock://file-hub/direct-authorization",
    proposalVersionId: "",
    allocationId: "",
    previousEngagementId: "",
    ...overrides,
  };
}
export function faults() {
  const b = memoryBackend();
  let reject: (key: string, value: string) => boolean = () => false;
  const backend: PersistenceBackend = {
    kind: "memory",
    read: b.read,
    write(k, v) {
      if (reject(k, v)) throw Error("Injected persistence failure");
      b.write(k, v);
    },
  };
  store.attach(backend);
  return {
    backend,
    fail(predicate: (key: string, value: string) => boolean) {
      reject = predicate;
    },
    repair() {
      reject = () => false;
    },
    saved() {
      const value = b.read(STORAGE_KEY);
      if (!value) throw Error("No saved state");
      return JSON.parse(value);
    },
  };
}
export async function readyCompletion() {
  await E.submitDeliverable(M, HOTEL, D);
  const v = await E.get(M, HOTEL);
  const version = first(v.workspace.deliverables).versions.at(-1);
  if (!version) throw Error("No deliverable version");
  await E.reviewDeliverable(
    A,
    HOTEL,
    D,
    version.id,
    "customer_acceptance",
    "accepted",
    "mock://file-hub/customer-acceptance",
    "Customer acceptance recorded, simulated",
  );
  await E.milestoneStatus(M, HOTEL, MS, "completed", ["mock://file-hub/accepted-findings"]);
  await E.measure(
    M,
    HOTEL,
    O,
    {
      observedAt: new Date().toISOString(),
      value: 80,
      qualitative: "Partial reporting improvement",
      source: "Customer report",
      provenance: "customer_reported",
      evidence: ["mock://file-hub/observation"],
    },
    "partially_achieved",
    "Target remains unmet; customer must standardize source inputs",
  );
  await E.review(M, HOTEL, {
    kind: "completion",
    scheduledAt: new Date().toISOString(),
    calendarReference: "mock://tasks-calendar/review",
    summary: "Actual results and limitations reviewed",
    customerFeedback: "Partial improvement acknowledged",
    nextActions: "Customer standardizes inputs",
    participants: ["customer", "u_manager"],
    evidence: "mock://file-hub/review",
    comment: "Completed review, not automatic engagement closure",
  });
  await E.transition(
    M,
    HOTEL,
    "completion_review",
    "mock://file-hub/decision",
    "Request authorized completion review",
  );
  return E.get(M, HOTEL);
}
export const completionInput = {
  evidence: "mock://file-hub/completion-authorization",
  comment: "Delivered service with partial result accepted",
  summary: "Reporting improved from 120 to 80 minutes; target of 60 minutes was not reached",
  customerFeedback: "Partial improvement acknowledged",
  outstandingResponsibilities: "Customer must standardize source input",
};

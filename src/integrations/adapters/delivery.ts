/** Stable, recoverable simulated references only. No real task, message, opportunity or product request is sent. */
import { mockControls } from "./mock";
export type DeliveryAdapterKind = "task" | "continuation" | "demand";
export interface DeliveryAdapterResult {
  ok: boolean;
  simulated: true;
  operationId: string;
  sourceReference: string;
  reference: string;
  status: "open" | "prepared";
  error: string;
}
export const deliveryAdapters = {
  status: "mock" as const,
  async execute(
    kind: DeliveryAdapterKind,
    operationId: string,
    sourceReference: string,
    _payload: Readonly<Record<string, unknown>>,
  ): Promise<DeliveryAdapterResult> {
    await new Promise((resolve) => setTimeout(resolve, mockControls.latencyMs));
    const failed = mockControls.failing.has(`delivery_${kind}`);
    return {
      ok: !failed,
      simulated: true,
      operationId,
      sourceReference,
      reference: failed
        ? ""
        : `mock://${kind === "task" ? "tasks-calendar" : kind === "continuation" ? "shoptalk" : "demand-studio"}/${operationId}`,
      status: kind === "task" ? "open" : "prepared",
      error: failed ? `Simulated ${kind} failure — retry the same operation` : "",
    };
  },
  async signals(customerReference: string) {
    await new Promise((resolve) => setTimeout(resolve, mockControls.latencyMs));
    if (mockControls.failing.has("delivery_health"))
      throw Error("Simulated Tenant Health unavailable");
    return {
      simulated: true as const,
      source: "Tenant Success / Health (mock)",
      sourceReference: customerReference,
      observedAt: new Date().toISOString(),
      activeUsers: 48,
      enabledApps: ["Operations Reporting", "Tasks & Calendar"],
      workflowUsage: 72,
      connectorHealth: "Unknown — no production observations",
      aiUsage: null,
      adoptionTrend: "Illustrative stable usage, not evidence of business value",
    };
  },
  employee(userId: string) {
    return {
      simulated: true as const,
      status: "mock" as const,
      sourceReference: userId,
      reference: `mock://employee-info/${userId}`,
    };
  },
  artifact(reference: string) {
    return { simulated: true as const, status: "mock" as const, reference, source: "File Hub" };
  },
};

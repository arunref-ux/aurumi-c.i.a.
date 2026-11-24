import { beforeEach, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { proposalStudio as P } from "@/data/proposal-studio";
import { store, memoryBackend, STORAGE_KEY } from "@/data/store";
import { readyProposal, resetProposalTestState, REVIEWER } from "./proposal-fixtures";
import { PRO, MGR } from "./solution-fixtures";
beforeEach(resetProposalTestState);
it("print stress source keeps INR one-time/monthly/annual tax separate and never aggregates USD", async () => {
  const backend = memoryBackend();
  store.attach(backend);
  const { p } = await readyProposal();
  for (let n = 0; n < 20; n++)
    await P.upsertChild(PRO, p.id, "lines", {
      category: "training",
      priceBookItemId: "pb_training",
      quantity: 1,
      description:
        `Fictional training session ${n + 1}. Departmental reporting practice with existing systems, input quality review, clear human responsibilities and manual alternatives. `.repeat(
          2,
        ),
    });
  await P.upsertChild(PRO, p.id, "lines", {
    category: "aurumi_subscription",
    priceBookItemId: "pb_core_annual",
    quantity: 2,
    description: "Fictional annual workspace subscriptions",
  });
  await P.upsertChild(PRO, p.id, "lines", {
    category: "aurumi_subscription",
    priceBookItemId: "pb_support_usd",
    quantity: 1,
    description: "Fictional USD monthly support",
  });
  await P.upsertChild(PRO, p.id, "taxes", {
    label: "Illustrative tax",
    ratePercent: 18,
    appliesTo: "all",
    currency: "INR",
    source: "Fictional configured tax basis for print validation; not tax advice",
  });
  const version = await P.submitForReview(PRO, p.id);
  const acknowledged = [
    ...version.document.deliverables.filter((d) => d.info.needsQualification).map((d) => d.id),
    ...version.document.risks.filter((r) => r.resolution === "accepted").map((r) => r.id),
  ];
  await P.approve(REVIEWER, p.id, version.id, { acknowledged });
  const issued = await P.issue(MGR, p.id, version.id);
  const inr = issued.document.commercials.summary.totals.find((t) => t.currency === "INR"),
    usd = issued.document.commercials.summary.totals.find((t) => t.currency === "USD");
  expect(inr).toMatchObject({
    oneTime: 220000,
    monthly: 2500,
    annual: 9600,
    tax: { one_time: 39600, monthly: 450, annual: 1728 },
  });
  expect(usd).toMatchObject({ monthly: 99, tax: { monthly: 0 } });
  expect(issued.document.commercials.summary.totals).toHaveLength(2);
  if (process.env["PHASE7_CAPTURE"] === "1") {
    const saved = backend.read(STORAGE_KEY);
    if (!saved) throw Error("Missing acknowledged print source");
    writeFileSync("/tmp/phase7-print-envelope.json", saved);
    writeFileSync("/tmp/phase7-print-ids.json", JSON.stringify({ proposalId: p.id }));
  }
}, 30000);

/**
 * Reference sample data for Business Fit (fictional). Built only through the real public
 * check and internal review services, so every submission passes normal validation.
 */
import { businessFitPublic as P } from "@/data/business-fit-public";
import { businessFitInternal as I } from "@/data/business-fit-internal";
import { FIT_SCENARIOS } from "@/data/business-fit-seed";
import { seedUsers } from "@/data/seed";
import { businessFitLeadConfig } from "@/integrations/adapters/business-fit";

const MGR = { user: seedUsers.find((x) => x.id === "u_manager")! };

const PEOPLE = [
  { name: "Meera Iyer", email: "meera@harbourgarden.example", status: "qualified", assign: true },
  { name: "Arjun Shah", email: "arjun@cedar.example", status: "under_review", assign: true },
  { name: "Leela Nair", email: "leela@northstar.example", status: "new", assign: false },
  { name: "Vikram Rao", email: "vikram@fieldline.example", status: "closed", assign: false },
] as const;

/** Creates four consented sample submissions in different review states. */
export async function loadDemoBusinessFit() {
  const prev = businessFitLeadConfig.failNext;
  businessFitLeadConfig.failNext = false;
  try {
    for (const [i, person] of PEOPLE.entries()) {
      const scenario = FIT_SCENARIOS[i]!;
      const h = P.begin();
      P.save(h, structuredClone(scenario.responses), 4);
      P.generate(h);
      const { reference } = await P.consult(h, {
        name: person.name,
        businessName: String(scenario.responses["businessName"] ?? scenario.name),
        email: person.email,
        phone: "",
        country: "India",
        preferredContact: "email",
        comments: "Sample request (fictional) for reference.",
        contactConsent: true,
        marketingConsent: false,
      });
      const row = I.list(MGR).find((r) => r.intake.reference === reference);
      if (!row) continue;
      if (person.assign) I.assign(MGR, row.intake.id, "u_pro");
      if (person.status !== "new") {
        if (person.status !== "under_review") I.status(MGR, row.intake.id, "under_review");
        I.status(MGR, row.intake.id, person.status);
        I.note(MGR, row.intake.id, "Sample note: initial call scheduled with the owner.");
      }
    }
  } finally {
    businessFitLeadConfig.failNext = prev;
  }
}

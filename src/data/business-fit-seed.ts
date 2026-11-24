import {
  BANDS,
  CATEGORIES,
  DIMENSIONS,
  INDUSTRIES,
  PRIORITIES,
  type BusinessFitQuestionnaireVersion,
  type BusinessFitRuleSetVersion,
  type BusinessFitResponse,
  type FitQuestion,
  type FitRule,
} from "@/domain/business-fit";
const at = "2026-11-24T00:00:00.000Z";
const base = (id: string) => ({
  id,
  organizationId: "org_public",
  createdAt: at,
  createdBy: "system",
  updatedAt: at,
  updatedBy: "system",
});
let order = 0;
const question = (
  id: string,
  section: number,
  prompt: string,
  type: FitQuestion["type"],
  options: string[] = [],
  required = false,
  extra: Partial<FitQuestion> = {},
): FitQuestion => ({ id, section, prompt, type, options, required, order: order++, ...extra });
const frequency = ["Never", "Sometimes", "Often", "Always", "Not sure"];
const maturity = ["Difficult", "Somewhat easy", "Easy", "Very easy", "Not sure"];
export const FIT_QUESTIONNAIRE: BusinessFitQuestionnaireVersion = {
  ...base("fit-questionnaire-v1"),
  questionnaireId: "business-fit",
  version: 1,
  title: "Your Business Fit",
  description: "A preliminary view of how your people, processes and systems work together.",
  sections: [
    "About your business",
    "Your existing systems",
    "How work happens today",
    "Your improvement priorities",
  ],
  status: "published",
  questions: [
    question("businessName", 0, "Business name (optional)", "text"),
    question("industry", 0, "Industry", "single", INDUSTRIES, true),
    question(
      "subcategory",
      0,
      "Hospitality business type",
      "single",
      ["Hotel", "Restaurant", "Travel and leisure", "Other", "Not sure"],
      false,
      { visibleWhen: { questionId: "industry", operator: "equals", value: "Hospitality" } },
    ),
    question("industryOther", 0, "Your industry", "text", [], false, {
      visibleWhen: { questionId: "industry", operator: "equals", value: "Other" },
    }),
    question("country", 0, "Country", "text", [], true),
    question("employeeBand", 0, "Number of employees", "single", BANDS, true),
    question(
      "locations",
      0,
      "Operating locations",
      "single",
      ["1", "2–5", "6–20", "More than 20", "Not sure"],
      true,
    ),
    question("operatingModel", 0, "Operating model", "single", [
      "Single site",
      "Multi-location",
      "Remote / distributed",
      "Hybrid",
      "Other",
      "Not sure",
    ]),
    question("respondentRole", 0, "Your role", "single", [
      "Owner",
      "Director",
      "Operations manager",
      "Finance manager",
      "IT manager",
      "HR manager",
      "Other",
      "Not sure",
    ]),
    question("roleOther", 0, "Your role (other)", "text", [], false, {
      visibleWhen: { questionId: "respondentRole", operator: "equals", value: "Other" },
    }),
    question("systems", 1, "Systems used across your business", "systems"),
    question(
      "duplicateEntry",
      2,
      "Is the same information entered into multiple systems?",
      "single",
      frequency,
    ),
    question(
      "information",
      2,
      "How easily can employees find the information they need?",
      "single",
      maturity,
    ),
    question("tasks", 2, "How are important tasks tracked?", "single", [
      "Manual / informal",
      "Shared tracker",
      "Structured workflow",
      "Not sure",
    ]),
    question("approvals", 2, "How are approvals handled?", "single", [
      "Informally",
      "Partly structured",
      "Structured workflow",
      "Not sure",
    ]),
    question(
      "manualReports",
      2,
      "Are reports manually prepared from multiple sources?",
      "single",
      frequency,
    ),
    question("exchange", 2, "Do your systems exchange information automatically?", "single", [
      "No",
      "Partly",
      "Yes",
      "Not sure",
    ]),
    question(
      "keyPeople",
      2,
      "Is important knowledge dependent on particular employees?",
      "single",
      frequency,
    ),
    question(
      "visibility",
      2,
      "How easily can managers obtain up-to-date information?",
      "single",
      maturity,
    ),
    question(
      "acrossLocations",
      2,
      "How easily can managers monitor different locations?",
      "single",
      maturity,
      false,
      { visibleWhen: { questionId: "locations", operator: "equals", value: "2–5" } },
    ),
    question("severity", 2, "How much do these difficulties affect day-to-day work?", "single", [
      "Low",
      "Medium",
      "High",
      "Not sure",
    ]),
    question(
      "priorities",
      3,
      "Your top priorities (up to three, in selection order)",
      "multi",
      PRIORITIES,
      true,
      { maxSelections: 3 },
    ),
    question("secondaryPriorities", 3, "Other priorities (optional)", "multi", PRIORITIES),
    question("preference", 3, "Implementation preference", "single", [
      "Retain existing systems wherever possible",
      "Open to replacing some existing systems",
      "Start with a small improvement",
      "Consider broader business transformation",
      "Not sure",
    ]),
    question("timeframe", 3, "Your timeframe", "single", [
      "Immediate",
      "Within three months",
      "Within six months",
      "Exploring possibilities",
      "Not sure",
    ]),
  ],
};
const rules: FitRule[] = [];
const add = (
  id: string,
  dimension: FitRule["dimension"],
  questionId: string,
  value: string,
  level: FitRule["level"],
  category: FitRule["category"],
  recommendation: string,
  description: string,
  nextStep: string,
  priority = 20,
  catalogId?: string,
) =>
  rules.push({
    id,
    name: recommendation,
    dimension,
    conditions: [{ questionId, operator: "equals", value }],
    evidenceRequirements: [questionId],
    description,
    category,
    recommendation,
    nextStep,
    priority,
    industries: [],
    employeeBands: [],
    ...(level ? { level } : {}),
    ...(catalogId ? { catalogId } : {}),
  });
for (const v of ["Often", "Always"])
  add(
    `digitization-${v}`,
    DIMENSIONS[0],
    "duplicateEntry",
    v,
    "Developing",
    CATEGORIES[0],
    "Reduce repeated data entry",
    "You report frequent repeated entry, which can create delays and inconsistent records.",
    "Map one repeated entry and agree a single source of truth.",
    10,
  );
add(
  "digitization-never",
  DIMENSIONS[0],
  "duplicateEntry",
  "Never",
  "Established",
  CATEGORIES[1],
  "Keep effective digital processes",
  "You report no repeated data entry; replacement is not justified by this response.",
  "Check whether existing features can address the remaining priorities.",
);
for (const [i, v] of ["Difficult", "Somewhat easy", "Easy", "Very easy"].entries()) {
  const level = (["Foundational", "Developing", "Established", "Advanced"] as const)[i];
  add(
    `information-${i}`,
    DIMENSIONS[1],
    "information",
    v,
    level,
    CATEGORIES[0],
    i < 2 ? "Make important knowledge easier to find" : "Preserve accessible business knowledge",
    `You describe finding information as ${v.toLowerCase()}.`,
    "Agree where key documents live and who keeps them current.",
  );
  add(
    `visibility-${i}`,
    DIMENSIONS[4],
    "visibility",
    v,
    level,
    CATEGORIES[1],
    i < 2 ? "Improve management reporting" : "Build on current management visibility",
    `You describe access to up-to-date management information as ${v.toLowerCase()}.`,
    "Review existing reporting tools before choosing additional software.",
  );
  add(
    `ai-ready-${i}`,
    DIMENSIONS[5],
    "information",
    v,
    level,
    CATEGORIES[0],
    i < 2
      ? "Organize information before introducing conversational access"
      : "Validate access and permissions for conversational information",
    i < 2
      ? "Conversational tools need accessible, maintained source information."
      : "Accessible information is a useful foundation, not proof of AI suitability.",
    "Review data quality, access rights and unanswered business questions.",
  );
}
for (const [i, v] of ["Manual / informal", "Shared tracker", "Structured workflow"].entries())
  add(
    `tasks-${i}`,
    DIMENSIONS[3],
    "tasks",
    v,
    (["Foundational", "Developing", "Established"] as const)[i],
    CATEGORIES[0],
    i < 2 ? "Make ownership and follow-up visible" : "Keep structured accountability",
    `Important tasks are tracked using ${v.toLowerCase()}.`,
    "Choose one workflow and agree an owner, due date and follow-up routine.",
    12,
  );
for (const [i, v] of ["No", "Partly", "Yes"].entries())
  add(
    `exchange-${i}`,
    DIMENSIONS[2],
    "exchange",
    v,
    (["Foundational", "Developing", "Established"] as const)[i],
    i < 2 ? CATEGORIES[2] : CATEGORIES[1],
    i < 2
      ? "Investigate information exchange between existing systems"
      : "Retain useful system connections",
    `You report ${v.toLowerCase()} automatic exchange; this does not establish connector compatibility.`,
    "Confirm interfaces, data ownership and required operations before committing to an integration.",
    15,
  );
for (const v of ["Often", "Always"])
  add(
    `reports-${v}`,
    DIMENSIONS[4],
    "manualReports",
    v,
    undefined,
    CATEGORIES[1],
    "Review existing reporting and export features",
    "Reports are frequently prepared manually from multiple sources.",
    "Retain suitable software; define one consolidated report and investigate its data sources.",
    11,
    "app_ops_reports",
  );
const priorityRule = (
  id: string,
  value: string,
  dimension: FitRule["dimension"],
  category: FitRule["category"],
  recommendation: string,
  description: string,
  nextStep: string,
  catalogId?: string,
) =>
  rules.push({
    id,
    name: recommendation,
    dimension,
    conditions: [{ questionId: "priorities", operator: "includes", value }],
    evidenceRequirements: ["priorities"],
    description,
    category,
    recommendation,
    nextStep,
    priority: 18,
    industries: [],
    employeeBands: [],
    ...(catalogId ? { catalogId } : {}),
  });
priorityRule(
  "crm-priority",
  "Improve sales follow-up",
  DIMENSIONS[3],
  CATEGORIES[3],
  "Explore consistent customer follow-up",
  "Sales follow-up is a stated priority; existing CRM features may already address it.",
  "Try a structured follow-up routine before considering an additional app.",
  "app_crm_followups",
);
priorityRule(
  "ai-priority",
  "Introduce AI-assisted business conversations",
  DIMENSIONS[5],
  CATEGORIES[4],
  "Explore conversational access without replacing suitable software",
  "Conversational access is a stated priority, separate from digital maturity.",
  "Validate questions, accessible sources and user permissions.",
  "ai_summaries",
);
priorityRule(
  "knowledge-priority",
  "Improve access to business knowledge",
  DIMENSIONS[1],
  CATEGORIES[0],
  "Organize shared business knowledge",
  "Knowledge access is a stated priority.",
  "Identify frequently asked questions and nominate document owners.",
);
priorityRule(
  "integration-priority",
  "Connect existing software",
  DIMENSIONS[2],
  CATEGORIES[6],
  "Validate unknown integration requirements",
  "A desire to connect software does not prove an available connector.",
  "Ask vendors about supported interfaces; preserve unknown and unsupported needs as private demand signals.",
);
priorityRule(
  "accountability",
  "Strengthen accountability",
  DIMENSIONS[3],
  CATEGORIES[0],
  "Agree ownership of recurring tasks",
  "Accountability is a stated priority.",
  "Start with a shared task list and review cadence.",
);
priorityRule(
  "manual-work",
  "Reduce repetitive manual work",
  DIMENSIONS[0],
  CATEGORIES[0],
  "Start with one repetitive task",
  "Reducing repetitive work is a stated priority.",
  "Map one routine and check existing software automation before adding tools.",
);
add(
  "professional-review",
  DIMENSIONS[4],
  "severity",
  "High",
  undefined,
  CATEGORIES[5],
  "Consider a professional assessment",
  "You report a high day-to-day impact; the supplied information is not independently verified.",
  "Validate important findings with a C.I.A. professional before making commitments.",
  25,
);
export const FIT_RULES: BusinessFitRuleSetVersion = {
  ...base("fit-rules-v1"),
  ruleSetId: "business-fit-rules",
  version: 1,
  questionnaireVersionId: FIT_QUESTIONNAIRE.id,
  name: "Practical business improvement rules",
  rules,
  status: "published",
};
const sys = (
  name: string,
  functionName: string,
  kind: "commercial" | "custom" | "spreadsheet" = "commercial",
) => ({ name, function: functionName, kind });
const common: BusinessFitResponse = {
  country: "India",
  locations: "1",
  respondentRole: "Operations manager",
  operatingModel: "Single site",
};
export const FIT_SCENARIOS: { name: string; responses: BusinessFitResponse }[] = [
  {
    name: "Hotel",
    responses: {
      ...common,
      businessName: "Harbour Garden Hotel (fictional)",
      industry: "Hospitality",
      subcategory: "Hotel",
      employeeBand: "51–100",
      systems: [
        sys("Hotel PMS", "Industry-specific operations"),
        sys("Tally", "Accounting and finance"),
        sys("eSSL", "Attendance and leave"),
      ],
      duplicateEntry: "Often",
      information: "Somewhat easy",
      tasks: "Shared tracker",
      exchange: "No",
      manualReports: "Always",
      visibility: "Difficult",
      priorities: ["Improve visibility into business operations", "Connect existing software"],
      preference: "Retain existing systems wherever possible",
    },
  },
  {
    name: "Small distributor",
    responses: {
      ...common,
      businessName: "Cedar Distribution (fictional)",
      industry: "Distribution and wholesale",
      employeeBand: "11–25",
      systems: [
        sys("Tally", "Accounting and finance"),
        sys("Spreadsheets", "Sales and CRM", "spreadsheet"),
      ],
      duplicateEntry: "Often",
      tasks: "Manual / informal",
      information: "Difficult",
      visibility: "Somewhat easy",
      exchange: "No",
      priorities: [
        "Strengthen accountability",
        "Reduce repetitive manual work",
        "Improve sales follow-up",
      ],
    },
  },
  {
    name: "Professional services",
    responses: {
      ...common,
      businessName: "Northstar Advisory (fictional)",
      industry: "Professional services",
      employeeBand: "26–50",
      systems: [sys("Xero", "Accounting and finance"), sys("Salesforce", "Sales and CRM")],
      duplicateEntry: "Never",
      information: "Very easy",
      visibility: "Very easy",
      tasks: "Structured workflow",
      exchange: "Yes",
      priorities: [
        "Introduce AI-assisted business conversations",
        "Improve access to business knowledge",
      ],
    },
  },
  {
    name: "Custom software",
    responses: {
      ...common,
      businessName: "Fieldline Manufacturing (fictional)",
      industry: "Manufacturing",
      employeeBand: "51–100",
      systems: [sys("Custom ERP", "Industry-specific operations", "custom")],
      exchange: "Not sure",
      visibility: "Difficult",
      manualReports: "Often",
      priorities: ["Improve reporting", "Connect existing software"],
    },
  },
  {
    name: "Insufficient information",
    responses: {
      ...common,
      industry: "Not sure",
      employeeBand: "Not sure",
      locations: "Not sure",
      information: "Not sure",
      exchange: "Not sure",
      priorities: ["Improve reporting"],
    },
  },
];

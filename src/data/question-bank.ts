/** Small representative question bank (§6). Extend with industry templates later. */
import type { QuestionTemplate } from "@/domain/assessment";

export const BUSINESS_CATEGORIES = {
  general: "General business",
  hospitality: "Hospitality",
  manufacturing: "Manufacturing",
  logistics: "Logistics",
  software_vendor: "Software vendor",
  hardware_vendor: "Device / hardware provider",
} as const;

export const QUESTION_BANK: readonly QuestionTemplate[] = [
  { id: "q_goal", assessmentTypes: ["tenant"], category: "general", section: "requirements", prompt: "What would success look like 12 months from now?", required: true },
  { id: "q_pain", assessmentTypes: ["tenant"], category: "general", section: "processes", prompt: "Which process causes the most rework or delay today?", required: true },
  { id: "q_systems", assessmentTypes: ["tenant", "partner"], category: "general", section: "systems", prompt: "Which systems hold your most important business data?", required: true },
  { id: "q_reporting", assessmentTypes: ["tenant"], category: "general", section: "requirements", prompt: "Which reports are prepared manually, and how often?", required: false },
  { id: "q_decision", assessmentTypes: ["tenant", "partner"], category: "general", section: "overview", prompt: "Who makes the final decision, and who else must agree?", required: true },
  { id: "q_security", assessmentTypes: ["tenant"], category: "general", section: "requirements", prompt: "Are there data-residency, privacy or audit rules you must follow?", required: false },
  { id: "q_hosp_pms", assessmentTypes: ["tenant"], category: "hospitality", section: "systems", prompt: "Which property-management and point-of-sale systems are in use?", required: true },
  { id: "q_hosp_guest", assessmentTypes: ["tenant"], category: "hospitality", section: "processes", prompt: "How are guest requests captured and tracked today?", required: false },
  { id: "q_mfg_shopfloor", assessmentTypes: ["tenant"], category: "manufacturing", section: "processes", prompt: "How is shop-floor production data collected?", required: false },
  { id: "q_p_customers", assessmentTypes: ["partner"], category: "general", section: "partner", prompt: "Which customer segments does the partner serve, and roughly how many customers?", required: true },
  { id: "q_p_api", assessmentTypes: ["partner"], category: "general", section: "partner", prompt: "Is there documented API access, and under what terms?", required: true },
  { id: "q_p_resell", assessmentTypes: ["partner"], category: "general", section: "partner", prompt: "Does the partner already resell or refer other software?", required: false },
  { id: "q_p_device", assessmentTypes: ["partner"], category: "hardware_vendor", section: "partner", prompt: "Which device data (e.g. attendance, access events) can be exported, and how?", required: false },
];

/** Clearly fictional seed data (§16, scenarios A–E). */
import type {
  Assessment, AuditEvent, CIAAffiliation, CIAProfessional, Engagement, Proposal, Team, User,
} from "@/domain/types";

export const ORG = "org_aurumi";
const T0 = "2026-09-01T09:00:00.000Z";
const base = (id: string, by: string, at = T0) => ({
  id, organizationId: ORG, createdAt: at, createdBy: by, updatedAt: at, updatedBy: by,
});
const daysAgo = (n: number) => new Date(Date.UTC(2026, 10, 23) - n * 86400000).toISOString();

export const seedTeams: Team[] = [
  { ...base("team_advisory", "u_admin"), name: "Advisory — India" },
  { ...base("team_partners", "u_admin"), name: "Partnerships — North America" },
];

export const seedUsers: User[] = [
  { id: "u_admin", organizationId: ORG, name: "Meera Iyer", email: "meera.iyer@aurumi.example", teamId: "team_advisory", roles: ["cia_admin"], affiliation: "aurumi" },
  { id: "u_manager", organizationId: ORG, name: "Rohan Desai", email: "rohan.desai@aurumi.example", teamId: "team_advisory", roles: ["cia_manager"], affiliation: "aurumi" },
  { id: "u_pro", organizationId: ORG, name: "Ananya Rao", email: "ananya.rao@aurumi.example", teamId: "team_advisory", roles: ["cia_professional"], affiliation: "aurumi" },
  { id: "u_partner_pro", organizationId: ORG, name: "Liam Tremblay", email: "liam@northledger.example", teamId: "team_partners", roles: ["cia_professional"], affiliation: "partner" },
  { id: "u_pm", organizationId: ORG, name: "Claire Dubois", email: "claire.dubois@aurumi.example", teamId: "team_partners", roles: ["partner_manager"], affiliation: "aurumi" },
  { id: "u_reviewer", organizationId: ORG, name: "Vikram Shah", email: "vikram.shah@aurumi.example", teamId: "team_advisory", roles: ["proposal_reviewer"], affiliation: "aurumi" },
];

export const seedAffiliations: CIAAffiliation[] = [
  { ...base("aff_aurumi", "u_admin"), name: "Aurumi", kind: "aurumi" },
  { ...base("aff_northledger", "u_admin"), name: "North Ledger Advisory (fictional)", kind: "partner" },
];

export const seedProfessionals: CIAProfessional[] = [
  { ...base("pro_ananya", "u_admin"), userId: "u_pro", displayName: "Ananya Rao", title: "C.I.A. Professional", region: "India — West", certificationLevel: "professional", affiliationId: "aff_aurumi" },
  { ...base("pro_rohan", "u_admin"), userId: "u_manager", displayName: "Rohan Desai", title: "C.I.A. Manager", region: "India", certificationLevel: "senior", affiliationId: "aff_aurumi" },
  { ...base("pro_liam", "u_admin"), userId: "u_partner_pro", displayName: "Liam Tremblay", title: "Partner C.I.A.", region: "Canada — Ontario", certificationLevel: "associate", affiliationId: "aff_northledger" },
];

export const seedAssessments: Assessment[] = [
  { ...base("asm_a", "u_pro", daysAgo(20)), ownerId: "u_pro", teamId: "team_advisory", assignedUserIds: [], type: "tenant", title: "Operations & reporting review", subjectName: "Shreeji Precision Components (fictional)", status: "completed", channel: "direct", scenarioCode: "A" },
  { ...base("asm_b", "u_manager", daysAgo(9)), ownerId: "u_manager", teamId: "team_advisory", assignedUserIds: ["u_pro"], type: "tenant", title: "Guest operations assessment", subjectName: "Coral Bay Resort (fictional)", status: "in_progress", channel: "direct", scenarioCode: "B" },
  { ...base("asm_c", "u_pm", daysAgo(14)), ownerId: "u_pm", teamId: "team_partners", assignedUserIds: [], type: "partner", title: "Reseller partnership fit", subjectName: "Maple Books Consulting (fictional)", status: "under_review", channel: "partner_referral", scenarioCode: "C" },
  { ...base("asm_d", "u_manager", daysAgo(3)), ownerId: "u_manager", teamId: "team_advisory", assignedUserIds: [], type: "tenant", title: "Business Fit — report for boss", subjectName: "Brightline Logistics (fictional)", status: "draft", channel: "website_boss", scenarioCode: "D" },
  { ...base("asm_e", "u_pro", daysAgo(40)), ownerId: "u_pro", teamId: "team_advisory", assignedUserIds: [], type: "tenant", title: "Expansion opportunity review", subjectName: "Kairo Foods (fictional tenant)", status: "completed", channel: "existing_tenant", scenarioCode: "E" },
];

export const seedProposals: Proposal[] = [
  { ...base("prp_a", "u_pro", daysAgo(12)), ownerId: "u_pro", teamId: "team_advisory", assignedUserIds: [], assessmentId: "asm_a", title: "Connected reporting for Shreeji", track: "tenant_solution", status: "shared", includesPricing: false },
  { ...base("prp_c", "u_pm", daysAgo(6)), ownerId: "u_pm", teamId: "team_partners", assignedUserIds: [], assessmentId: "asm_c", title: "Joint pilot & revenue-share proposal", track: "reseller_partner", status: "in_review", includesPricing: true },
  { ...base("prp_e", "u_pro", daysAgo(30)), ownerId: "u_pro", teamId: "team_advisory", assignedUserIds: [], assessmentId: "asm_e", title: "Kairo connector expansion", track: "tenant_commercial", status: "accepted", includesPricing: true },
  { ...base("prp_b", "u_manager", daysAgo(2)), ownerId: "u_manager", teamId: "team_advisory", assignedUserIds: ["u_pro"], assessmentId: "asm_b", title: "Guest operations — draft", track: "tenant_solution", status: "draft", includesPricing: false },
];

export const seedEngagements: Engagement[] = [
  { ...base("eng_e", "u_manager", daysAgo(25)), ownerId: "u_manager", teamId: "team_advisory", assignedUserIds: ["u_pro"], proposalId: "prp_e", title: "Kairo expansion rollout", status: "active" },
];

export const seedAudit: AuditEvent[] = [
  { id: "aud_1", at: daysAgo(2), organizationId: ORG, actorId: "u_manager", teamId: "team_advisory", ownerId: "u_manager", action: "proposal.create", resourceType: "proposal", resourceId: "prp_b", summary: "Created draft proposal for Coral Bay Resort", outcome: "allowed" },
  { id: "aud_2", at: daysAgo(3), organizationId: ORG, actorId: "u_manager", teamId: "team_advisory", ownerId: "u_manager", action: "assessment.create", resourceType: "assessment", resourceId: "asm_d", summary: "Website Business Fit session handed off (consented)", outcome: "allowed" },
  { id: "aud_3", at: daysAgo(6), organizationId: ORG, actorId: "u_pm", teamId: "team_partners", ownerId: "u_pm", action: "proposal.create", resourceType: "proposal", resourceId: "prp_c", summary: "Generated partnership proposal for Maple Books", outcome: "allowed" },
  { id: "aud_4", at: daysAgo(12), organizationId: ORG, actorId: "u_pro", teamId: "team_advisory", ownerId: "u_pro", action: "proposal.share", resourceType: "proposal", resourceId: "prp_a", summary: "Shared proposal v2 with Shreeji leadership", outcome: "allowed" },
];

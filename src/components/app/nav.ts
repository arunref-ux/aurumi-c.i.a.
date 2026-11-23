import { Briefcase, ClipboardList, FileText, LayoutDashboard, Lightbulb, Network, Settings } from "lucide-react";

/** Single source of truth for primary navigation (§3). `phase` = delivery phase. */
export const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, phase: 1 },
  { to: "/assessments", label: "Assessments", icon: ClipboardList, phase: 2 },
  { to: "/solutions", label: "Solutions", icon: Lightbulb, phase: 3 },
  { to: "/proposals", label: "Proposals", icon: FileText, phase: 4 },
  { to: "/engagements", label: "Engagements", icon: Briefcase, phase: 6 },
  { to: "/network", label: "C.I.A. Network", icon: Network, phase: 6 },
  { to: "/settings", label: "Settings", icon: Settings, phase: 1 },
] as const;

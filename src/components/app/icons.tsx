/** Local inline icons (lucide-style strokes) — avoids loading the full icon library. */
import type { SVGProps } from "react";
type P = SVGProps<SVGSVGElement>;
const I = (paths: string[]) =>
  function Icon(props: P) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  };
export const LayoutDashboard = I([
  "M3 3h7v9H3z",
  "M14 3h7v5h-7z",
  "M14 12h7v9h-7z",
  "M3 16h7v5H3z",
]);
export const ClipboardList = I([
  "M9 2h6v4H9z",
  "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
  "M12 11h4",
  "M12 16h4",
  "M8 11h.01",
  "M8 16h.01",
]);
export const Lightbulb = I([
  "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",
  "M9 18h6",
  "M10 22h4",
]);
export const FileText = I([
  "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z",
  "M14 2v4a2 2 0 0 0 2 2h4",
  "M10 9H8",
  "M16 13H8",
  "M16 17H8",
]);
export const Briefcase = I([
  "M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",
  "M4 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
]);
export const Network = I([
  "M16 16h6v6h-6z",
  "M2 16h6v6H2z",
  "M9 2h6v6H9z",
  "M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3",
  "M12 12V8",
]);
export const Settings = I([
  "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
]);
export const Menu = I(["M4 6h16", "M4 12h16", "M4 18h16"]);
export const X = I(["M18 6 6 18", "M6 6l12 12"]);
export const ArrowUpRight = I(["M7 7h10v10", "M7 17 17 7"]);
export const Loader2 = I(["M21 12a9 9 0 1 1-6.22-8.56"]);

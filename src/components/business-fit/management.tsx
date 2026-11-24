import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
export function ManagementTabs() {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b pb-4">
      <Button variant="ghost" asChild>
        <Link to="/business-fit-management">Submissions</Link>
      </Button>
      <Button variant="ghost" asChild>
        <Link to="/business-fit-management/consultations">Consultation Requests</Link>
      </Button>
      <Button variant="ghost" asChild>
        <Link to="/business-fit-management/questionnaire">Questionnaire</Link>
      </Button>
      <Button variant="ghost" asChild>
        <Link to="/business-fit-management/rules">Recommendation Rules</Link>
      </Button>
      <Button variant="outline" asChild>
        <Link to="/business-fit">Open public Business Fit</Link>
      </Button>
    </nav>
  );
}
export function fitHead(title: string, description: string) {
  return {
    meta: [
      { title: `${title} — C.I.A. Workspace` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} — C.I.A. Workspace` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  };
}

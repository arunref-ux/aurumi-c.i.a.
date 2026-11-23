import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/app/module-placeholder";

export const Route = createFileRoute("/network")({
  head: () => ({
    meta: [
      { title: "C.I.A. Network — C.I.A. Workspace" },
      {
        name: "description",
        content: "Professional profiles, certification, affiliations and assignments.",
      },
      { property: "og:title", content: "C.I.A. Network — C.I.A. Workspace" },
      {
        property: "og:description",
        content: "Professional profiles, certification, affiliations and assignments.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <ModulePlaceholder
      title="C.I.A. Network"
      phase={6}
      purpose="Professional profiles, certification, affiliations and assignments."
      planned={[
        "Professional profiles",
        "Certification levels",
        "Affiliations",
        "Assignments & access",
      ]}
    />
  );
}

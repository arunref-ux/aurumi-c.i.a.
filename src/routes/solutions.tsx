import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/app/module-placeholder";

export const Route = createFileRoute("/solutions")({
  head: () => ({
    meta: [
      { title: "Solutions — C.I.A. Workspace" },
      {
        name: "description",
        content: "Turn assessments into recommendations grounded in the capability catalog.",
      },
      { property: "og:title", content: "Solutions — C.I.A. Workspace" },
      {
        property: "og:description",
        content: "Turn assessments into recommendations grounded in the capability catalog.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <ModulePlaceholder
      title="Solutions"
      phase={3}
      purpose="Turn assessments into recommendations grounded in the capability catalog."
      planned={[
        "Capability mapping",
        "Recommendation builder",
        "Integration readiness labels",
        "Value assumptions",
        "Solution packages",
      ]}
    />
  );
}

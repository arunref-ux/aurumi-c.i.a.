import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/app/module-placeholder";
import { repos } from "@/data/repositories";
import { useSession, useStoreVersion } from "@/lib/session";

export const Route = createFileRoute("/assessments")({
  head: () => ({
    meta: [
      { title: "Assessments — C.I.A. Workspace" },
      { name: "description", content: "One Assessment Studio for tenant and partner assessments." },
      { property: "og:title", content: "Assessments — C.I.A. Workspace" },
      {
        property: "og:description",
        content: "One Assessment Studio for tenant and partner assessments.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const { user } = useSession();
  useStoreVersion();
  const n = repos.assessments.list({ user }).length;
  return (
    <ModulePlaceholder
      title="Assessments"
      phase={2}
      purpose="One Assessment Studio for tenant and partner assessments."
      planned={[
        "Tenant assessment workflow",
        "Partner assessment workflow",
        "Existing software & systems inventory",
        "Unlisted software with research",
        "Research evidence registry",
        "Assessment summaries",
      ]}
      recordsLabel="Assessments"
      records={n}
    />
  );
}

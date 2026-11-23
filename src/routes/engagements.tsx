import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/app/module-placeholder";
import { repos } from "@/data/repositories";
import { useSession, useStoreVersion } from "@/lib/session";

export const Route = createFileRoute("/engagements")({
  head: () => ({
    meta: [
      { title: "Engagements — C.I.A. Workspace" },
      { name: "description", content: "Post-acceptance advisory and implementation coordination." },
      { property: "og:title", content: "Engagements — C.I.A. Workspace" },
      {
        property: "og:description",
        content: "Post-acceptance advisory and implementation coordination.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const { user } = useSession();
  useStoreVersion();
  const n = repos.engagements.list({ user }).length;
  return (
    <ModulePlaceholder
      title="Engagements"
      phase={6}
      purpose="Post-acceptance advisory and implementation coordination."
      planned={[
        "Create from accepted proposal",
        "Assign C.I.A. professionals",
        "Milestones",
        "Outcome register",
      ]}
      recordsLabel="Engagements"
      records={n}
    />
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { CompletionReport } from "@/components/delivery/engagement-pages";
export const Route = createFileRoute("/engagements/$engagementId/report")({
  head: () => ({
    meta: [
      { title: "Engagement Completion Report — Aurumi C.I.A." },
      {
        name: "description",
        content:
          "Immutable delivery results, accepted artifacts and honestly documented outcome limitations.",
      },
      { property: "og:title", content: "Engagement Completion Report — Aurumi C.I.A." },
      {
        property: "og:description",
        content: "Historical completion evidence and recommended follow-on advisory.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
function Page() {
  const { engagementId } = Route.useParams();
  return <CompletionReport id={engagementId} />;
}

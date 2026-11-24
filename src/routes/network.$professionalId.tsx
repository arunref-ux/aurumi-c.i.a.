import { createFileRoute } from "@tanstack/react-router";
import { NetworkDetail } from "@/components/network/pages";
export const Route = createFileRoute("/network/$professionalId")({
  head: () => ({
    meta: [
      { title: "Professional Profile — Aurumi C.I.A." },
      {
        name: "description",
        content:
          "Professional qualifications, affiliation history, capacity and assignment governance.",
      },
      { property: "og:title", content: "Professional Profile — Aurumi C.I.A." },
      { property: "og:description", content: "Professional qualification and assignment history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});
function Page() {
  const { professionalId } = Route.useParams();
  return <NetworkDetail id={professionalId} />;
}

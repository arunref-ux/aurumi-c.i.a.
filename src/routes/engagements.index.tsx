import { createFileRoute } from "@tanstack/react-router";
import { EngagementIndex } from "@/components/delivery/engagement-pages";
export const Route = createFileRoute("/engagements/")({
  head: () => ({
    meta: [
      { title: "Engagement Delivery — Aurumi C.I.A." },
      {
        name: "description",
        content: "Scoped client engagements, delivery milestones and professional assignments.",
      },
      { property: "og:title", content: "Engagement Delivery — Aurumi C.I.A." },
      {
        property: "og:description",
        content: "Authorized implementation, training and ongoing advisory delivery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EngagementIndex,
});

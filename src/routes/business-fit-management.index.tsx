import { createFileRoute } from "@tanstack/react-router";
import { IntakeList } from "@/components/business-fit/intake-list";
import { fitHead } from "@/components/business-fit/management";
export const Route = createFileRoute("/business-fit-management/")({
  head: () =>
    fitHead(
      "Business Fit Submissions",
      "Review consented Business Fit submissions within authorized professional scope.",
    ),
  component: () => <IntakeList />,
});

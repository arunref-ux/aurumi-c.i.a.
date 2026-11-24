import { createFileRoute } from "@tanstack/react-router";
import { IntakeList } from "@/components/business-fit/intake-list";
import { fitHead } from "@/components/business-fit/management";
export const Route = createFileRoute("/business-fit-management/consultations")({
  head: () =>
    fitHead(
      "Business Fit Consultation Requests",
      "Review consent-based consultation intake, assignment and assessment references.",
    ),
  component: () => <IntakeList consultations />,
});

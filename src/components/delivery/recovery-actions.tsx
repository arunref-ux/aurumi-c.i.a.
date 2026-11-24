import { engagementService } from "@/data/delivery";
import { useDeliveryQuery } from "@/lib/delivery-queries";
import { useSession } from "@/lib/session";
import { RecordForm, words } from "./forms";
export function DeliveryRecovery({ id = "" }: { id?: string }) {
  const { user } = useSession(),
    q = useDeliveryQuery("pending-operations", id, (c) =>
      engagementService.pendingOperations(c, id),
    );
  if (!q.data?.length) return null;
  return (
    <section className="my-5 border-y border-destructive/30 py-5">
      <h2 className="text-2xl">Pending saved operations</h2>
      {q.data.map((o) => (
        <div key={o.id} className="mt-4 border-l-2 border-accent pl-4">
          <p className="mb-3 text-sm">
            {words(o.kind)} · {words(o.state)}
          </p>
          <RecordForm
            title="Saved operation recovery"
            fields={[]}
            submit="Retry saved operation"
            run={() => engagementService.retryOperation({ user }, o.id)}
          />
        </div>
      ))}
    </section>
  );
}

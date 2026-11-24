import { useQuery } from "@tanstack/react-query";
import { engagementService } from "@/data/delivery";
import { networkService } from "@/data/network";
import type { Ctx } from "@/data/repositories";
import { useDataVersion, useSession } from "./session";
export function useDeliveryQuery<T>(key: string, id: string, read: (ctx: Ctx) => Promise<T>) {
  const { user } = useSession(),
    v = useDataVersion();
  return useQuery({
    queryKey: ["delivery", key, user.id, id, v],
    queryFn: () => read({ user }),
    placeholderData: (previous, query) =>
      query?.queryKey[2] === user.id && query.queryKey[3] === id ? previous : undefined,
    retry: false,
  });
}
export const useEngagements = () => useDeliveryQuery("list", "", engagementService.list);
export const useEngagement = (id: string) =>
  useDeliveryQuery("detail", id, (c) => engagementService.get(c, id));
export const useProfessionals = () => useDeliveryQuery("professionals", "", networkService.list);
export const useProfessional = (id: string) =>
  useDeliveryQuery("professional", id, (c) => networkService.get(c, id));
export const useWorkload = (id: string) =>
  useDeliveryQuery("workload", id, (c) => networkService.workload(c, id));

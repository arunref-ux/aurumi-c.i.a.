import { useQuery } from "@tanstack/react-query";
import { businessFitInternal } from "@/data/business-fit-internal";
import { useDataVersion, useSession } from "./session";
export function useFitList() {
  const { user } = useSession(),
    version = useDataVersion();
  return useQuery({
    queryKey: ["business-fit-list", user.id, version],
    queryFn: () => businessFitInternal.list({ user }),
  });
}
export function useFitDetail(id: string) {
  const { user } = useSession(),
    version = useDataVersion();
  return useQuery({
    queryKey: ["business-fit-detail", user.id, version, id],
    queryFn: () => businessFitInternal.get({ user }, id),
  });
}

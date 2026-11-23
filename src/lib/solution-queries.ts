/**
 * Query/mutation hooks for Solution Studio. Keys include the viewing user's id
 * and placeholders are reused only for the same user, so results from an
 * earlier identity are never shown to the next one.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { solutionStudio, type SolutionStudioService } from "@/data/solution-studio";
import type { Ctx } from "@/data/repositories";
import type { ID } from "@/domain/types";
import { useDataVersion, useSession } from "./session";

function sameUser<T>(userId: ID) {
  return (prev: T | undefined, q: { queryKey: readonly unknown[] } | undefined) =>
    q?.queryKey[2] === userId ? prev : undefined;
}
export function useSolutionList() {
  const { user } = useSession();
  const v = useDataVersion();
  return useQuery({
    queryKey: ["solutions", "list", user.id, v],
    queryFn: () => solutionStudio.list({ user }),
    placeholderData: sameUser(user.id),
    retry: false,
  });
}
export function useSolutionCandidates() {
  const { user } = useSession();
  const v = useDataVersion();
  return useQuery({
    queryKey: ["solutions", "candidates", user.id, v],
    queryFn: () => solutionStudio.candidates({ user }),
    placeholderData: sameUser(user.id),
    retry: false,
  });
}
export function useSolution(id: ID) {
  const { user } = useSession();
  const v = useDataVersion();
  return useQuery({
    queryKey: ["solutions", "detail", user.id, id, v],
    queryFn: () => solutionStudio.get({ user }, id),
    placeholderData: sameUser(user.id),
    retry: false,
  });
}
type Fn<A extends unknown[], R> = (ctx: Ctx, ...args: A) => Promise<R>;
export function useSolutionMutation<A extends unknown[], R>(
  pick: (s: SolutionStudioService) => Fn<A, R>,
) {
  const { user } = useSession();
  return useMutation({
    mutationFn: (args: A) => pick(solutionStudio).call(solutionStudio, { user }, ...args),
  });
}

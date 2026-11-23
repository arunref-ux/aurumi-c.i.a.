/**
 * Query/mutation hooks for Proposal Studio. Keys include the viewing user's id
 * and placeholders are reused only for the same user, so a pending request
 * from an earlier identity can never show its data to the next one.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { proposalStudio, type ProposalStudioService } from "@/data/proposal-studio";
import type { Ctx } from "@/data/repositories";
import type { ID } from "@/domain/types";
import { useDataVersion, useSession } from "./session";

export function sameUser<T>(userId: ID) {
  return (prev: T | undefined, q: { queryKey: readonly unknown[] } | undefined) =>
    q?.queryKey[2] === userId ? prev : undefined;
}
export function useProposalList() {
  const { user } = useSession();
  const v = useDataVersion();
  return useQuery({
    queryKey: ["proposals", "list", user.id, v],
    queryFn: () => proposalStudio.list({ user }),
    placeholderData: sameUser(user.id),
    retry: false,
  });
}
export function useProposalCandidates() {
  const { user } = useSession();
  const v = useDataVersion();
  return useQuery({
    queryKey: ["proposals", "candidates", user.id, v],
    queryFn: () => proposalStudio.candidates({ user }),
    placeholderData: sameUser(user.id),
    retry: false,
  });
}
export function useProposal(id: ID) {
  const { user } = useSession();
  const v = useDataVersion();
  return useQuery({
    queryKey: ["proposals", "detail", user.id, id, v],
    queryFn: () => proposalStudio.get({ user }, id),
    placeholderData: sameUser(user.id),
    retry: false,
  });
}
type Fn<A extends unknown[], R> = (ctx: Ctx, ...args: A) => Promise<R>;
export function useProposalMutation<A extends unknown[], R>(
  pick: (s: ProposalStudioService) => Fn<A, R>,
) {
  const { user } = useSession();
  return useMutation({
    mutationFn: (args: A) => pick(proposalStudio).call(proposalStudio, { user }, ...args),
  });
}

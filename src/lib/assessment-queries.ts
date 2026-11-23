/**
 * Typed query/mutation hooks for Assessment Studio. Screens use these instead
 * of the store. Query keys include the viewing user's id, and previous data is
 * only kept as a placeholder for the *same* user, so a pending request from an
 * earlier identity can never be shown to the next one.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { assessmentStudio, type AssessmentStudioService } from "@/data/assessment-studio";
import type { Ctx } from "@/data/repositories";
import type { ID } from "@/domain/types";
import { useSession, useStoreVersion } from "./session";

function sameUserPlaceholder<T>(userId: ID) {
  return (prev: T | undefined, prevQuery: { queryKey: readonly unknown[] } | undefined) =>
    prevQuery?.queryKey[2] === userId ? prev : undefined;
}

export function useAssessmentList() {
  const { user } = useSession();
  const v = useStoreVersion();
  return useQuery({
    queryKey: ["assessments", "list", user.id, v],
    queryFn: () => assessmentStudio.list({ user }),
    placeholderData: sameUserPlaceholder(user.id),
    retry: false,
  });
}

export function useAssessmentWorkspace(id: ID) {
  const { user } = useSession();
  const v = useStoreVersion();
  return useQuery({
    queryKey: ["assessments", "detail", user.id, id, v],
    queryFn: () => assessmentStudio.get({ user }, id),
    placeholderData: sameUserPlaceholder(user.id),
    retry: false,
  });
}

type Fn<A extends unknown[], R> = (ctx: Ctx, ...args: A) => Promise<R>;
/** Wraps a service method so it always runs as the current identity at call time. */
export function useStudioMutation<A extends unknown[], R>(
  pick: (s: AssessmentStudioService) => Fn<A, R>,
) {
  const { user } = useSession();
  return useMutation({
    mutationFn: (args: A) => pick(assessmentStudio).call(assessmentStudio, { user }, ...args),
  });
}

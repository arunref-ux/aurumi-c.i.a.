/**
 * Simulated proposal sharing. Nothing is sent: no email, no public URL, no
 * external disclosure. It only returns a simulated channel reference so the
 * share can be recorded against an exact issued version.
 */
import type { AdapterResult } from "./types";

export interface ProposalShareAdapter {
  share(input: {
    versionId: string;
    recipientEmail: string;
  }): Promise<AdapterResult<{ reference: string; simulated: true }>>;
}

let n = 0;
export const proposalShareAdapter: ProposalShareAdapter = {
  share: ({ versionId }) =>
    Promise.resolve({
      ok: true,
      data: { reference: `sim-share-${versionId}-${++n}`, simulated: true },
    }),
};

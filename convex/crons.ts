import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup stale presence rows",
  { minutes: 1 },
  (internal as any).presence.cleanup,
  { staleThresholdMs: 30_000 },
);

crons.interval(
  "cleanup stale guest viewers",
  { minutes: 1 },
  (internal as any).runtimePolicy.cleanupStaleGuestViewers,
  {},
);

crons.interval(
  "refresh runtime policy snapshot",
  { minutes: 1 },
  (internal as any).runtimePolicy.refreshRuntimePolicySnapshot,
  {},
);

export default crons;

import { runCommand } from "./run.ts";

/**
 * Re-queues outbox events that were parked after repeated delivery failures.
 *
 *   pnpm --filter @tablewise/api db:replay-events            every parked event
 *   pnpm --filter @tablewise/api db:replay-events <id> ...   only these events
 *   node dist/cli/replay-events.js [<id> ...]                inside the production image
 *
 * Run it after fixing whatever made the consumer fail. The inbox skips consumers
 * that already succeeded, so replaying never double-counts.
 */
await runCommand("replay-events", async ({ relay, logger }) => {
  const ids = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  const requeued = await relay.replayParked(ids.length > 0 ? ids : undefined);
  logger.info({ requeued }, requeued ? "parked events re-queued" : "no parked events");
  await relay.drain();
});

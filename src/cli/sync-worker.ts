import { setTimeout as delay } from "node:timers/promises";
import { TransitSyncService } from "../application/transit-sync-service.js";
import { getDatabasePool } from "../db/database.js";

const realtimeIntervalMilliseconds = readPositiveInteger("REALTIME_SYNC_INTERVAL_SECONDS", 60) * 1000;
const gtfsIntervalMilliseconds = readPositiveInteger("GTFS_SYNC_INTERVAL_HOURS", 24) * 60 * 60 * 1000;
const retentionDays = readPositiveInteger("HISTORY_RETENTION_DAYS", 90);
const syncOnce = process.env.SYNC_ONCE === "true";
let stopping = false;

process.on("SIGINT", () =>
{
    stopping = true;
});

process.on("SIGTERM", () =>
{
    stopping = true;
});

async function main(): Promise<void>
{
    const pool = getDatabasePool();

    if (!pool)
    {
        throw new Error("La configuration PostgreSQL est requise");
    }

    const service = new TransitSyncService(pool);
    let lastGtfsSync = 0;
    let lastPurge = 0;

    try
    {
        while (!stopping)
        {
            const cycleStartedAt = Date.now();
            let cycleError: unknown = null;

            try
            {
                if (cycleStartedAt - lastGtfsSync >= gtfsIntervalMilliseconds)
                {
                    const gtfsCounts = await service.syncGtfs(true);
                    lastGtfsSync = Date.now();
                    writeEvent("gtfs_synchronized", gtfsCounts);
                }

                const realtimeCounts = await service.syncRealtime();
                writeEvent("realtime_synchronized", realtimeCounts);

                if (cycleStartedAt - lastPurge >= gtfsIntervalMilliseconds)
                {
                    const deletedObservations = await service.purgeHistory(retentionDays);
                    lastPurge = Date.now();
                    writeEvent("history_purged", { deletedObservations, retentionDays });
                }
            }
            catch (error)
            {
                cycleError = error;
                writeEvent("synchronization_failed",
                {
                    message: error instanceof Error ? error.message : String(error)
                });
            }

            if (syncOnce)
            {
                if (cycleError)
                {
                    throw cycleError;
                }

                break;
            }

            const elapsed = Date.now() - cycleStartedAt;
            await delay(Math.max(1000, realtimeIntervalMilliseconds - elapsed));
        }
    }
    finally
    {
        await pool.end();
    }
}

function readPositiveInteger(name: string, fallback: number): number
{
    const value = Number.parseInt(process.env[name] ?? "", 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function writeEvent(event: string, values: object): void
{
    process.stdout.write(`${JSON.stringify({ event, at: new Date().toISOString(), ...values })}\n`);
}

main().catch((error: unknown) =>
{
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});

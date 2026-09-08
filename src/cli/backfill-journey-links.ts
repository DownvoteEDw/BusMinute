import { getDatabasePool } from "../db/database.js";
import { backfillJourneyLinks } from "../application/backfill-journey-links.js";
import { transitDataService } from "../application/transit-data-service.js";

async function main(): Promise<void>
{
    const pool = getDatabasePool();
    if (!pool)
    {
        throw new Error("La configuration PostgreSQL est requise");
    }
    try
    {
        const result = await backfillJourneyLinks(pool, transitDataService);
        process.stdout.write(`${result.saved} circulations sauvegardées, ${result.unavailable} circulations sans données exploitables.\n`);
        if (result.unavailable > 0)
        {
            process.exitCode = 1;
        }
    }
    finally
    {
        await pool.end();
    }
}

main().catch((error: unknown) =>
{
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});

import { PostgresGtfsRepository } from "../db/postgres-gtfs-repository.js";
import { getDatabasePool } from "../db/database.js";
import { BlaBlaCarGtfsImporter } from "../providers/blablacar/gtfs/importer.js";

async function main(): Promise<void>
{
    const sourcePath = process.argv[2];

    if (!sourcePath)
    {
        throw new Error("Usage : npm run db:import-gtfs -- <gtfs.zip|dossier>");
    }

    const pool = getDatabasePool();

    if (!pool)
    {
        throw new Error("DATABASE_URL est requis");
    }

    try
    {
        const feed = await new BlaBlaCarGtfsImporter().import(sourcePath);
        const counts = await new PostgresGtfsRepository(pool).replaceOperatorSchedule(feed,
        {
            slug: "blablacar-bus",
            name: "BlaBlaCar Bus"
        });
        process.stdout.write(`${JSON.stringify(counts, null, 2)}\n`);
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

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PoolClient } from "pg";
import { getDatabasePool } from "../db/database.js";

interface Migration
{
    id: string;
    filename: string;
}

const migrations: Migration[] = [
    {
        id: "001_initial",
        filename: "001_initial.sql"
    },
    {
        id: "002_realtime_history",
        filename: "002_realtime_history.sql"
    },
    {
        id: "003_journey_publications",
        filename: "003_journey_publications.sql"
    },
    {
        id: "004_passenger_report_limits",
        filename: "004_passenger_report_limits.sql"
    }
];

async function applyMigration(client: PoolClient, migration: Migration): Promise<boolean>
{
    await client.query("BEGIN");

    try
    {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["busminute:migrations"]);
        const existing = await client.query<{ id: string }>(
            "SELECT id FROM schema_migrations WHERE id = $1",
            [migration.id]
        );

        if (existing.rowCount !== 0)
        {
            await client.query("COMMIT");
            return false;
        }

        const sql = await readFile(join(process.cwd(), "migrations", migration.filename), "utf8");
        await client.query(sql);
        await client.query(
            "INSERT INTO schema_migrations (id) VALUES ($1)",
            [migration.id]
        );
        await client.query("COMMIT");
        return true;
    }
    catch (error)
    {
        await client.query("ROLLBACK");
        throw error;
    }
}

async function main(): Promise<void>
{
    const pool = getDatabasePool();

    if (!pool)
    {
        throw new Error("La configuration PostgreSQL est requise");
    }

    try
    {
        await pool.query(
            `CREATE TABLE IF NOT EXISTS schema_migrations
            (
                id text PRIMARY KEY,
                applied_at timestamptz NOT NULL DEFAULT now()
            )`
        );

        for (const migration of migrations)
        {
            const client = await pool.connect();

            try
            {
                const applied = await applyMigration(client, migration);
                process.stdout.write(applied
                    ? `Migration ${migration.id} appliquée.\n`
                    : `Migration ${migration.id} déjà appliquée.\n`);
            }
            finally
            {
                client.release();
            }
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

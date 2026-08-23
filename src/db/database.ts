import { Pool } from "pg";

let pool: Pool | null = null;

export function getDatabasePool(): Pool | null
{
    const connectionString = process.env.DATABASE_URL;
    const host = process.env.POSTGRES_HOST;

    if (!connectionString && !host)
    {
        return null;
    }

    if (!pool)
    {
        pool = new Pool({
            ...(connectionString
                ? { connectionString }
                : {
                    host,
                    port: Number.parseInt(process.env.POSTGRES_PORT ?? "5432", 10),
                    database: process.env.POSTGRES_DB ?? "busminute",
                    user: process.env.POSTGRES_USER ?? "busminute",
                    password: process.env.POSTGRES_PASSWORD
                }),
            max: 5,
            ssl: process.env.DATABASE_SSL === "true"
                ? { rejectUnauthorized: false }
                : undefined
        });
    }

    return pool;
}

import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getDatabasePool } from "../db/database.js";
import { BoundedConcurrency, WorkQueueFullError } from "./bounded-concurrency.js";

export const reportTypes = [
    "BUS_NOT_HERE",
    "BUS_ARRIVED",
    "BOARDING",
    "BUS_DEPARTED",
    "PLATFORM_CHANGED",
    "DRIVER_DELAY"
] as const;

export type PassengerReportType = typeof reportTypes[number];

export interface PassengerReport
{
    id: string;
    journeyRef: string;
    stopId: string | null;
    type: PassengerReportType;
    message: string | null;
    createdAt: string;
}

export interface NewPassengerReport
{
    journeyRef: string;
    stopId: string | null;
    type: PassengerReportType;
    message: string | null;
}

const memoryReports: PassengerReport[] = [];
const memorySubmissions: Array<{ journeyRef: string; submittedAt: number }> = [];
const reportCooldownMilliseconds = 2_000;
const reportWindowMilliseconds = 60_000;
const reportRetentionMilliseconds = 7 * 24 * 60 * 60 * 1000;
const maximumReportsPerJourneyWindow = 30;
const maximumReportsPerWindow = 300;
const maximumMemoryReports = 3_000;
const reportAdmissionQueue = new BoundedConcurrency(4, 100);

export class PassengerReportRateLimitError extends Error
{
    public constructor(public readonly retryAfterSeconds: number)
    {
        super("Passenger report rate limit exceeded");
    }
}

export async function listPassengerReports(journeyRef: string): Promise<PassengerReport[]>
{
    const pool = getDatabasePool();

    if (!pool)
    {
        return memoryReports
            .filter((report) => report.journeyRef === journeyRef)
            .slice(-30)
            .reverse();
    }

    const result = await pool.query<{
        id: string;
        journey_ref: string;
        stop_external_id: string | null;
        report_type: PassengerReportType;
        message: string | null;
        created_at: Date;
    }>(
        `SELECT id, journey_ref, stop_external_id, report_type, message, created_at
         FROM passenger_reports
         WHERE journey_ref = $1
         ORDER BY created_at DESC
         LIMIT 30`,
        [journeyRef]
    );

    return result.rows.map((row) =>
    {
        return {
            id: row.id,
            journeyRef: row.journey_ref,
            stopId: row.stop_external_id,
            type: row.report_type,
            message: row.message,
            createdAt: row.created_at.toISOString()
        };
    });
}

export async function createPassengerReport(input: NewPassengerReport): Promise<PassengerReport>
{
    const pool = getDatabasePool();

    if (!pool)
    {
        return createMemoryPassengerReport(input);
    }

    try
    {
        return await reportAdmissionQueue.run(() => createDatabasePassengerReport(pool, input));
    }
    catch (error)
    {
        if (error instanceof WorkQueueFullError)
        {
            throw new PassengerReportRateLimitError(60);
        }

        throw error;
    }
}

async function createDatabasePassengerReport(pool: Pool, input: NewPassengerReport): Promise<PassengerReport>
{
    const client = await pool.connect();
    let transactionOpen = false;

    try
    {
        await client.query("BEGIN");
        transactionOpen = true;
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["busminute:passenger-reports"]);
        await client.query(
            "DELETE FROM passenger_reports WHERE created_at < now() - interval '7 days'"
        );
        const admission = await client.query<{
            journey_cooldown_recent: string;
            journey_recent: string;
            global_recent: string;
        }>(
            `SELECT
                count(*) FILTER (
                    WHERE journey_ref = $1
                    AND created_at >= now() - interval '2 seconds'
                ) AS journey_cooldown_recent,
                count(*) FILTER (
                    WHERE journey_ref = $1
                    AND created_at >= now() - interval '1 minute'
                ) AS journey_recent,
                count(*) FILTER (
                    WHERE created_at >= now() - interval '1 minute'
                ) AS global_recent
             FROM passenger_reports
             WHERE created_at >= now() - interval '1 minute'`,
            [input.journeyRef]
        );
        const counters = admission.rows[0];

        if (!counters
            || Number(counters.journey_cooldown_recent) > 0
            || Number(counters.journey_recent) >= maximumReportsPerJourneyWindow
            || Number(counters.global_recent) >= maximumReportsPerWindow)
        {
            throw new PassengerReportRateLimitError(Number(counters?.journey_cooldown_recent) > 0 ? 2 : 60);
        }

        const report = await insertPassengerReport(client, input);
        await client.query("COMMIT");
        transactionOpen = false;
        return report;
    }
    catch (error)
    {
        if (transactionOpen)
        {
            await client.query("ROLLBACK").catch(() => undefined);
        }

        throw error;
    }
    finally
    {
        client.release();
    }
}

async function insertPassengerReport(client: PoolClient, input: NewPassengerReport): Promise<PassengerReport>
{
    const result = await client.query<{
        id: string;
        journey_ref: string;
        stop_external_id: string | null;
        report_type: PassengerReportType;
        message: string | null;
        created_at: Date;
    }>(
        `INSERT INTO passenger_reports
            (journey_ref, stop_external_id, report_type, message, anonymous_fingerprint)
         VALUES ($1, $2, $3, $4, encode(digest('anonymous', 'sha256'), 'hex'))
         RETURNING id, journey_ref, stop_external_id, report_type, message, created_at`,
        [input.journeyRef, input.stopId, input.type, input.message]
    );
    const row = result.rows[0];

    if (!row)
    {
        throw new Error("Le signalement n'a pas été enregistré");
    }

    return {
        id: row.id,
        journeyRef: row.journey_ref,
        stopId: row.stop_external_id,
        type: row.report_type,
        message: row.message,
        createdAt: row.created_at.toISOString()
    };
}

function createMemoryPassengerReport(input: NewPassengerReport, now = Date.now()): PassengerReport
{
    while (memoryReports[0] && new Date(memoryReports[0].createdAt).getTime() < now - reportRetentionMilliseconds)
    {
        memoryReports.shift();
    }

    while (memorySubmissions[0] && memorySubmissions[0].submittedAt < now - reportWindowMilliseconds)
    {
        memorySubmissions.shift();
    }

    const journeyCooldownReached = memorySubmissions.some((submission) =>
    {
        return submission.journeyRef === input.journeyRef
            && submission.submittedAt >= now - reportCooldownMilliseconds;
    });
    const journeyCount = memorySubmissions.filter((submission) => submission.journeyRef === input.journeyRef).length;

    if (journeyCooldownReached
        || journeyCount >= maximumReportsPerJourneyWindow
        || memorySubmissions.length >= maximumReportsPerWindow)
    {
        throw new PassengerReportRateLimitError(journeyCooldownReached ? 2 : 60);
    }

    const report: PassengerReport = {
        id: randomUUID(),
        journeyRef: input.journeyRef,
        stopId: input.stopId,
        type: input.type,
        message: input.message,
        createdAt: new Date(now).toISOString()
    };
    memorySubmissions.push({ journeyRef: input.journeyRef, submittedAt: now });
    memoryReports.push(report);

    if (memoryReports.length > maximumMemoryReports)
    {
        memoryReports.splice(0, memoryReports.length - maximumMemoryReports);
    }

    return report;
}

export function isPassengerReportType(value: unknown): value is PassengerReportType
{
    return typeof value === "string" && reportTypes.includes(value as PassengerReportType);
}

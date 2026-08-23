import { randomUUID } from "node:crypto";
import { getDatabasePool } from "../db/database.js";

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
    fingerprint: string;
}

const memoryReports: PassengerReport[] = [];

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
        const report: PassengerReport = {
            id: randomUUID(),
            journeyRef: input.journeyRef,
            stopId: input.stopId,
            type: input.type,
            message: input.message,
            createdAt: new Date().toISOString()
        };
        memoryReports.push(report);
        return report;
    }

    const result = await pool.query<{
        id: string;
        journey_ref: string;
        stop_external_id: string | null;
        report_type: PassengerReportType;
        message: string | null;
        created_at: Date;
    }>(
        `INSERT INTO passenger_reports
            (journey_ref, stop_external_id, report_type, message, anonymous_fingerprint)
         VALUES ($1, $2, $3, $4, encode(digest($5, 'sha256'), 'hex'))
         RETURNING id, journey_ref, stop_external_id, report_type, message, created_at`,
        [input.journeyRef, input.stopId, input.type, input.message, input.fingerprint]
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

export function isPassengerReportType(value: unknown): value is PassengerReportType
{
    return typeof value === "string" && reportTypes.includes(value as PassengerReportType);
}

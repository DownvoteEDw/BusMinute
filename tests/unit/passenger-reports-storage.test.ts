import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() =>
{
    return {
        connect: vi.fn(),
        query: vi.fn(),
        release: vi.fn()
    };
});

vi.mock("../../src/db/database.js", () =>
{
    return {
        getDatabasePool: () => ({ connect: database.connect })
    };
});

import
{
    createPassengerReport,
    PassengerReportRateLimitError
} from "../../src/application/passenger-reports.js";

describe("stockage des signalements voyageurs", () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
        database.connect.mockResolvedValue({
            query: database.query,
            release: database.release
        });
    });

    it("admet et insère le signalement dans une transaction verrouillée", async () =>
    {
        database.query.mockImplementation(async (sql: string) =>
        {
            if (sql.includes("AS journey_cooldown_recent"))
            {
                return { rows: [{ journey_cooldown_recent: "0", journey_recent: "0", global_recent: "0" }] };
            }

            if (sql.includes("INSERT INTO passenger_reports"))
            {
                return {
                    rows: [{
                        id: "report-id",
                        journey_ref: "journey",
                        stop_external_id: "XPB",
                        report_type: "BUS_ARRIVED",
                        message: null,
                        created_at: new Date("2026-09-12T00:00:00Z")
                    }]
                };
            }

            return { rows: [] };
        });

        const report = await createPassengerReport(input());
        const statements = database.query.mock.calls.map(([sql]) => String(sql));

        expect(report.id).toBe("report-id");
        expect(statements[0]).toBe("BEGIN");
        expect(statements.some((sql) => sql.includes("pg_advisory_xact_lock"))).toBe(true);
        expect(statements.some((sql) => sql.includes("DELETE FROM passenger_reports"))).toBe(true);
        expect(statements.some((sql) => sql.includes("INSERT INTO passenger_reports"))).toBe(true);
        expect(statements.at(-1)).toBe("COMMIT");
        expect(database.release).toHaveBeenCalledOnce();
    });

    it("annule la transaction quand le quota partagé est atteint", async () =>
    {
        database.query.mockImplementation(async (sql: string) =>
        {
            if (sql.includes("AS journey_cooldown_recent"))
            {
                return { rows: [{ journey_cooldown_recent: "1", journey_recent: "1", global_recent: "1" }] };
            }

            return { rows: [] };
        });

        await expect(createPassengerReport(input())).rejects.toBeInstanceOf(PassengerReportRateLimitError);
        const statements = database.query.mock.calls.map(([sql]) => String(sql));
        expect(statements.some((sql) => sql.includes("INSERT INTO passenger_reports"))).toBe(false);
        expect(statements.at(-1)).toBe("ROLLBACK");
        expect(database.release).toHaveBeenCalledOnce();
    });
});

function input()
{
    return {
        journeyRef: "journey",
        stopId: "XPB",
        type: "BUS_ARRIVED" as const,
        message: null
    };
}

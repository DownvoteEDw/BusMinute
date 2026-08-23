import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { PostgresRealtimeRepository } from "../../src/db/postgres-realtime-repository.js";
import { PostgresTransitSnapshotRepository } from "../../src/db/postgres-transit-snapshot-repository.js";
import { BlaBlaCarGtfsImporter } from "../../src/providers/blablacar/gtfs/importer.js";
import { BlaBlaCarSiriParser } from "../../src/providers/blablacar/siri/parser.js";

const gtfsPath = fileURLToPath(new URL("../fixtures/gtfs-50819", import.meta.url));
const siriPath = fileURLToPath(new URL("../fixtures/siri-50819-2026-08-22.json", import.meta.url));

interface CapturedQuery
{
    sql: string;
    values: unknown[];
}

describe("persistance du temps réel", () =>
{
    it("prépare et enregistre une circulation et ses observations par lots", async () =>
    {
        const queries: CapturedQuery[] = [];
        const pool = fakePool(queries);
        const feed = await new BlaBlaCarGtfsImporter().import(gtfsPath);
        const payload = JSON.parse(await readFile(siriPath, "utf8")) as unknown;
        const timetable = new BlaBlaCarSiriParser().parse(payload);
        const repository = new PostgresRealtimeRepository(pool);
        const counts = await repository.persistTimetable("blablacar-bus", feed, timetable);

        expect(counts).toEqual(
        {
            journeys: 1,
            stopUpdates: 3,
            observations: 3,
            matches: 1
        });

        const journeyQuery = queries.find((query) => query.sql.includes("INSERT INTO trip_instances"));
        const stopQuery = queries.find((query) => query.sql.includes("INSERT INTO trip_stop_realtime"));
        const observationQuery = queries.find((query) => query.sql.includes("INSERT INTO trip_stop_observations"));
        const matchQuery = queries.find((query) => query.sql.includes("INSERT INTO trip_source_matches"));
        const journeyRecords = parseRecords(journeyQuery);
        const stopRecords = parseRecords(stopQuery);

        expect(journeyRecords).toHaveLength(1);
        expect(journeyRecords[0]).toMatchObject(
        {
            journey_ref: "50819:2026-08-22",
            scheduled_trip_external_id: "7672428505",
            status: "arrived",
            current_delay_seconds: -544
        });
        expect(stopRecords.map((record) => record.stop_external_id)).toEqual(["XPB", "XOS", "XTO"]);
        expect(stopRecords[0]?.actual_departure_at).toBe("2026-08-22T09:55:31.000Z");
        expect(observationQuery?.sql).toContain("ON CONFLICT (trip_instance_id, stop_sequence, source_updated_at) DO NOTHING");
        expect(matchQuery?.sql).toContain("BLABLACAR_SIRI");
    });

    it("reconstruit une circulation historique lisible par le front", async () =>
    {
        const pool = {
            async query()
            {
                return {
                    rowCount: 3,
                    rows: [
                        realtimeRow("XPB", "Paris - Bercy-Seine Bus Station", 1, null, "2026-08-22T09:55:31.000Z"),
                        realtimeRow("XOS", "Orléans - Georges Pompidou Bus Stop", 2, "2026-08-22T11:31:01.000Z", null),
                        realtimeRow("XTO", "Tours - Vaucanson Bus Station", 3, "2026-08-22T12:50:56.000Z", null)
                    ]
                };
            }
        } as unknown as Pool;
        const journey = await new PostgresTransitSnapshotRepository(pool).loadJourney("50819:2026-08-22");

        expect(journey?.journeyRef).toBe("50819:2026-08-22");
        expect(journey?.serviceDate).toBe("2026-08-22");
        expect(journey?.calls.map((call) => call.stopPointRef)).toEqual(["XPB", "XOS", "XTO"]);
        expect(journey?.calls[0]?.actualDepartureTime?.toISOString()).toBe("2026-08-22T09:55:31.000Z");
        expect(journey?.calls[2]?.actualArrivalTime?.toISOString()).toBe("2026-08-22T12:50:56.000Z");
    });

    it("calcule la ponctualité observée d’une ligne", async () =>
    {
        const pool = {
            async query()
            {
                return {
                    rowCount: 1,
                    rows: [
                        {
                            sample_size: 12,
                            average_delay_seconds: "420",
                            on_time_percentage: "75"
                        }
                    ]
                };
            }
        } as unknown as Pool;
        const summary = await new PostgresTransitSnapshotRepository(pool).loadPunctuality("50819", "XTO");

        expect(summary).toEqual(
        {
            sampleSize: 12,
            averageDelaySeconds: 420,
            onTimePercentage: 75,
            windowDays: 90,
            thresholdMinutes: 15
        });
    });
});

function fakePool(queries: CapturedQuery[]): Pool
{
    const client = {
        async query(sql: string, values: unknown[] = [])
        {
            queries.push({ sql, values });

            if (sql.includes("SELECT id FROM operators"))
            {
                return { rows: [{ id: "operator-1" }], rowCount: 1 };
            }

            if (sql.includes("INSERT INTO trip_instances"))
            {
                return { rows: [{ id: "journey-1" }], rowCount: 1 };
            }

            if (sql.includes("INSERT INTO trip_stop_realtime"))
            {
                return { rows: [{ id: "1" }, { id: "2" }, { id: "3" }], rowCount: 3 };
            }

            if (sql.includes("INSERT INTO trip_stop_observations"))
            {
                return { rows: [{ id: "1" }, { id: "2" }, { id: "3" }], rowCount: 3 };
            }

            if (sql.includes("INSERT INTO trip_source_matches"))
            {
                return { rows: [{ id: "match-1" }], rowCount: 1 };
            }

            return { rows: [], rowCount: 0 };
        },
        release()
        {
        }
    };

    return {
        async connect()
        {
            return client;
        }
    } as unknown as Pool;
}

function parseRecords(query: CapturedQuery | undefined): Array<Record<string, unknown>>
{
    const value = query?.values[1];

    if (typeof value !== "string")
    {
        return [];
    }

    return JSON.parse(value) as Array<Record<string, unknown>>;
}

function realtimeRow(
    stopId: string,
    stopName: string,
    sequence: number,
    actualArrivalAt: string | null,
    actualDepartureAt: string | null
): Record<string, unknown>
{
    return {
        journey_ref: "50819:2026-08-22",
        service_number: "50819",
        service_date: "2026-08-22",
        journey_status: "arrived",
        complete_stop_sequence: true,
        recorded_at: "2026-08-22T22:51:28.985Z",
        stop_external_id: stopId,
        stop_name: stopName,
        stop_sequence: sequence,
        aimed_arrival_at: sequence === 1 ? null : `2026-08-22T${sequence === 2 ? "11:35:00" : "13:00:00"}.000Z`,
        expected_arrival_at: null,
        actual_arrival_at: actualArrivalAt,
        aimed_departure_at: sequence === 1 ? "2026-08-22T09:50:00.000Z" : null,
        expected_departure_at: null,
        actual_departure_at: actualDepartureAt,
        arrival_status: null,
        departure_status: null,
        stop_cancelled: false,
        extra_call: false
    };
}

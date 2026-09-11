import type { Pool, PoolClient } from "pg";
import type { GtfsFeed, SiriCall, SiriEstimatedTimetable, SiriJourney } from "../domain/models.js";
import { GtfsSiriTripMatcher } from "../services/trip-matcher.js";

export interface PersistedRealtimeCounts
{
    journeys: number;
    stopUpdates: number;
    observations: number;
    matches: number;
}

interface JourneyRecord
{
    journey_ref: string;
    service_number: string;
    service_date: string;
    scheduled_trip_external_id: string | null;
    status: string;
    current_delay_seconds: number | null;
    scheduled_departure_at: string | null;
    scheduled_arrival_at: string | null;
    complete_stop_sequence: boolean;
    source_updated_at: string;
}

interface StopRecord
{
    journey_ref: string;
    stop_external_id: string;
    stop_sequence: number;
    aimed_arrival_at: string | null;
    expected_arrival_at: string | null;
    actual_arrival_at: string | null;
    aimed_departure_at: string | null;
    expected_departure_at: string | null;
    actual_departure_at: string | null;
    arrival_status: string | null;
    departure_status: string | null;
    cancelled: boolean;
    extra_call: boolean;
    source_updated_at: string;
}

interface MatchRecord
{
    journey_ref: string;
    source_reference: string;
    match_method: string;
    confidence: number;
    score_details: object;
}

export class PostgresRealtimeRepository
{
    private readonly matcher = new GtfsSiriTripMatcher();

    public constructor(private readonly pool: Pool)
    {
    }

    public async persistTimetable(
        operatorSlug: string,
        feed: GtfsFeed,
        timetable: SiriEstimatedTimetable
    ): Promise<PersistedRealtimeCounts>
    {
        const client = await this.pool.connect();

        try
        {
            await client.query("BEGIN");
            const operatorId = await this.operatorId(client, operatorSlug);
            const prepared = this.prepareRecords(feed, timetable.journeys);
            const journeyCount = await this.upsertJourneys(client, operatorId, prepared.journeys);
            const stopUpdateCount = await this.upsertStops(client, operatorId, prepared.stops);
            const observationCount = await this.insertObservations(client, operatorId, prepared.stops);
            const matchCount = await this.upsertMatches(client, operatorId, prepared.matches);
            await client.query(
                `INSERT INTO provider_fetches
                    (operator_id, source, fetched_at, http_status, expires_at)
                 VALUES ($1, 'SIRI_ESTIMATED_TIMETABLE', $2, 200, $3)`,
                [operatorId, timetable.responseTimestamp, timetable.validUntil ?? timetable.responseTimestamp]
            );
            await client.query("COMMIT");

            return {
                journeys: journeyCount,
                stopUpdates: stopUpdateCount,
                observations: observationCount,
                matches: matchCount
            };
        }
        catch (error)
        {
            await client.query("ROLLBACK");
            throw error;
        }
        finally
        {
            client.release();
        }
    }

    public async startSyncRun(source: string, operatorSlug = "blablacar-bus"): Promise<string>
    {
        const result = await this.pool.query<{ id: string }>(
            `INSERT INTO data_sync_runs (operator_id, source, status)
             SELECT id, $2, 'RUNNING'
             FROM operators
             WHERE slug = $1
             RETURNING id`,
            [operatorSlug, source]
        );
        const id = result.rows[0]?.id;

        if (id)
        {
            return id;
        }

        const fallback = await this.pool.query<{ id: string }>(
            `INSERT INTO data_sync_runs (source, status)
             VALUES ($1, 'RUNNING')
             RETURNING id`,
            [source]
        );
        const fallbackId = fallback.rows[0]?.id;

        if (!fallbackId)
        {
            throw new Error(`Impossible de démarrer la synchronisation ${source}`);
        }

        return fallbackId;
    }

    public async completeSyncRun(id: string, itemCount: number, sourceTimestamp: Date | null): Promise<void>
    {
        await this.pool.query(
            `UPDATE data_sync_runs
             SET status = 'SUCCEEDED',
                 completed_at = now(),
                 source_timestamp = $2,
                 item_count = $3
             WHERE id = $1`,
            [id, sourceTimestamp, itemCount]
        );
    }

    public async failSyncRun(id: string, error: unknown): Promise<void>
    {
        const message = error instanceof Error ? error.message : String(error);
        await this.pool.query(
            `UPDATE data_sync_runs
             SET status = 'FAILED',
                 completed_at = now(),
                 error_message = $2
             WHERE id = $1`,
            [id, message.slice(0, 2000)]
        );
    }

    public async purgeOldData(retentionDays: number): Promise<number>
    {
        const result = await this.pool.query(
            `DELETE FROM trip_stop_observations
             WHERE received_at < now() - make_interval(days => $1)`,
            [retentionDays]
        );
        await this.pool.query(
            `DELETE FROM provider_fetches
             WHERE fetched_at < now() - interval '7 days'`
        );
        await this.pool.query(
            `DELETE FROM data_sync_runs
             WHERE started_at < now() - interval '30 days'`
        );
        await this.pool.query(
            `DELETE FROM passenger_reports
             WHERE created_at < now() - interval '7 days'`
        );
        return result.rowCount ?? 0;
    }

    private prepareRecords(feed: GtfsFeed, journeys: SiriJourney[]):
    {
        journeys: JourneyRecord[];
        stops: StopRecord[];
        matches: MatchRecord[];
    }
    {
        const journeyRecords: JourneyRecord[] = [];
        const stopRecords: StopRecord[] = [];
        const matchRecords: MatchRecord[] = [];

        for (const journey of journeys)
        {
            const match = this.matcher.match(feed, journey);
            const firstCall = journey.calls[0];
            const finalCall = journey.calls[journey.calls.length - 1];
            journeyRecords.push(
            {
                journey_ref: journey.journeyRef,
                service_number: journey.serviceNumber,
                service_date: journey.serviceDate,
                scheduled_trip_external_id: match.match?.trip.externalId ?? null,
                status: operationalStatus(journey),
                current_delay_seconds: currentDelay(journey.calls),
                scheduled_departure_at: iso(firstCall?.aimedDepartureTime ?? firstCall?.aimedArrivalTime ?? null),
                scheduled_arrival_at: iso(finalCall?.aimedArrivalTime ?? finalCall?.aimedDepartureTime ?? null),
                complete_stop_sequence: journey.completeStopSequence,
                source_updated_at: journey.recordedAtTime.toISOString()
            });

            for (const call of journey.calls)
            {
                stopRecords.push(
                {
                    journey_ref: journey.journeyRef,
                    stop_external_id: call.stopPointRef,
                    stop_sequence: call.order,
                    aimed_arrival_at: iso(call.aimedArrivalTime),
                    expected_arrival_at: iso(call.expectedArrivalTime),
                    actual_arrival_at: iso(call.actualArrivalTime),
                    aimed_departure_at: iso(call.aimedDepartureTime),
                    expected_departure_at: iso(call.expectedDepartureTime),
                    actual_departure_at: iso(call.actualDepartureTime),
                    arrival_status: call.arrivalStatus,
                    departure_status: call.departureStatus,
                    cancelled: call.cancellation,
                    extra_call: call.extraCall,
                    source_updated_at: journey.recordedAtTime.toISOString()
                });
            }

            if (match.status === "matched" && match.match)
            {
                matchRecords.push(
                {
                    journey_ref: journey.journeyRef,
                    source_reference: journey.journeyRef,
                    match_method: match.match.method,
                    confidence: match.match.score.total,
                    score_details: match.match.score
                });
            }
        }

        return {
            journeys: journeyRecords,
            stops: stopRecords,
            matches: matchRecords
        };
    }

    private async operatorId(client: PoolClient, slug: string): Promise<string>
    {
        const result = await client.query<{ id: string }>(
            "SELECT id FROM operators WHERE slug = $1",
            [slug]
        );
        const id = result.rows[0]?.id;

        if (!id)
        {
            throw new Error(`L'opérateur ${slug} doit être importé avant le temps réel`);
        }

        return id;
    }

    private async upsertJourneys(client: PoolClient, operatorId: string, records: JourneyRecord[]): Promise<number>
    {
        if (records.length === 0)
        {
            return 0;
        }

        const result = await client.query(
            `WITH input AS
            (
                SELECT *
                FROM jsonb_to_recordset($2::jsonb) AS value
                (
                    journey_ref text,
                    service_number text,
                    service_date date,
                    scheduled_trip_external_id text,
                    status text,
                    current_delay_seconds integer,
                    scheduled_departure_at timestamptz,
                    scheduled_arrival_at timestamptz,
                    complete_stop_sequence boolean,
                    source_updated_at timestamptz
                )
            )
            INSERT INTO trip_instances
                (operator_id, scheduled_trip_id, service_number, service_date, siri_journey_ref, status,
                 current_delay_seconds, scheduled_departure_at, scheduled_arrival_at,
                 complete_stop_sequence, source_updated_at)
            SELECT $1, scheduled.id, input.service_number, input.service_date, input.journey_ref, input.status,
                   input.current_delay_seconds, input.scheduled_departure_at, input.scheduled_arrival_at,
                   input.complete_stop_sequence, input.source_updated_at
            FROM input
            LEFT JOIN scheduled_trips scheduled
              ON scheduled.operator_id = $1
             AND scheduled.external_trip_id = input.scheduled_trip_external_id
            ON CONFLICT (operator_id, siri_journey_ref) DO UPDATE
            SET scheduled_trip_id = EXCLUDED.scheduled_trip_id,
                status = EXCLUDED.status,
                current_delay_seconds = EXCLUDED.current_delay_seconds,
                scheduled_departure_at = EXCLUDED.scheduled_departure_at,
                scheduled_arrival_at = EXCLUDED.scheduled_arrival_at,
                complete_stop_sequence = EXCLUDED.complete_stop_sequence,
                source_updated_at = EXCLUDED.source_updated_at,
                updated_at = now()
            RETURNING id`,
            [operatorId, JSON.stringify(records)]
        );
        return result.rowCount ?? 0;
    }

    private async upsertStops(client: PoolClient, operatorId: string, records: StopRecord[]): Promise<number>
    {
        if (records.length === 0)
        {
            return 0;
        }

        const result = await client.query(
            `${stopInputSql()}
            INSERT INTO trip_stop_realtime
                (trip_instance_id, stop_id, stop_sequence, aimed_arrival_at, expected_arrival_at,
                 actual_arrival_at, aimed_departure_at, expected_departure_at, actual_departure_at,
                 arrival_status, departure_status, cancelled, extra_call, source_updated_at)
            SELECT trip.id, stop.id, input.stop_sequence, input.aimed_arrival_at, input.expected_arrival_at,
                   input.actual_arrival_at, input.aimed_departure_at, input.expected_departure_at,
                   input.actual_departure_at, input.arrival_status, input.departure_status,
                   input.cancelled, input.extra_call, input.source_updated_at
            FROM input
            JOIN trip_instances trip
              ON trip.operator_id = $1
             AND trip.siri_journey_ref = input.journey_ref
            JOIN stops stop
              ON stop.operator_id = $1
             AND stop.external_id = input.stop_external_id
            ON CONFLICT (trip_instance_id, stop_sequence) DO UPDATE
            SET stop_id = EXCLUDED.stop_id,
                aimed_arrival_at = EXCLUDED.aimed_arrival_at,
                expected_arrival_at = EXCLUDED.expected_arrival_at,
                actual_arrival_at = EXCLUDED.actual_arrival_at,
                aimed_departure_at = EXCLUDED.aimed_departure_at,
                expected_departure_at = EXCLUDED.expected_departure_at,
                actual_departure_at = EXCLUDED.actual_departure_at,
                arrival_status = EXCLUDED.arrival_status,
                departure_status = EXCLUDED.departure_status,
                cancelled = EXCLUDED.cancelled,
                extra_call = EXCLUDED.extra_call,
                source_updated_at = EXCLUDED.source_updated_at
            RETURNING id`,
            [operatorId, JSON.stringify(records)]
        );
        return result.rowCount ?? 0;
    }

    private async insertObservations(client: PoolClient, operatorId: string, records: StopRecord[]): Promise<number>
    {
        if (records.length === 0)
        {
            return 0;
        }

        const result = await client.query(
            `${stopInputSql()}
            INSERT INTO trip_stop_observations
                (trip_instance_id, stop_id, stop_sequence, aimed_arrival_at, expected_arrival_at,
                 actual_arrival_at, aimed_departure_at, expected_departure_at, actual_departure_at,
                 arrival_status, departure_status, cancelled, extra_call, source_updated_at)
            SELECT trip.id, stop.id, input.stop_sequence, input.aimed_arrival_at, input.expected_arrival_at,
                   input.actual_arrival_at, input.aimed_departure_at, input.expected_departure_at,
                   input.actual_departure_at, input.arrival_status, input.departure_status,
                   input.cancelled, input.extra_call, input.source_updated_at
            FROM input
            JOIN trip_instances trip
              ON trip.operator_id = $1
             AND trip.siri_journey_ref = input.journey_ref
            JOIN stops stop
              ON stop.operator_id = $1
             AND stop.external_id = input.stop_external_id
            ON CONFLICT (trip_instance_id, stop_sequence, source_updated_at) DO NOTHING
            RETURNING id`,
            [operatorId, JSON.stringify(records)]
        );
        return result.rowCount ?? 0;
    }

    private async upsertMatches(client: PoolClient, operatorId: string, records: MatchRecord[]): Promise<number>
    {
        if (records.length === 0)
        {
            return 0;
        }

        const result = await client.query(
            `WITH input AS
            (
                SELECT *
                FROM jsonb_to_recordset($2::jsonb) AS value
                (
                    journey_ref text,
                    source_reference text,
                    match_method text,
                    confidence numeric,
                    score_details jsonb
                )
            )
            INSERT INTO trip_source_matches
                (trip_instance_id, source, source_reference, match_method, confidence, score_details)
            SELECT trip.id, 'BLABLACAR_SIRI', input.source_reference, input.match_method,
                   input.confidence, input.score_details
            FROM input
            JOIN trip_instances trip
              ON trip.operator_id = $1
             AND trip.siri_journey_ref = input.journey_ref
            ON CONFLICT (trip_instance_id, source, source_reference) DO UPDATE
            SET match_method = EXCLUDED.match_method,
                confidence = EXCLUDED.confidence,
                score_details = EXCLUDED.score_details
            RETURNING id`,
            [operatorId, JSON.stringify(records)]
        );
        return result.rowCount ?? 0;
    }
}

function stopInputSql(): string
{
    return `WITH input AS
    (
        SELECT *
        FROM jsonb_to_recordset($2::jsonb) AS value
        (
            journey_ref text,
            stop_external_id text,
            stop_sequence integer,
            aimed_arrival_at timestamptz,
            expected_arrival_at timestamptz,
            actual_arrival_at timestamptz,
            aimed_departure_at timestamptz,
            expected_departure_at timestamptz,
            actual_departure_at timestamptz,
            arrival_status text,
            departure_status text,
            cancelled boolean,
            extra_call boolean,
            source_updated_at timestamptz
        )
    )`;
}

function operationalStatus(journey: SiriJourney): string
{
    if (journey.cancellation)
    {
        return "cancelled";
    }

    const finalCall = journey.calls[journey.calls.length - 1];

    if (finalCall?.actualArrivalTime)
    {
        return "arrived";
    }

    if (journey.calls.some((call) => call.actualArrivalTime || call.actualDepartureTime))
    {
        return "in_transit";
    }

    return "scheduled";
}

function currentDelay(calls: SiriCall[]): number | null
{
    for (let index = calls.length - 1; index >= 0; index -= 1)
    {
        const call = calls[index];

        if (!call)
        {
            continue;
        }

        const arrival = difference(call.actualArrivalTime ?? call.expectedArrivalTime, call.aimedArrivalTime);

        if (arrival !== null)
        {
            return arrival;
        }

        const departure = difference(call.actualDepartureTime ?? call.expectedDepartureTime, call.aimedDepartureTime);

        if (departure !== null)
        {
            return departure;
        }
    }

    return null;
}

function difference(observed: Date | null, aimed: Date | null): number | null
{
    if (!observed || !aimed)
    {
        return null;
    }

    return Math.round((observed.getTime() - aimed.getTime()) / 1000);
}

function iso(date: Date | null): string | null
{
    return date?.toISOString() ?? null;
}

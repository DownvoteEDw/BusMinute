import type { Pool } from "pg";
import type
{
    GtfsFeed,
    GtfsScheduledTrip,
    GtfsStopTime,
    SiriCall,
    SiriEstimatedTimetable,
    SiriJourney
} from "../domain/models.js";
import type { PunctualitySummaryView } from "../application/journey-view.js";

interface OperatorRow
{
    id: string;
    slug: string;
    name: string;
    source_timezone: string;
}

interface RealtimeRow
{
    journey_ref: string;
    service_number: string;
    service_date: Date | string;
    journey_status: string;
    complete_stop_sequence: boolean;
    recorded_at: Date | string;
    stop_external_id: string | null;
    stop_name: string | null;
    stop_sequence: number | null;
    aimed_arrival_at: Date | string | null;
    expected_arrival_at: Date | string | null;
    actual_arrival_at: Date | string | null;
    aimed_departure_at: Date | string | null;
    expected_departure_at: Date | string | null;
    actual_departure_at: Date | string | null;
    arrival_status: string | null;
    departure_status: string | null;
    stop_cancelled: boolean | null;
    extra_call: boolean | null;
}

export interface TransitSyncStatus
{
    source: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    sourceTimestamp: string | null;
    itemCount: number | null;
    errorMessage: string | null;
}

export class PostgresTransitSnapshotRepository
{
    public constructor(private readonly pool: Pool, private readonly operatorSlug = "blablacar-bus")
    {
    }

    public async loadFeed(): Promise<GtfsFeed | null>
    {
        const operatorResult = await this.pool.query<OperatorRow>(
            `SELECT id, slug, name, source_timezone
             FROM operators
             WHERE slug = $1`,
            [this.operatorSlug]
        );
        const operator = operatorResult.rows[0];

        if (!operator)
        {
            return null;
        }

        const [stopsResult, routesResult, calendarsResult, exceptionsResult, tripsResult, stopTimesResult] = await Promise.all(
        [
            this.pool.query<{
                external_id: string;
                code: string | null;
                name: string;
                description: string | null;
                latitude: number;
                longitude: number;
                timezone: string | null;
                wheelchair_boarding: number | null;
            }>(
                `SELECT external_id, code, name, description, latitude, longitude, timezone, wheelchair_boarding
                 FROM stops
                 WHERE operator_id = $1
                 ORDER BY external_id`,
                [operator.id]
            ),
            this.pool.query<{
                external_id: string;
                short_name: string;
                long_name: string;
                route_type: number;
                color: string | null;
                text_color: string | null;
            }>(
                `SELECT external_id, short_name, long_name, route_type, color, text_color
                 FROM routes
                 WHERE operator_id = $1
                 ORDER BY external_id`,
                [operator.id]
            ),
            this.pool.query<{
                external_id: string;
                monday: boolean;
                tuesday: boolean;
                wednesday: boolean;
                thursday: boolean;
                friday: boolean;
                saturday: boolean;
                sunday: boolean;
                start_date: Date | string;
                end_date: Date | string;
            }>(
                `SELECT external_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday,
                        start_date, end_date
                 FROM service_calendars
                 WHERE operator_id = $1
                 ORDER BY external_id`,
                [operator.id]
            ),
            this.pool.query<{
                service_external_id: string;
                service_date: Date | string;
                exception_type: 1 | 2;
            }>(
                `SELECT calendar.external_id AS service_external_id, exception.service_date, exception.exception_type
                 FROM service_calendar_dates exception
                 JOIN service_calendars calendar ON calendar.id = exception.service_calendar_id
                 WHERE calendar.operator_id = $1
                 ORDER BY calendar.external_id, exception.service_date`,
                [operator.id]
            ),
            this.pool.query<{
                external_trip_id: string;
                route_external_id: string;
                service_external_id: string;
                service_number: string;
                headsign: string | null;
                wheelchair_accessible: number | null;
                bikes_allowed: number | null;
            }>(
                `SELECT trip.external_trip_id, route.external_id AS route_external_id,
                        calendar.external_id AS service_external_id, trip.service_number,
                        trip.headsign, trip.wheelchair_accessible, trip.bikes_allowed
                 FROM scheduled_trips trip
                 JOIN routes route ON route.id = trip.route_id
                 JOIN service_calendars calendar ON calendar.id = trip.service_calendar_id
                 WHERE trip.operator_id = $1
                 ORDER BY trip.external_trip_id`,
                [operator.id]
            ),
            this.pool.query<{
                external_trip_id: string;
                stop_external_id: string;
                stop_sequence: number;
                arrival_seconds: number;
                departure_seconds: number;
                pickup_type: number | null;
                drop_off_type: number | null;
            }>(
                `SELECT trip.external_trip_id, stop.external_id AS stop_external_id,
                        time.stop_sequence, time.arrival_seconds, time.departure_seconds,
                        time.pickup_type, time.drop_off_type
                 FROM scheduled_stop_times time
                 JOIN scheduled_trips trip ON trip.id = time.scheduled_trip_id
                 JOIN stops stop ON stop.id = time.stop_id
                 WHERE trip.operator_id = $1
                 ORDER BY trip.external_trip_id, time.stop_sequence`,
                [operator.id]
            )
        ]);

        const stopTimes = new Map<string, GtfsStopTime[]>();

        for (const row of stopTimesResult.rows)
        {
            const values = stopTimes.get(row.external_trip_id) ?? [];
            values.push(
            {
                stopExternalId: row.stop_external_id,
                sequence: row.stop_sequence,
                arrivalSeconds: row.arrival_seconds,
                departureSeconds: row.departure_seconds,
                pickupType: row.pickup_type,
                dropOffType: row.drop_off_type
            });
            stopTimes.set(row.external_trip_id, values);
        }

        return {
            agencies: [
                {
                    externalId: operator.slug,
                    name: operator.name,
                    url: operator.slug === "flixbus"
                        ? "https://www.flixbus.fr"
                        : "https://www.blablacar.fr/bus",
                    timezone: operator.source_timezone,
                    language: "fr"
                }
            ],
            stops: stopsResult.rows.map((row) =>
            {
                return {
                    externalId: row.external_id,
                    code: row.code,
                    name: row.name,
                    description: row.description,
                    latitude: row.latitude,
                    longitude: row.longitude,
                    timezone: row.timezone,
                    wheelchairBoarding: row.wheelchair_boarding
                };
            }),
            routes: routesResult.rows.map((row) =>
            {
                return {
                    externalId: row.external_id,
                    agencyExternalId: operator.slug,
                    shortName: row.short_name,
                    longName: row.long_name,
                    type: row.route_type,
                    color: row.color,
                    textColor: row.text_color
                };
            }),
            calendars: calendarsResult.rows.map((row) =>
            {
                return {
                    externalId: row.external_id,
                    monday: row.monday,
                    tuesday: row.tuesday,
                    wednesday: row.wednesday,
                    thursday: row.thursday,
                    friday: row.friday,
                    saturday: row.saturday,
                    sunday: row.sunday,
                    startDate: dateOnly(row.start_date),
                    endDate: dateOnly(row.end_date)
                };
            }),
            calendarExceptions: exceptionsResult.rows.map((row) =>
            {
                return {
                    serviceExternalId: row.service_external_id,
                    date: dateOnly(row.service_date),
                    type: row.exception_type
                };
            }),
            trips: tripsResult.rows.map((row): GtfsScheduledTrip =>
            {
                return {
                    externalId: row.external_trip_id,
                    routeExternalId: row.route_external_id,
                    serviceExternalId: row.service_external_id,
                    serviceNumber: row.service_number,
                    headsign: row.headsign,
                    wheelchairAccessible: row.wheelchair_accessible,
                    bikesAllowed: row.bikes_allowed,
                    stopTimes: stopTimes.get(row.external_trip_id) ?? []
                };
            }),
            sourcePath: "postgresql"
        };
    }

    public async loadTimetable(recentMinutes = 5): Promise<SiriEstimatedTimetable | null>
    {
        const rows = await this.loadRealtimeRows(
            `AND instance.source_updated_at >= now() - make_interval(mins => $2)`,
            [this.operatorSlug, recentMinutes]
        );
        return buildTimetable(rows);
    }

    public async loadJourney(journeyRef: string): Promise<SiriJourney | null>
    {
        const rows = await this.loadRealtimeRows(
            `AND instance.siri_journey_ref = $2`,
            [this.operatorSlug, journeyRef]
        );
        return buildTimetable(rows)?.journeys[0] ?? null;
    }

    public async latestSyncStatuses(): Promise<TransitSyncStatus[]>
    {
        const result = await this.pool.query<{
            source: string;
            status: string;
            started_at: Date | string;
            completed_at: Date | string | null;
            source_timestamp: Date | string | null;
            item_count: number | null;
            error_message: string | null;
        }>(
            `SELECT DISTINCT ON (source)
                    source, status, started_at, completed_at, source_timestamp, item_count, error_message
             FROM data_sync_runs
             ORDER BY source, started_at DESC`
        );

        return result.rows.map((row) =>
        {
            return {
                source: row.source,
                status: row.status,
                startedAt: instant(row.started_at).toISOString(),
                completedAt: row.completed_at ? instant(row.completed_at).toISOString() : null,
                sourceTimestamp: row.source_timestamp ? instant(row.source_timestamp).toISOString() : null,
                itemCount: row.item_count,
                errorMessage: row.error_message
            };
        });
    }

    public async loadPunctuality(
        serviceNumber: string,
        destinationStopId: string,
        windowDays = 90,
        thresholdMinutes = 15
    ): Promise<PunctualitySummaryView | null>
    {
        const result = await this.pool.query<{
            sample_size: number;
            average_delay_seconds: number | string | null;
            on_time_percentage: number | string | null;
        }>(
            `WITH latest_arrivals AS
            (
                SELECT DISTINCT ON (instance.id)
                       instance.id,
                       EXTRACT(EPOCH FROM (observation.actual_arrival_at - observation.aimed_arrival_at)) AS delay_seconds
                FROM trip_instances instance
                JOIN operators operator ON operator.id = instance.operator_id
                JOIN trip_stop_observations observation ON observation.trip_instance_id = instance.id
                JOIN stops stop ON stop.id = observation.stop_id
                WHERE operator.slug = $1
                  AND instance.service_number = $2
                  AND stop.external_id = $3
                  AND instance.service_date >= current_date - make_interval(days => $4)
                  AND observation.actual_arrival_at IS NOT NULL
                  AND observation.aimed_arrival_at IS NOT NULL
                ORDER BY instance.id, observation.source_updated_at DESC
            )
            SELECT COUNT(*)::integer AS sample_size,
                   ROUND(AVG(delay_seconds)) AS average_delay_seconds,
                   ROUND(100 * AVG(CASE WHEN ABS(delay_seconds) <= $5 * 60 THEN 1.0 ELSE 0.0 END)) AS on_time_percentage
            FROM latest_arrivals`,
            [this.operatorSlug, serviceNumber, destinationStopId, windowDays, thresholdMinutes]
        );
        const row = result.rows[0];

        if (!row || row.sample_size === 0 || row.average_delay_seconds === null || row.on_time_percentage === null)
        {
            return null;
        }

        return {
            sampleSize: row.sample_size,
            averageDelaySeconds: Number(row.average_delay_seconds),
            onTimePercentage: Number(row.on_time_percentage),
            windowDays,
            thresholdMinutes
        };
    }

    private async loadRealtimeRows(condition: string, values: unknown[]): Promise<RealtimeRow[]>
    {
        const result = await this.pool.query<RealtimeRow>(
            `SELECT instance.siri_journey_ref AS journey_ref, instance.service_number,
                    instance.service_date, instance.status AS journey_status,
                    instance.complete_stop_sequence,
                    COALESCE(instance.source_updated_at, instance.updated_at) AS recorded_at,
                    stop.external_id AS stop_external_id, stop.name AS stop_name,
                    realtime.stop_sequence, realtime.aimed_arrival_at, realtime.expected_arrival_at,
                    realtime.actual_arrival_at, realtime.aimed_departure_at,
                    realtime.expected_departure_at, realtime.actual_departure_at,
                    realtime.arrival_status, realtime.departure_status,
                    realtime.cancelled AS stop_cancelled, realtime.extra_call
             FROM trip_instances instance
             JOIN operators operator ON operator.id = instance.operator_id
             LEFT JOIN trip_stop_realtime realtime ON realtime.trip_instance_id = instance.id
             LEFT JOIN stops stop ON stop.id = realtime.stop_id
             WHERE operator.slug = $1
             ${condition}
             ORDER BY instance.source_updated_at DESC NULLS LAST,
                      instance.siri_journey_ref,
                      realtime.stop_sequence`,
            values
        );
        return result.rows;
    }
}

function buildTimetable(rows: RealtimeRow[]): SiriEstimatedTimetable | null
{
    if (rows.length === 0)
    {
        return null;
    }

    const journeys = new Map<string, SiriJourney>();
    let responseTimestamp = new Date(0);

    for (const row of rows)
    {
        const recordedAtTime = instant(row.recorded_at);

        if (recordedAtTime > responseTimestamp)
        {
            responseTimestamp = recordedAtTime;
        }

        let journey = journeys.get(row.journey_ref);

        if (!journey)
        {
            journey = {
                journeyRef: row.journey_ref,
                datedVehicleJourneyRef: row.journey_ref,
                lineRef: row.journey_ref,
                serviceNumber: row.service_number,
                serviceDate: dateOnly(row.service_date),
                cancellation: row.journey_status === "cancelled",
                completeStopSequence: row.complete_stop_sequence,
                recordedAtTime,
                calls: []
            };
            journeys.set(row.journey_ref, journey);
        }

        const call = realtimeCall(row);

        if (call)
        {
            journey.calls.push(call);
        }
    }

    const values = [...journeys.values()]
        .filter((journey) => journey.calls.length > 0)
        .map((journey) =>
        {
            journey.calls.sort((first, second) => first.order - second.order);
            return journey;
        });

    if (values.length === 0)
    {
        return null;
    }

    return {
        responseTimestamp,
        validUntil: null,
        version: "postgresql",
        journeys: values
    };
}

function realtimeCall(row: RealtimeRow): SiriCall | null
{
    if (!row.stop_external_id || !row.stop_name || row.stop_sequence === null)
    {
        return null;
    }

    return {
        stopPointRef: row.stop_external_id,
        order: row.stop_sequence,
        stopPointName: row.stop_name,
        aimedArrivalTime: optionalInstant(row.aimed_arrival_at),
        expectedArrivalTime: optionalInstant(row.expected_arrival_at),
        actualArrivalTime: optionalInstant(row.actual_arrival_at),
        aimedDepartureTime: optionalInstant(row.aimed_departure_at),
        expectedDepartureTime: optionalInstant(row.expected_departure_at),
        actualDepartureTime: optionalInstant(row.actual_departure_at),
        arrivalStatus: row.arrival_status,
        departureStatus: row.departure_status,
        cancellation: row.stop_cancelled ?? false,
        extraCall: row.extra_call ?? false,
        source: "combined"
    };
}

function dateOnly(value: Date | string): string
{
    if (value instanceof Date)
    {
        return value.toISOString().slice(0, 10);
    }

    return value.slice(0, 10);
}

function instant(value: Date | string): Date
{
    return value instanceof Date ? value : new Date(value);
}

function optionalInstant(value: Date | string | null): Date | null
{
    return value === null ? null : instant(value);
}

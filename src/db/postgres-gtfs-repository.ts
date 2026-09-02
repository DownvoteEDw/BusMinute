import type { Pool, PoolClient } from "pg";
import type { GtfsFeed } from "../domain/models.js";

export interface OperatorIdentity
{
    slug: string;
    name: string;
}

export interface PersistedGtfsCounts
{
    agencies: number;
    stops: number;
    routes: number;
    calendars: number;
    calendarExceptions: number;
    trips: number;
    stopTimes: number;
}

export class PostgresGtfsRepository
{
    public constructor(private readonly pool: Pool)
    {
    }

    public async replaceOperatorSchedule(feed: GtfsFeed, operator: OperatorIdentity): Promise<PersistedGtfsCounts>
    {
        const client = await this.pool.connect();

        try
        {
            await client.query("BEGIN");
            const operatorId = await this.upsertOperator(client, feed, operator);
            const stopIds = await this.upsertStops(client, operatorId, feed);
            const routeIds = await this.upsertRoutes(client, operatorId, feed);
            const calendarIds = await this.upsertCalendars(client, operatorId, feed);
            await this.replaceCalendarExceptions(client, calendarIds, feed);
            const tripIds = await this.upsertTrips(client, operatorId, routeIds, calendarIds, feed);
            const stopTimeCount = await this.replaceStopTimes(client, tripIds, stopIds, feed);
            await client.query("COMMIT");

            return {
                agencies: feed.agencies.length,
                stops: feed.stops.length,
                routes: feed.routes.length,
                calendars: feed.calendars.length,
                calendarExceptions: feed.calendarExceptions.length,
                trips: feed.trips.length,
                stopTimes: stopTimeCount
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

    private async upsertOperator(client: PoolClient, feed: GtfsFeed, operator: OperatorIdentity): Promise<string>
    {
        const timezone = feed.agencies[0]?.timezone;

        if (!timezone)
        {
            throw new Error("Le flux GTFS ne contient aucun fuseau opérateur");
        }

        const result = await client.query<{ id: string }>(
            `INSERT INTO operators (slug, name, source_timezone)
             VALUES ($1, $2, $3)
             ON CONFLICT (slug) DO UPDATE
             SET name = EXCLUDED.name,
                 source_timezone = EXCLUDED.source_timezone,
                 updated_at = now()
             RETURNING id`,
            [operator.slug, operator.name, timezone]
        );

        return requiredId(result.rows[0], "opérateur");
    }

    private async upsertStops(client: PoolClient, operatorId: string, feed: GtfsFeed): Promise<Map<string, string>>
    {
        const ids = new Map<string, string>();

        for (const stop of feed.stops)
        {
            const result = await client.query<{ id: string }>(
                `INSERT INTO stops
                    (operator_id, external_id, code, name, description, latitude, longitude, timezone, wheelchair_boarding)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (operator_id, external_id) DO UPDATE
                 SET code = EXCLUDED.code,
                     name = EXCLUDED.name,
                     description = EXCLUDED.description,
                     latitude = EXCLUDED.latitude,
                     longitude = EXCLUDED.longitude,
                     timezone = EXCLUDED.timezone,
                     wheelchair_boarding = EXCLUDED.wheelchair_boarding,
                     updated_at = now()
                 RETURNING id`,
                [
                    operatorId,
                    stop.externalId,
                    stop.code,
                    stop.name,
                    stop.description,
                    stop.latitude,
                    stop.longitude,
                    stop.timezone,
                    stop.wheelchairBoarding
                ]
            );
            ids.set(stop.externalId, requiredId(result.rows[0], `arrêt ${stop.externalId}`));
        }

        return ids;
    }

    private async upsertRoutes(client: PoolClient, operatorId: string, feed: GtfsFeed): Promise<Map<string, string>>
    {
        const ids = new Map<string, string>();

        for (const route of feed.routes)
        {
            const result = await client.query<{ id: string }>(
                `INSERT INTO routes
                    (operator_id, external_id, short_name, long_name, route_type, color, text_color)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (operator_id, external_id) DO UPDATE
                 SET short_name = EXCLUDED.short_name,
                     long_name = EXCLUDED.long_name,
                     route_type = EXCLUDED.route_type,
                     color = EXCLUDED.color,
                     text_color = EXCLUDED.text_color,
                     updated_at = now()
                 RETURNING id`,
                [
                    operatorId,
                    route.externalId,
                    route.shortName,
                    route.longName,
                    route.type,
                    route.color,
                    route.textColor
                ]
            );
            ids.set(route.externalId, requiredId(result.rows[0], `route ${route.externalId}`));
        }

        return ids;
    }

    private async upsertCalendars(client: PoolClient, operatorId: string, feed: GtfsFeed): Promise<Map<string, string>>
    {
        const ids = new Map<string, string>();
        const records = feed.calendars.map((calendar) =>
        {
            return {
                external_id: calendar.externalId,
                monday: calendar.monday,
                tuesday: calendar.tuesday,
                wednesday: calendar.wednesday,
                thursday: calendar.thursday,
                friday: calendar.friday,
                saturday: calendar.saturday,
                sunday: calendar.sunday,
                start_date: calendar.startDate,
                end_date: calendar.endDate
            };
        });

        for (const values of chunks(records, 2_000))
        {
            const result = await client.query<{ id: string; external_id: string }>(
                `WITH input AS
                (
                    SELECT *
                    FROM jsonb_to_recordset($2::jsonb) AS value
                    (
                        external_id text,
                        monday boolean,
                        tuesday boolean,
                        wednesday boolean,
                        thursday boolean,
                        friday boolean,
                        saturday boolean,
                        sunday boolean,
                        start_date date,
                        end_date date
                    )
                )
                INSERT INTO service_calendars
                    (operator_id, external_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date)
                 SELECT $1, input.external_id, input.monday, input.tuesday, input.wednesday,
                        input.thursday, input.friday, input.saturday, input.sunday,
                        input.start_date, input.end_date
                 FROM input
                 ON CONFLICT (operator_id, external_id) DO UPDATE
                 SET monday = EXCLUDED.monday,
                     tuesday = EXCLUDED.tuesday,
                     wednesday = EXCLUDED.wednesday,
                     thursday = EXCLUDED.thursday,
                     friday = EXCLUDED.friday,
                     saturday = EXCLUDED.saturday,
                     sunday = EXCLUDED.sunday,
                     start_date = EXCLUDED.start_date,
                     end_date = EXCLUDED.end_date,
                     updated_at = now()
                 RETURNING id, external_id`,
                [operatorId, JSON.stringify(values)]
            );

            for (const row of result.rows)
            {
                ids.set(row.external_id, row.id);
            }
        }

        return ids;
    }

    private async replaceCalendarExceptions(
        client: PoolClient,
        calendarIds: Map<string, string>,
        feed: GtfsFeed
    ): Promise<void>
    {
        if (calendarIds.size > 0)
        {
            await client.query(
                "DELETE FROM service_calendar_dates WHERE service_calendar_id = ANY($1::uuid[])",
                [[...calendarIds.values()]]
            );
        }

        const records = feed.calendarExceptions.map((exception) =>
        {
            return {
                service_calendar_id: requiredMapValue(
                    calendarIds,
                    exception.serviceExternalId,
                    `service ${exception.serviceExternalId}`
                ),
                service_date: exception.date,
                exception_type: exception.type
            };
        });

        for (const values of chunks(records, 5_000))
        {
            await client.query(
                `WITH input AS
                (
                    SELECT *
                    FROM jsonb_to_recordset($1::jsonb) AS value
                    (
                        service_calendar_id uuid,
                        service_date date,
                        exception_type smallint
                    )
                )
                INSERT INTO service_calendar_dates (service_calendar_id, service_date, exception_type)
                SELECT input.service_calendar_id, input.service_date, input.exception_type
                FROM input`,
                [JSON.stringify(values)]
            );
        }
    }

    private async upsertTrips(
        client: PoolClient,
        operatorId: string,
        routeIds: Map<string, string>,
        calendarIds: Map<string, string>,
        feed: GtfsFeed
    ): Promise<Map<string, string>>
    {
        const ids = new Map<string, string>();
        const records = feed.trips.map((trip) =>
        {
            return {
                route_id: requiredMapValue(routeIds, trip.routeExternalId, `route ${trip.routeExternalId}`),
                service_calendar_id: requiredMapValue(
                    calendarIds,
                    trip.serviceExternalId,
                    `service ${trip.serviceExternalId}`
                ),
                external_trip_id: trip.externalId,
                service_number: trip.serviceNumber,
                headsign: trip.headsign,
                wheelchair_accessible: trip.wheelchairAccessible,
                bikes_allowed: trip.bikesAllowed
            };
        });

        for (const values of chunks(records, 2_000))
        {
            const result = await client.query<{ id: string; external_trip_id: string }>(
                `WITH input AS
                (
                    SELECT *
                    FROM jsonb_to_recordset($2::jsonb) AS value
                    (
                        route_id uuid,
                        service_calendar_id uuid,
                        external_trip_id text,
                        service_number text,
                        headsign text,
                        wheelchair_accessible integer,
                        bikes_allowed integer
                    )
                )
                INSERT INTO scheduled_trips
                    (operator_id, route_id, service_calendar_id, external_trip_id, service_number, headsign, wheelchair_accessible, bikes_allowed)
                 SELECT $1, input.route_id, input.service_calendar_id, input.external_trip_id,
                        input.service_number, input.headsign, input.wheelchair_accessible, input.bikes_allowed
                 FROM input
                 ON CONFLICT (operator_id, external_trip_id) DO UPDATE
                 SET route_id = EXCLUDED.route_id,
                     service_calendar_id = EXCLUDED.service_calendar_id,
                     service_number = EXCLUDED.service_number,
                     headsign = EXCLUDED.headsign,
                     wheelchair_accessible = EXCLUDED.wheelchair_accessible,
                     bikes_allowed = EXCLUDED.bikes_allowed,
                     updated_at = now()
                 RETURNING id, external_trip_id`,
                [operatorId, JSON.stringify(values)]
            );

            for (const row of result.rows)
            {
                ids.set(row.external_trip_id, row.id);
            }
        }

        return ids;
    }

    private async replaceStopTimes(
        client: PoolClient,
        tripIds: Map<string, string>,
        stopIds: Map<string, string>,
        feed: GtfsFeed
    ): Promise<number>
    {
        let count = 0;
        let records: Array<Record<string, string | number | null>> = [];

        if (tripIds.size > 0)
        {
            await client.query(
                "DELETE FROM scheduled_stop_times WHERE scheduled_trip_id = ANY($1::uuid[])",
                [[...tripIds.values()]]
            );
        }

        for (const trip of feed.trips)
        {
            const tripId = requiredMapValue(tripIds, trip.externalId, `trajet ${trip.externalId}`);

            for (const stopTime of trip.stopTimes)
            {
                records.push({
                    scheduled_trip_id: tripId,
                    stop_id: requiredMapValue(stopIds, stopTime.stopExternalId, `arrêt ${stopTime.stopExternalId}`),
                    stop_sequence: stopTime.sequence,
                    arrival_seconds: stopTime.arrivalSeconds,
                    departure_seconds: stopTime.departureSeconds,
                    pickup_type: stopTime.pickupType,
                    drop_off_type: stopTime.dropOffType
                });
                count += 1;

                if (records.length >= 5_000)
                {
                    await this.insertStopTimes(client, records);
                    records = [];
                }
            }
        }

        if (records.length > 0)
        {
            await this.insertStopTimes(client, records);
        }

        return count;
    }

    private async insertStopTimes(
        client: PoolClient,
        values: Array<Record<string, string | number | null>>
    ): Promise<void>
    {
        await client.query(
            `WITH input AS
            (
                SELECT *
                FROM jsonb_to_recordset($1::jsonb) AS value
                (
                    scheduled_trip_id uuid,
                    stop_id uuid,
                    stop_sequence integer,
                    arrival_seconds integer,
                    departure_seconds integer,
                    pickup_type integer,
                    drop_off_type integer
                )
            )
            INSERT INTO scheduled_stop_times
                (scheduled_trip_id, stop_id, stop_sequence, arrival_seconds, departure_seconds, pickup_type, drop_off_type)
            SELECT input.scheduled_trip_id, input.stop_id, input.stop_sequence,
                   input.arrival_seconds, input.departure_seconds, input.pickup_type, input.drop_off_type
            FROM input`,
            [JSON.stringify(values)]
        );
    }
}

function requiredId(row: { id: string } | undefined, label: string): string
{
    if (!row?.id)
    {
        throw new Error(`Identifiant PostgreSQL absent pour ${label}`);
    }

    return row.id;
}

function requiredMapValue(values: Map<string, string>, key: string, label: string): string
{
    const value = values.get(key);

    if (!value)
    {
        throw new Error(`Identifiant PostgreSQL absent pour ${label}`);
    }

    return value;
}

function chunks<T>(values: T[], size: number): T[][]
{
    const result: T[][] = [];

    for (let index = 0; index < values.length; index += size)
    {
        result.push(values.slice(index, index + size));
    }

    return result;
}

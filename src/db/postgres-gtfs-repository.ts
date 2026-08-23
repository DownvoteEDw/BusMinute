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

        for (const calendar of feed.calendars)
        {
            const result = await client.query<{ id: string }>(
                `INSERT INTO service_calendars
                    (operator_id, external_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
                 RETURNING id`,
                [
                    operatorId,
                    calendar.externalId,
                    calendar.monday,
                    calendar.tuesday,
                    calendar.wednesday,
                    calendar.thursday,
                    calendar.friday,
                    calendar.saturday,
                    calendar.sunday,
                    calendar.startDate,
                    calendar.endDate
                ]
            );
            ids.set(calendar.externalId, requiredId(result.rows[0], `service ${calendar.externalId}`));
        }

        return ids;
    }

    private async replaceCalendarExceptions(
        client: PoolClient,
        calendarIds: Map<string, string>,
        feed: GtfsFeed
    ): Promise<void>
    {
        for (const calendarId of calendarIds.values())
        {
            await client.query(
                "DELETE FROM service_calendar_dates WHERE service_calendar_id = $1",
                [calendarId]
            );
        }

        for (const exception of feed.calendarExceptions)
        {
            const calendarId = requiredMapValue(
                calendarIds,
                exception.serviceExternalId,
                `service ${exception.serviceExternalId}`
            );
            await client.query(
                `INSERT INTO service_calendar_dates (service_calendar_id, service_date, exception_type)
                 VALUES ($1, $2, $3)`,
                [calendarId, exception.date, exception.type]
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

        for (const trip of feed.trips)
        {
            const routeId = requiredMapValue(routeIds, trip.routeExternalId, `route ${trip.routeExternalId}`);
            const calendarId = requiredMapValue(
                calendarIds,
                trip.serviceExternalId,
                `service ${trip.serviceExternalId}`
            );
            const result = await client.query<{ id: string }>(
                `INSERT INTO scheduled_trips
                    (operator_id, route_id, service_calendar_id, external_trip_id, service_number, headsign, wheelchair_accessible, bikes_allowed)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (operator_id, external_trip_id) DO UPDATE
                 SET route_id = EXCLUDED.route_id,
                     service_calendar_id = EXCLUDED.service_calendar_id,
                     service_number = EXCLUDED.service_number,
                     headsign = EXCLUDED.headsign,
                     wheelchair_accessible = EXCLUDED.wheelchair_accessible,
                     bikes_allowed = EXCLUDED.bikes_allowed,
                     updated_at = now()
                 RETURNING id`,
                [
                    operatorId,
                    routeId,
                    calendarId,
                    trip.externalId,
                    trip.serviceNumber,
                    trip.headsign,
                    trip.wheelchairAccessible,
                    trip.bikesAllowed
                ]
            );
            ids.set(trip.externalId, requiredId(result.rows[0], `trajet ${trip.externalId}`));
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

        for (const trip of feed.trips)
        {
            const tripId = requiredMapValue(tripIds, trip.externalId, `trajet ${trip.externalId}`);
            await client.query("DELETE FROM scheduled_stop_times WHERE scheduled_trip_id = $1", [tripId]);

            for (const stopTime of trip.stopTimes)
            {
                const stopId = requiredMapValue(stopIds, stopTime.stopExternalId, `arrêt ${stopTime.stopExternalId}`);
                await client.query(
                    `INSERT INTO scheduled_stop_times
                        (scheduled_trip_id, stop_id, stop_sequence, arrival_seconds, departure_seconds, pickup_type, drop_off_type)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        tripId,
                        stopId,
                        stopTime.sequence,
                        stopTime.arrivalSeconds,
                        stopTime.departureSeconds,
                        stopTime.pickupType,
                        stopTime.dropOffType
                    ]
                );
                count += 1;
            }
        }

        return count;
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

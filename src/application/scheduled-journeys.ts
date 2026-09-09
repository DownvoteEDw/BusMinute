import { DateTime } from "luxon";
import { mapCoordinates } from "./journey-map.js";
import type { GtfsFeed, GtfsScheduledTrip, GtfsStop } from "../domain/models.js";
import { cityName, type JourneyStopPhase, type JourneyStopView, type JourneyView } from "./journey-view.js";
import
{
    publicStopId,
    scheduledJourneyRef,
    type TransitOperator
} from "./operators.js";

export function scheduledServiceDates(feed: GtfsFeed, now = new Date(), dayCount = 3): string[]
{
    const timezone = feed.agencies[0]?.timezone ?? "UTC";
    const firstDate = DateTime.fromJSDate(now, { zone: timezone }).startOf("day");
    const dates: string[] = [];

    for (let offset = 0; offset < dayCount; offset += 1)
    {
        const value = firstDate.plus({ days: offset }).toISODate();

        if (value)
        {
            dates.push(value);
        }
    }

    return dates;
}

export function buildScheduledJourneyViews(
    feed: GtfsFeed,
    operator: TransitOperator,
    serviceDates = scheduledServiceDates(feed),
    now = new Date()
): JourneyView[]
{
    const activeServices = activeServicesByDate(feed, serviceDates);
    const stopsById = new Map(feed.stops.map((stop) => [stop.externalId, stop]));
    const views: JourneyView[] = [];

    for (const serviceDate of serviceDates)
    {
        const serviceIds = activeServices.get(serviceDate) ?? new Set<string>();
        const dayStart = serviceDayStart(feed, serviceDate);

        for (const trip of feed.trips)
        {
            if (!serviceIds.has(trip.serviceExternalId))
            {
                continue;
            }

            const view = buildScheduledJourneyViewWithStops(
                trip,
                serviceDate,
                operator,
                now,
                stopsById,
                dayStart
            );

            if (view)
            {
                views.push(view);
            }
        }
    }

    return views;
}

export function buildScheduledJourneyView(
    feed: GtfsFeed,
    trip: GtfsScheduledTrip,
    serviceDate: string,
    operator: TransitOperator,
    now = new Date()
): JourneyView | null
{
    const stopsById = new Map(feed.stops.map((stop) => [stop.externalId, stop]));
    return buildScheduledJourneyViewWithStops(trip, serviceDate, operator, now, stopsById, serviceDayStart(feed, serviceDate));
}

function buildScheduledJourneyViewWithStops(
    trip: GtfsScheduledTrip,
    serviceDate: string,
    operator: TransitOperator,
    now: Date,
    stopsById: Map<string, GtfsStop>,
    dayStart: number
): JourneyView | null
{
    const nowMilliseconds = now.getTime();
    const lastUpcomingIndex = trip.stopTimes.findIndex((stopTime) =>
    {
        return dayStart + stopTime.departureSeconds * 1000 >= nowMilliseconds;
    });
    const stops = trip.stopTimes.map((stopTime, index) =>
    {
        const stop = stopsById.get(stopTime.stopExternalId);
        const name = stop?.name ?? stopTime.stopExternalId;
        const phase = stopPhase(index, lastUpcomingIndex);

        return {
            stopId: publicStopId(operator, stopTime.stopExternalId),
            location: mapCoordinates(stop?.latitude, stop?.longitude),
            name,
            city: cityName(name),
            order: stopTime.sequence,
            phase,
            aimedArrivalAt: new Date(dayStart + stopTime.arrivalSeconds * 1000).toISOString(),
            expectedArrivalAt: null,
            actualArrivalAt: null,
            aimedDepartureAt: new Date(dayStart + stopTime.departureSeconds * 1000).toISOString(),
            expectedDepartureAt: null,
            actualDepartureAt: null,
            arrivalStatus: null,
            departureStatus: null,
            delaySeconds: null,
            cancelled: false
        } satisfies JourneyStopView;
    });
    const origin = stops[0];
    const destination = stops[stops.length - 1];

    if (!origin || !destination)
    {
        return null;
    }

    return {
        journeyRef: scheduledJourneyRef(operator, trip.externalId, serviceDate),
        serviceNumber: trip.serviceNumber,
        serviceDate,
        operatorSlug: operator.slug,
        operatorName: operator.name,
        realtimeAvailable: operator.realtimeAvailable,
        realtimeObserved: false,
        realtimeStatus: "scheduled_only",
        originStopId: origin.stopId,
        originName: origin.name,
        originCity: origin.city,
        destinationStopId: destination.stopId,
        destinationName: destination.name,
        destinationCity: destination.city,
        status: "scheduled",
        delaySeconds: null,
        updatedAt: now.toISOString(),
        cancelled: false,
        completeStopSequence: true,
        matchConfidence: null,
        matchMethod: "GTFS_SCHEDULE",
        scheduledTripId: trip.externalId,
        punctuality: null,
        vehiclePositions: [],
        stops
    };
}

function activeServicesByDate(feed: GtfsFeed, serviceDates: string[]): Map<string, Set<string>>
{
    const exceptions = new Map(feed.calendarExceptions.map((exception) =>
    {
        return [`${exception.serviceExternalId}:${exception.date}`, exception.type] as const;
    }));
    const values = new Map<string, Set<string>>();

    for (const serviceDate of serviceDates)
    {
        const weekday = DateTime.fromISO(serviceDate, { zone: "UTC" }).weekday;
        const services = new Set<string>();

        for (const calendar of feed.calendars)
        {
            const exception = exceptions.get(`${calendar.externalId}:${serviceDate}`);

            if (exception === 1)
            {
                services.add(calendar.externalId);
                continue;
            }

            if (exception === 2
                || serviceDate < calendar.startDate
                || serviceDate > calendar.endDate)
            {
                continue;
            }

            const active = [
                calendar.monday,
                calendar.tuesday,
                calendar.wednesday,
                calendar.thursday,
                calendar.friday,
                calendar.saturday,
                calendar.sunday
            ][weekday - 1];

            if (active)
            {
                services.add(calendar.externalId);
            }
        }

        values.set(serviceDate, services);
    }

    return values;
}

function serviceDayStart(feed: GtfsFeed, serviceDate: string): number
{
    return DateTime.fromISO(serviceDate, { zone: feed.agencies[0]?.timezone ?? "UTC" })
        .startOf("day")
        .toMillis();
}

function stopPhase(index: number, firstUpcomingIndex: number): JourneyStopPhase
{
    if (firstUpcomingIndex < 0 || index < firstUpcomingIndex)
    {
        return "passed";
    }

    if (index === firstUpcomingIndex)
    {
        return "current";
    }

    return "upcoming";
}

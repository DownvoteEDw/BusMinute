import type { JourneyStopView, JourneyView } from "./journey-view.js";

export interface StationJourneyGroup
{
    date: string;
    journeys: JourneyView[];
}

export interface StationDateHeading
{
    relative: string | null;
    full: string;
}

export function groupStationJourneysByDate(
    journeys: JourneyView[],
    stopId: string | ((journey: JourneyView) => string)
): StationJourneyGroup[]
{
    const groups = new Map<string, JourneyView[]>();

    for (const journey of journeys)
    {
        const resolvedStopId = typeof stopId === "function" ? stopId(journey) : stopId;
        const date = journeyDateAtStop(journey, resolvedStopId);
        const group = groups.get(date) ?? [];
        group.push(journey);
        groups.set(date, group);
    }

    return [...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, groupedJourneys]) =>
        {
            const sortedJourneys = [...groupedJourneys].sort((first, second) =>
            {
                const firstStopId = typeof stopId === "function" ? stopId(first) : stopId;
                const secondStopId = typeof stopId === "function" ? stopId(second) : stopId;
                return timestamp(journeyTimeAtStop(first, firstStopId))
                    - timestamp(journeyTimeAtStop(second, secondStopId));
            });
            return { date, journeys: sortedJourneys };
        });
}

export function journeyDateAtStop(journey: JourneyView, stopId: string): string
{
    const timestamp = journeyTimeAtStop(journey, stopId);
    return timestamp ? parisDate(new Date(timestamp)) : journey.serviceDate;
}

export function journeyTimeAtStop(journey: JourneyView, stopId: string): string | null
{
    const normalizedStopId = stopId.toLocaleLowerCase("fr");
    const stop = journey.stops.find((candidate) => candidate.stopId.toLocaleLowerCase("fr") === normalizedStopId);
    return timeAtStop(stop);
}

export function stationDateHeading(value: string, now = new Date()): StationDateHeading
{
    const today = parisDate(now);
    const yesterday = addDays(today, -1);
    const tomorrow = addDays(today, 1);
    const relative = value === yesterday
        ? "Hier"
        : value === today
            ? "Aujourd’hui"
            : value === tomorrow
                ? "Demain"
                : null;
    const formatted = new Intl.DateTimeFormat("fr-FR",
    {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "Europe/Paris"
    }).format(new Date(`${value}T12:00:00Z`));

    return {
        relative,
        full: formatted.charAt(0).toLocaleUpperCase("fr") + formatted.slice(1)
    };
}

function timeAtStop(stop: JourneyStopView | undefined): string | null
{
    if (!stop)
    {
        return null;
    }

    const planned = stop.expectedDepartureAt
        ?? stop.aimedDepartureAt
        ?? stop.expectedArrivalAt
        ?? stop.aimedArrivalAt
        ?? null;

    if (stop.phase === "passed")
    {
        return stop.actualDepartureAt ?? stop.actualArrivalAt ?? planned;
    }

    return planned ?? stop.actualDepartureAt ?? stop.actualArrivalAt ?? null;
}

function timestamp(value: string | null): number
{
    return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function parisDate(value: Date): string
{
    const parts = new Intl.DateTimeFormat("fr-FR",
    {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Europe/Paris"
    }).formatToParts(value);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    return `${year}-${month}-${day}`;
}

function addDays(value: string, days: number): string
{
    const date = new Date(`${value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

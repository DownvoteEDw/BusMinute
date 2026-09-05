import type { JourneyStopView, JourneyView } from "./journey-view.js";

export type LiveBoardEventType = "departure" | "next_stop" | "arrival";

export interface LiveBoardEvent
{
    type: LiveBoardEventType;
    stop: JourneyStopView | undefined;
    time: string | null;
}

export function liveBoardEvent(journey: JourneyView): LiveBoardEvent
{
    if (journey.status === "arrived")
    {
        const stop = journey.stops[journey.stops.length - 1];
        return {
            type: "arrival",
            stop,
            time: arrivalTime(stop)
        };
    }

    const stop = journey.stops.find((candidate) => candidate.phase === "current")
        ?? journey.stops.find((candidate) => candidate.phase === "upcoming")
        ?? journey.stops[journey.stops.length - 1];
    const origin = journey.stops[0];
    const isOrigin = stop !== undefined
        && origin !== undefined
        && stop.order === origin.order
        && stop.stopId === origin.stopId;

    return {
        type: isOrigin ? "departure" : "next_stop",
        stop,
        time: isOrigin ? departureTime(stop) : arrivalTime(stop)
    };
}

export function liveBoardEventTime(journey: JourneyView): number
{
    const value = liveBoardEvent(journey).time ?? journey.updatedAt;
    return new Date(value).getTime();
}

function departureTime(stop: JourneyStopView | undefined): string | null
{
    return stop?.expectedDepartureAt
        ?? stop?.aimedDepartureAt
        ?? stop?.expectedArrivalAt
        ?? stop?.aimedArrivalAt
        ?? stop?.actualDepartureAt
        ?? stop?.actualArrivalAt
        ?? null;
}

function arrivalTime(stop: JourneyStopView | undefined): string | null
{
    return stop?.expectedArrivalAt
        ?? stop?.aimedArrivalAt
        ?? stop?.expectedDepartureAt
        ?? stop?.aimedDepartureAt
        ?? stop?.actualArrivalAt
        ?? stop?.actualDepartureAt
        ?? null;
}

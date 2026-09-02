import type
{
    FlixBusRealtimeCall,
    FlixBusRealtimeDeviation,
    FlixBusRealtimeEvent,
    FlixBusRealtimeRide
} from "../providers/flixbus/realtime-client.js";
import type { JourneyOperationalStatus, JourneyStopPhase, JourneyStopView, JourneyView } from "./journey-view.js";

interface RealtimeMatch
{
    ride: FlixBusRealtimeRide;
    matchingStops: number;
    averageTimeDifferenceSeconds: number;
}

export function enrichFlixBusJourney(
    journey: JourneyView,
    rides: FlixBusRealtimeRide[],
    now = new Date()
): JourneyView
{
    const match = matchFlixBusRealtimeRide(journey, rides);

    if (!match)
    {
        return journey;
    }

    const calls = new Map(match.ride.calls.map((call) => [call.stopId, call]));
    const stops = journey.stops.map((stop) =>
    {
        const call = calls.get(externalStopId(stop.stopId));
        return call ? enrichStop(stop, call, match.ride, now) : stop;
    });
    const delaySeconds = currentDelay(stops, match.ride);
    const updatedAt = latestUpdate(match.ride) ?? journey.updatedAt;

    return {
        ...journey,
        realtimeAvailable: true,
        realtimeObserved: true,
        status: journeyStatus(stops, match.ride, now),
        delaySeconds,
        updatedAt,
        matchConfidence: matchConfidence(match, journey.stops.length),
        matchMethod: "FLIXBUS_REALTIME_API",
        stops
    };
}

export function matchFlixBusRealtimeRide(
    journey: JourneyView,
    rides: FlixBusRealtimeRide[]
): RealtimeMatch | null
{
    const candidates = rides.filter((ride) => normalize(ride.serviceNumber) === normalize(journey.serviceNumber))
        .map((ride) => scoreRide(journey, ride))
        .filter((match): match is RealtimeMatch => match !== null)
        .sort((first, second) =>
        {
            return second.matchingStops - first.matchingStops
                || first.averageTimeDifferenceSeconds - second.averageTimeDifferenceSeconds;
        });
    const best = candidates[0];

    if (!best || best.averageTimeDifferenceSeconds > 10_800)
    {
        return null;
    }

    return best;
}

function scoreRide(journey: JourneyView, ride: FlixBusRealtimeRide): RealtimeMatch | null
{
    const calls = new Map(ride.calls.map((call) => [call.stopId, call]));
    const differences: number[] = [];
    let matchingStops = 0;

    for (const stop of journey.stops)
    {
        const call = calls.get(externalStopId(stop.stopId));

        if (!call)
        {
            continue;
        }

        matchingStops += 1;
        const difference = eventDifference(stop, call);

        if (difference !== null)
        {
            differences.push(difference);
        }
    }

    if (matchingStops === 0 || differences.length === 0)
    {
        return null;
    }

    return {
        ride,
        matchingStops,
        averageTimeDifferenceSeconds: differences.reduce((sum, value) => sum + value, 0) / differences.length
    };
}

function eventDifference(stop: JourneyStopView, call: FlixBusRealtimeCall): number | null
{
    const differences: number[] = [];
    addDifference(differences, stop.aimedArrivalAt, call.arrival?.scheduledAt ?? null);
    addDifference(differences, stop.aimedDepartureAt, call.departure?.scheduledAt ?? null);
    return differences.length > 0 ? Math.min(...differences) : null;
}

function addDifference(values: number[], first: string | null, second: string | null): void
{
    if (!first || !second)
    {
        return;
    }

    values.push(Math.abs(new Date(first).getTime() - new Date(second).getTime()) / 1000);
}

function enrichStop(
    stop: JourneyStopView,
    call: FlixBusRealtimeCall,
    ride: FlixBusRealtimeRide,
    now: Date
): JourneyStopView
{
    const arrival = eventTimes(call.arrival, stop.aimedArrivalAt);
    const departure = eventTimes(call.departure, stop.aimedDepartureAt);
    const deviation = departure.deviation ?? arrival.deviation;

    return {
        ...stop,
        phase: stopPhase(call, ride, departure.actualAt, arrival.actualAt, now),
        aimedArrivalAt: arrival.aimedAt,
        expectedArrivalAt: arrival.expectedAt,
        actualArrivalAt: arrival.actualAt,
        aimedDepartureAt: departure.aimedAt,
        expectedDepartureAt: departure.expectedAt,
        actualDepartureAt: departure.actualAt,
        arrivalStatus: deviationStatus(arrival.deviation),
        departureStatus: deviationStatus(departure.deviation),
        delaySeconds: deviation?.seconds ?? null
    };
}

function eventTimes(
    event: FlixBusRealtimeEvent | null,
    fallbackAimedAt: string | null
): {
    aimedAt: string | null;
    expectedAt: string | null;
    actualAt: string | null;
    deviation: FlixBusRealtimeDeviation | null;
}
{
    const aimedAt = event?.scheduledAt ?? fallbackAimedAt;
    const expectedAt = event?.deviation?.timestamp ?? aimedAt;
    const actualAt = event?.deviation?.type === "ACTUAL" ? event.deviation.timestamp : null;
    return {
        aimedAt,
        expectedAt,
        actualAt,
        deviation: event?.deviation ?? null
    };
}

function stopPhase(
    call: FlixBusRealtimeCall,
    ride: FlixBusRealtimeRide,
    actualDepartureAt: string | null,
    actualArrivalAt: string | null,
    now: Date
): JourneyStopPhase
{
    if (actualDepartureAt
        || ride.nextStopSequence !== null && call.sequence < ride.nextStopSequence)
    {
        return "passed";
    }

    if (ride.nextStopSequence === call.sequence)
    {
        return "current";
    }

    const eventTime = call.departure?.deviation?.timestamp
        ?? call.departure?.scheduledAt
        ?? call.arrival?.deviation?.timestamp
        ?? call.arrival?.scheduledAt;

    if (actualArrivalAt || eventTime && new Date(eventTime).getTime() <= now.getTime())
    {
        return "passed";
    }

    return "upcoming";
}

function journeyStatus(
    stops: JourneyStopView[],
    ride: FlixBusRealtimeRide,
    now: Date
): JourneyOperationalStatus
{
    const finalStop = stops[stops.length - 1];

    if (finalStop?.actualArrivalAt)
    {
        return "arrived";
    }

    const originTime = eventTime(stops[0]);
    const destinationTime = eventTime(finalStop);
    const currentTime = now.getTime();

    if (destinationTime !== null && currentTime > destinationTime + 21_600_000)
    {
        return "arrived";
    }

    if (ride.deviation
        || stops.some((stop) => stop.actualArrivalAt || stop.actualDepartureAt)
        || originTime !== null && originTime <= currentTime)
    {
        return "in_transit";
    }

    return "scheduled";
}

function currentDelay(stops: JourneyStopView[], ride: FlixBusRealtimeRide): number | null
{
    const current = stops.find((stop) => stop.phase === "current")
        ?? stops.find((stop) => stop.phase === "upcoming");
    return current?.delaySeconds
        ?? ride.deviation?.seconds
        ?? [...stops].reverse().find((stop) => stop.delaySeconds !== null)?.delaySeconds
        ?? null;
}

function eventTime(stop: JourneyStopView | undefined): number | null
{
    const value = stop?.expectedDepartureAt
        ?? stop?.aimedDepartureAt
        ?? stop?.expectedArrivalAt
        ?? stop?.aimedArrivalAt;
    return value ? new Date(value).getTime() : null;
}

function latestUpdate(ride: FlixBusRealtimeRide): string | null
{
    const updates = [ride.deviation, ...ride.calls.flatMap((call) =>
    {
        return [call.arrival?.deviation ?? null, call.departure?.deviation ?? null];
    })].filter((deviation): deviation is FlixBusRealtimeDeviation => deviation !== null)
        .map((deviation) => deviation.updatedAt)
        .sort();
    return updates[updates.length - 1] ?? null;
}

function deviationStatus(deviation: FlixBusRealtimeDeviation | null): string | null
{
    if (!deviation)
    {
        return null;
    }

    if (deviation.classification === "LATE")
    {
        return "DELAYED";
    }

    if (deviation.classification === "EARLY")
    {
        return "EARLY";
    }

    return "ON_TIME";
}

function matchConfidence(match: RealtimeMatch, stopCount: number): number
{
    const sequenceScore = Math.min(1, match.matchingStops / Math.max(1, stopCount));
    const timeScore = Math.max(0, 1 - match.averageTimeDifferenceSeconds / 10_800);
    return Math.round((sequenceScore * .75 + timeScore * .25) * 1000) / 1000;
}

function externalStopId(value: string): string
{
    const prefix = "flixbus:";
    return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function normalize(value: string): string
{
    return value.trim().toLocaleUpperCase("en").replace(/^FLIXBUS\s+/, "");
}

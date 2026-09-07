import type
{
    AlsaRealtimeCall,
    AlsaRealtimeJourney
} from "../providers/alsa/realtime-client.js";
import type
{
    JourneyOperationalStatus,
    JourneyStopPhase,
    JourneyStopView,
    JourneyView
} from "./journey-view.js";

export function enrichAlsaJourney(
    journey: JourneyView,
    realtime: AlsaRealtimeJourney | null
): JourneyView
{
    if (!realtime || normalize(realtime.serviceNumber) !== normalize(journey.serviceNumber))
    {
        return journey;
    }

    const currentCallIndex = findCurrentCallIndex(realtime.calls);
    const stops = journey.stops.map((stop, index) =>
    {
        const call = matchingCall(stop, index, journey.stops.length, realtime);
        return call ? enrichStop(stop, call, realtime.calls, currentCallIndex) : stop;
    });

    return {
        ...journey,
        realtimeAvailable: true,
        realtimeObserved: true,
        status: journeyStatus(realtime.calls),
        delaySeconds: currentDelay(realtime.calls),
        updatedAt: realtime.recordedAt,
        completeStopSequence: realtime.calls.length >= journey.stops.length,
        matchConfidence: matchConfidence(journey, realtime),
        matchMethod: "ALSA_TRACKING_BUS_API",
        stops
    };
}

function matchingCall(
    stop: JourneyStopView,
    index: number,
    stopCount: number,
    realtime: AlsaRealtimeJourney
): AlsaRealtimeCall | null
{
    if (index === 0)
    {
        return realtime.calls.find((call) => call.stopId === realtime.originStopId)
            ?? realtime.calls[0]
            ?? null;
    }

    if (index === stopCount - 1)
    {
        return realtime.calls.find((call) => call.stopId === realtime.destinationStopId)
            ?? realtime.calls[realtime.calls.length - 1]
            ?? null;
    }

    const normalizedName = normalize(stop.name);
    const normalizedCity = normalize(stop.city);
    return realtime.calls.find((call) =>
    {
        const name = normalize(call.stopName);
        return name === normalizedName || name.startsWith(normalizedCity);
    }) ?? null;
}

function enrichStop(
    stop: JourneyStopView,
    call: AlsaRealtimeCall,
    calls: AlsaRealtimeCall[],
    currentCallIndex: number
): JourneyStopView
{
    const callIndex = calls.indexOf(call);
    const aimedArrivalAt = call.aimedArrivalAt ?? stop.aimedArrivalAt;
    const aimedDepartureAt = call.aimedDepartureAt ?? stop.aimedDepartureAt;
    const arrivalDelay = difference(call.actualArrivalAt ?? call.expectedArrivalAt, aimedArrivalAt);
    const departureDelay = difference(call.actualDepartureAt ?? call.expectedDepartureAt, aimedDepartureAt);

    return {
        ...stop,
        phase: stopPhase(callIndex, currentCallIndex, call),
        aimedArrivalAt,
        expectedArrivalAt: call.expectedArrivalAt,
        actualArrivalAt: call.actualArrivalAt,
        aimedDepartureAt,
        expectedDepartureAt: call.expectedDepartureAt,
        actualDepartureAt: call.actualDepartureAt,
        arrivalStatus: delayStatus(arrivalDelay),
        departureStatus: delayStatus(departureDelay),
        delaySeconds: departureDelay ?? arrivalDelay
    };
}

function findCurrentCallIndex(calls: AlsaRealtimeCall[]): number
{
    for (let index = calls.length - 1; index >= 0; index -= 1)
    {
        if (calls[index]?.visited)
        {
            return index;
        }
    }

    return -1;
}

function stopPhase(
    callIndex: number,
    currentCallIndex: number,
    call: AlsaRealtimeCall
): JourneyStopPhase
{
    if (call.actualDepartureAt || callIndex < currentCallIndex)
    {
        return "passed";
    }

    if (callIndex === currentCallIndex)
    {
        return "current";
    }

    if (call.actualArrivalAt)
    {
        return "passed";
    }

    return "upcoming";
}

function journeyStatus(calls: AlsaRealtimeCall[]): JourneyOperationalStatus
{
    const finalCall = calls[calls.length - 1];

    if (finalCall?.actualArrivalAt || finalCall?.actualDepartureAt)
    {
        return "arrived";
    }

    if (calls.some((call) => call.visited || call.actualArrivalAt || call.actualDepartureAt))
    {
        return "in_transit";
    }

    return "scheduled";
}

function currentDelay(calls: AlsaRealtimeCall[]): number | null
{
    for (let index = calls.length - 1; index >= 0; index -= 1)
    {
        const call = calls[index];

        if (!call)
        {
            continue;
        }

        const arrival = difference(call.actualArrivalAt ?? call.expectedArrivalAt, call.aimedArrivalAt);

        if (arrival !== null)
        {
            return arrival;
        }

        const departure = difference(call.actualDepartureAt ?? call.expectedDepartureAt, call.aimedDepartureAt);

        if (departure !== null)
        {
            return departure;
        }
    }

    return null;
}

function matchConfidence(journey: JourneyView, realtime: AlsaRealtimeJourney): number
{
    const endpointsMatched = Number(realtime.calls.some((call) => call.stopId === realtime.originStopId))
        + Number(realtime.calls.some((call) => call.stopId === realtime.destinationStopId));
    const endpointScore = endpointsMatched / 2;
    const serviceScore = normalize(realtime.serviceNumber) === normalize(journey.serviceNumber) ? 1 : 0;
    return Math.round((endpointScore * .75 + serviceScore * .25) * 1000) / 1000;
}

function delayStatus(delaySeconds: number | null): string | null
{
    if (delaySeconds === null)
    {
        return null;
    }

    if (delaySeconds >= 300)
    {
        return "DELAYED";
    }

    if (delaySeconds <= -300)
    {
        return "EARLY";
    }

    return "ON_TIME";
}

function difference(observed: string | null, aimed: string | null): number | null
{
    if (!observed || !aimed)
    {
        return null;
    }

    const observedTime = new Date(observed).getTime();
    const aimedTime = new Date(aimed).getTime();

    if (!Number.isFinite(observedTime) || !Number.isFinite(aimedTime))
    {
        return null;
    }

    return Math.round((observedTime - aimedTime) / 1000);
}

function normalize(value: string): string
{
    return value.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleUpperCase("en")
        .replace(/^ALSA\s+/, "")
        .replace(/[^A-Z0-9]+/g, " ")
        .trim();
}

import type
{
    GtfsFeed,
    SiriCall,
    SiriJourney,
    TripMatchResult
} from "../domain/models.js";
import { blablacarBusOperator, type TransitOperator } from "./operators.js";
import { mapCoordinates, type JourneyVehiclePosition, type MapCoordinates } from "./journey-map.js";

export type JourneyOperationalStatus = "scheduled" | "in_transit" | "arrived" | "cancelled";
export type JourneyRealtimeStatus =
    | "live"
    | "scheduled_only"
    | "not_offered"
    | "temporarily_unavailable"
    | "outside_tracking_period";
export type JourneyStopPhase = "passed" | "current" | "upcoming";

export interface JourneyStopView
{
    location?: MapCoordinates | null;
    stopId: string;
    name: string;
    city: string;
    order: number;
    phase: JourneyStopPhase;
    aimedArrivalAt: string | null;
    expectedArrivalAt: string | null;
    actualArrivalAt: string | null;
    aimedDepartureAt: string | null;
    expectedDepartureAt: string | null;
    actualDepartureAt: string | null;
    arrivalStatus: string | null;
    departureStatus: string | null;
    delaySeconds: number | null;
    cancelled: boolean;
}

export interface PunctualitySummaryView
{
    sampleSize: number;
    averageDelaySeconds: number;
    onTimePercentage: number;
    windowDays: number;
    thresholdMinutes: number;
}

export interface JourneyView
{
    vehiclePositions?: JourneyVehiclePosition[];
    publicId?: string;
    publicPath?: string;
    journeyRef: string;
    serviceNumber: string;
    serviceDate: string;
    operatorSlug: string;
    operatorName: string;
    realtimeAvailable: boolean;
    realtimeObserved: boolean;
    realtimeStatus: JourneyRealtimeStatus;
    originStopId: string;
    originName: string;
    originCity: string;
    destinationStopId: string;
    destinationName: string;
    destinationCity: string;
    status: JourneyOperationalStatus;
    delaySeconds: number | null;
    updatedAt: string;
    cancelled: boolean;
    completeStopSequence: boolean;
    matchConfidence: number | null;
    matchMethod: string | null;
    scheduledTripId: string | null;
    punctuality: PunctualitySummaryView | null;
    stops: JourneyStopView[];
}

export interface StopBoardView
{
    stopId: string;
    name: string;
    city: string;
    operatorSlug: string;
    operatorName: string;
    realtimeAvailable: boolean;
    latitude: number;
    longitude: number;
    operatorStops: StopBoardOperatorView[];
    journeys: JourneyView[];
}

export interface StopBoardOperatorView
{
    operatorSlug: string;
    operatorName: string;
    realtimeAvailable: boolean;
    stopId: string;
    stopName: string;
}

export interface CityStopView
{
    stopId: string;
    name: string;
    operatorSlug: string;
    operatorName: string;
    operatorSlugs: string[];
    latitude: number;
    longitude: number;
    upcomingJourneyCount: number;
    nextJourneyAt: string | null;
}

export interface CityDirectoryEntryView
{
    slug: string;
    name: string;
    stopCount: number;
    liveJourneyCount: number;
}

export interface CityBoardView
{
    slug: string;
    name: string;
    stops: CityStopView[];
    journeys: JourneyView[];
}

export interface DepartureBoardView extends CityBoardView
{
    serviceDate: string;
}

export interface CityJourneyPageView
{
    journeys: JourneyView[];
    nextCursor: string | null;
    totalCount: number;
}

export interface PlaceSearchResultView
{
    type: "city" | "stop";
    id: string;
    label: string;
    detail: string;
    href: string;
}

export interface SeoIndexView
{
    cities: Array<{ slug: string }>;
    stops: Array<{ stopId: string }>;
    routes: Array<{ originStopId: string; destinationStopId: string }>;
    departures: Array<{ citySlug: string; serviceDate: string }>;
    journeys: Array<{ journeyRef: string; publicPath?: string }>;
    services?: string[];
    cityRoutes?: string[];
}

export interface RouteBoardView
{
    originStopId: string;
    originName: string;
    destinationStopId: string;
    destinationName: string;
    journeys: JourneyView[];
}

export function buildJourneyView(
    feed: GtfsFeed,
    journey: SiriJourney,
    match: TripMatchResult,
    operator: TransitOperator = blablacarBusOperator
): JourneyView
{
    if (journey.calls.length === 0)
    {
        throw new Error(`La circulation ${journey.journeyRef} ne contient aucun arrêt`);
    }

    const lastPassedIndex = findLastPassedIndex(journey.calls);
    const finalCall = journey.calls[journey.calls.length - 1];
    const status = operationalStatus(journey, finalCall);
    const stops = journey.calls.map((call, index) =>
    {
        const feedStop = feed.stops.find((stop) => stop.externalId === call.stopPointRef);
        const name = call.stopPointName ?? feedStop?.name ?? call.stopPointRef;

        return {
            stopId: call.stopPointRef,
            location: mapCoordinates(feedStop?.latitude, feedStop?.longitude),
            name,
            city: cityName(name),
            order: call.order,
            phase: stopPhase(index, lastPassedIndex, status),
            aimedArrivalAt: iso(call.aimedArrivalTime),
            expectedArrivalAt: iso(call.expectedArrivalTime),
            actualArrivalAt: iso(call.actualArrivalTime),
            aimedDepartureAt: iso(call.aimedDepartureTime),
            expectedDepartureAt: iso(call.expectedDepartureTime),
            actualDepartureAt: iso(call.actualDepartureTime),
            arrivalStatus: call.arrivalStatus,
            departureStatus: call.departureStatus,
            delaySeconds: callDelay(call),
            cancelled: call.cancellation
        } satisfies JourneyStopView;
    });
    const origin = stops[0] as JourneyStopView;
    const destination = stops[stops.length - 1] as JourneyStopView;

    return {
        journeyRef: journey.journeyRef,
        serviceNumber: journey.serviceNumber,
        serviceDate: journey.serviceDate,
        operatorSlug: operator.slug,
        operatorName: operator.name,
        realtimeAvailable: operator.realtimeAvailable,
        realtimeObserved: true,
        realtimeStatus: "live",
        originStopId: origin.stopId,
        originName: origin.name,
        originCity: origin.city,
        destinationStopId: destination.stopId,
        destinationName: destination.name,
        destinationCity: destination.city,
        status,
        delaySeconds: currentDelay(journey.calls),
        updatedAt: journey.recordedAtTime.toISOString(),
        cancelled: journey.cancellation,
        completeStopSequence: journey.completeStopSequence,
        matchConfidence: match.match?.score.total ?? null,
        matchMethod: match.match?.method ?? null,
        scheduledTripId: match.match?.trip.externalId ?? null,
        punctuality: null,
        vehiclePositions: [],
        stops
    };
}

export function cityName(stopName: string): string
{
    return stopName.split(" - ")[0]?.split(" (")[0]?.trim() || stopName;
}

export function citySlug(value: string): string
{
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("fr")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function operationalStatus(journey: SiriJourney, finalCall: SiriCall | undefined): JourneyOperationalStatus
{
    if (journey.cancellation)
    {
        return "cancelled";
    }

    if (finalCall?.actualArrivalTime)
    {
        return "arrived";
    }

    if (journey.calls.some((call) => call.actualDepartureTime || call.actualArrivalTime))
    {
        return "in_transit";
    }

    return "scheduled";
}

function findLastPassedIndex(calls: SiriCall[]): number
{
    for (let index = calls.length - 1; index >= 0; index -= 1)
    {
        const call = calls[index];

        if (call?.actualArrivalTime || call?.actualDepartureTime)
        {
            return index;
        }
    }

    return -1;
}

function stopPhase(index: number, lastPassedIndex: number, status: JourneyOperationalStatus): JourneyStopPhase
{
    if (status === "arrived" || index <= lastPassedIndex)
    {
        return "passed";
    }

    if (index === lastPassedIndex + 1)
    {
        return "current";
    }

    return "upcoming";
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

function callDelay(call: SiriCall): number | null
{
    return difference(call.actualArrivalTime ?? call.expectedArrivalTime, call.aimedArrivalTime)
        ?? difference(call.actualDepartureTime ?? call.expectedDepartureTime, call.aimedDepartureTime);
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

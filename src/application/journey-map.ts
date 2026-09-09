import type { JourneyView } from "./journey-view.js";

export interface MapCoordinates
{
    latitude: number;
    longitude: number;
}

export interface JourneyVehiclePosition extends MapCoordinates
{
    id: string;
    receivedAt: string;
    recordedAt?: string;
    lastKnown?: boolean;
}

export interface JourneyApproximatePosition extends MapCoordinates
{
    fromName: string;
    toName: string;
}

export interface JourneyVehicleProgress
{
    afterStopIndex: number;
    progress: number;
    approximate: boolean;
}

export const positionStaleAfterMilliseconds = 120_000;
const maximumPositionAgeMilliseconds = 30 * 60_000;

export function mapCoordinates(latitude: unknown, longitude: unknown): MapCoordinates | null
{
    if (typeof latitude !== "number"
        || typeof longitude !== "number"
        || !Number.isFinite(latitude)
        || !Number.isFinite(longitude)
        || Math.abs(latitude) > 90
        || Math.abs(longitude) > 180
        || (latitude === 0 && longitude === 0))
    {
        return null;
    }

    return { latitude, longitude };
}

export function visibleVehiclePositions(journey: JourneyView, now: number, completed: boolean): JourneyVehiclePosition[]
{
    if (completed || journey.cancelled || journey.status === "arrived"
        || journey.realtimeStatus === "not_offered" || journey.realtimeStatus === "outside_tracking_period")
    {
        return [];
    }

    return (journey.vehiclePositions ?? []).filter((position) =>
    {
        const age = now - vehiclePositionTime(position);
        return mapCoordinates(position.latitude, position.longitude) !== null
            && Number.isFinite(age)
            && age >= -60_000
            && age <= maximumPositionAgeMilliseconds;
    });
}

export function approximateVehiclePosition(journey: JourneyView, completed: boolean): JourneyApproximatePosition | null
{
    if (completed || journey.cancelled || journey.status !== "in_transit"
        || !journey.realtimeObserved || journey.realtimeStatus !== "live")
    {
        return null;
    }

    const segment = activeJourneySegment(journey);
    if (!segment)
    {
        return null;
    }

    const previous = locatedStop(journey, segment.afterStopIndex, -1);
    const next = locatedStop(journey, segment.afterStopIndex + 1, 1);
    if (!previous || !next)
    {
        return null;
    }

    return {
        latitude: (previous.location.latitude + next.location.latitude) / 2,
        longitude: (previous.location.longitude + next.location.longitude) / 2,
        fromName: previous.name,
        toName: next.name
    };
}

export function journeyVehicleProgress(journey: JourneyView, now: number, completed: boolean): JourneyVehicleProgress | null
{
    if (completed || journey.cancelled || journey.status !== "in_transit")
    {
        return null;
    }

    const segment = activeJourneySegment(journey);
    if (!segment)
    {
        return null;
    }

    const positions = visibleVehiclePositions(journey, now, completed)
        .sort((first, second) => vehiclePositionTime(second) - vehiclePositionTime(first));
    const position = positions[0];
    const from = mapCoordinates(
        journey.stops[segment.afterStopIndex]?.location?.latitude,
        journey.stops[segment.afterStopIndex]?.location?.longitude
    );
    const to = mapCoordinates(
        journey.stops[segment.afterStopIndex + 1]?.location?.latitude,
        journey.stops[segment.afterStopIndex + 1]?.location?.longitude
    );

    if (!position || !from || !to)
    {
        if (!journey.realtimeObserved || journey.realtimeStatus !== "live")
        {
            return null;
        }

        return { ...segment, progress: .5, approximate: true };
    }

    const latitudeScale = Math.cos(((from.latitude + to.latitude) / 2) * Math.PI / 180);
    const segmentX = (to.longitude - from.longitude) * latitudeScale;
    const segmentY = to.latitude - from.latitude;
    const vehicleX = (position.longitude - from.longitude) * latitudeScale;
    const vehicleY = position.latitude - from.latitude;
    const length = segmentX * segmentX + segmentY * segmentY;
    const progress = length === 0 ? .5 : (vehicleX * segmentX + vehicleY * segmentY) / length;

    return {
        ...segment,
        progress: Math.max(.16, Math.min(.84, progress)),
        approximate: false
    };
}

export function isVehiclePositionStale(position: JourneyVehiclePosition, now: number): boolean
{
    return position.lastKnown === true || now - vehiclePositionTime(position) > positionStaleAfterMilliseconds;
}

export function vehiclePositionTime(position: JourneyVehiclePosition): number
{
    const receivedAt = Date.parse(position.receivedAt);
    return position.recordedAt ? Math.min(receivedAt, Date.parse(position.recordedAt)) : receivedAt;
}

export function retainLastVehiclePositions(previous: JourneyView, next: JourneyView): JourneyView
{
    if (previous.journeyRef !== next.journeyRef
        || next.cancelled
        || next.status === "arrived"
        || next.realtimeStatus === "outside_tracking_period"
        || next.realtimeStatus === "not_offered"
        || (next.vehiclePositions?.length ?? 0) > 0)
    {
        return next;
    }

    return {
        ...next,
        vehiclePositions: (previous.vehiclePositions ?? []).map((position) => ({ ...position, lastKnown: true }))
    };
}

function activeJourneySegment(journey: JourneyView): Pick<JourneyVehicleProgress, "afterStopIndex"> | null
{
    if (journey.stops.length < 2)
    {
        return null;
    }

    const lastPassedIndex = journey.stops.findLastIndex((stop) => stop.phase === "passed");
    const afterStopIndex = lastPassedIndex < 0 ? 0 : lastPassedIndex;
    return afterStopIndex < journey.stops.length - 1 ? { afterStopIndex } : null;
}

function locatedStop(journey: JourneyView, startIndex: number, direction: -1 | 1): { name: string; location: MapCoordinates } | null
{
    for (let index = startIndex; index >= 0 && index < journey.stops.length; index += direction)
    {
        const stop = journey.stops[index];
        const location = mapCoordinates(stop?.location?.latitude, stop?.location?.longitude);
        if (stop && location)
        {
            return { name: stop.name, location };
        }
    }

    return null;
}

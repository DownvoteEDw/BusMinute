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

    let previous: { name: string } & MapCoordinates | null = null;
    for (const stop of journey.stops)
    {
        const location = mapCoordinates(stop.location?.latitude, stop.location?.longitude);
        if (!location)
        {
            continue;
        }

        if (stop.phase === "passed")
        {
            previous = { ...location, name: stop.name };
            continue;
        }

        if (previous && stop.phase === "current")
        {
            return {
                latitude: (previous.latitude + location.latitude) / 2,
                longitude: (previous.longitude + location.longitude) / 2,
                fromName: previous.name,
                toName: stop.name
            };
        }

        break;
    }

    return null;
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

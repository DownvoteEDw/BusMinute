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

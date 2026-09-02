import type { GtfsStop } from "../domain/models.js";
import { cityName, citySlug } from "./journey-view.js";

const maximumDistanceMeters = 250;
const genericWords = new Set([
    "arret",
    "bus",
    "busstation",
    "central",
    "centrale",
    "centre",
    "coach",
    "gare",
    "routiere",
    "station",
    "stop",
    "terminal"
]);

export function samePhysicalStation(first: GtfsStop, second: GtfsStop): boolean
{
    if (citySlug(cityName(first.name)) !== citySlug(cityName(second.name)))
    {
        return false;
    }

    if (distanceMeters(first, second) > maximumDistanceMeters)
    {
        return false;
    }

    const firstIdentity = stationIdentity(first.name);
    const secondIdentity = stationIdentity(second.name);
    return firstIdentity.length > 0 && firstIdentity === secondIdentity;
}

export function distanceMeters(first: GtfsStop, second: GtfsStop): number
{
    const earthRadius = 6_371_000;
    const latitudeDelta = radians(second.latitude - first.latitude);
    const longitudeDelta = radians(second.longitude - first.longitude);
    const firstLatitude = radians(first.latitude);
    const secondLatitude = radians(second.latitude);
    const value = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function stationIdentity(name: string): string
{
    const cityWords = new Set(words(cityName(name)));
    return [...new Set(words(name).filter((word) =>
    {
        return !cityWords.has(word) && !genericWords.has(word);
    }))].sort().join("-");
}

function words(value: string): string[]
{
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("fr")
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

function radians(value: number): number
{
    return value * Math.PI / 180;
}

import { access, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { GtfsFeed } from "../../domain/models.js";
import { BlaBlaCarGtfsImporter } from "../blablacar/gtfs/importer.js";

const defaultGtfsUrl = "https://gtfs.gis.flix.tech/gtfs_generic_eu.zip";

export class FlixBusDataSource
{
    private readonly gtfsImporter = new BlaBlaCarGtfsImporter();

    public async loadGtfs(forceDownload = false): Promise<GtfsFeed>
    {
        const configuredPath = process.env.FLIXBUS_GTFS_PATH;

        if (configuredPath)
        {
            return filterFlixBusFeed(await this.gtfsImporter.import(configuredPath));
        }

        const cachePath = process.env.FLIXBUS_GTFS_CACHE_PATH
            ?? join(tmpdir(), "busminute", "flixbus-gtfs.zip");

        if (forceDownload || !(await exists(cachePath)))
        {
            await this.downloadGtfs(cachePath);
        }

        return filterFlixBusFeed(await this.gtfsImporter.import(cachePath));
    }

    private async downloadGtfs(cachePath: string): Promise<void>
    {
        await mkdir(dirname(cachePath), { recursive: true });
        const response = await fetch(process.env.FLIXBUS_GTFS_URL ?? defaultGtfsUrl,
        {
            redirect: "follow",
            headers: {
                Accept: "application/zip, application/octet-stream",
                "User-Agent": "BusMinute/1.0"
            },
            signal: AbortSignal.timeout(readPositiveInteger("FLIXBUS_GTFS_TIMEOUT_MS", 300_000))
        });

        if (!response.ok)
        {
            throw new Error(`Téléchargement GTFS FlixBus impossible : ${response.status}`);
        }

        await writeFile(cachePath, Buffer.from(await response.arrayBuffer()));
    }
}

export function filterFlixBusFeed(feed: GtfsFeed): GtfsFeed
{
    const routes = feed.routes.filter((route) =>
    {
        return route.type === 3 && route.agencyExternalId.toLocaleUpperCase("en").startsWith("FLIXBUS");
    });
    const routeIds = new Set(routes.map((route) => route.externalId));
    const trips = feed.trips.filter((trip) => routeIds.has(trip.routeExternalId));
    const stopIds = new Set(trips.flatMap((trip) => trip.stopTimes.map((stopTime) => stopTime.stopExternalId)));
    const serviceIds = new Set(trips.map((trip) => trip.serviceExternalId));
    const agencyIds = new Set(routes.map((route) => route.agencyExternalId));

    return {
        agencies: feed.agencies.filter((agency) => agencyIds.has(agency.externalId)),
        stops: feed.stops.filter((stop) => stopIds.has(stop.externalId)),
        routes,
        calendars: feed.calendars.filter((calendar) => serviceIds.has(calendar.externalId)),
        calendarExceptions: feed.calendarExceptions.filter((exception) =>
        {
            return serviceIds.has(exception.serviceExternalId);
        }),
        trips,
        sourcePath: feed.sourcePath
    };
}

function readPositiveInteger(name: string, fallback: number): number
{
    const value = Number.parseInt(process.env[name] ?? "", 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function exists(path: string): Promise<boolean>
{
    try
    {
        await access(path);
        return true;
    }
    catch
    {
        return false;
    }
}

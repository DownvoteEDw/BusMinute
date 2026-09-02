import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import type
{
    GtfsAgency,
    GtfsFeed,
    GtfsRoute,
    GtfsScheduledTrip,
    GtfsServiceCalendar,
    GtfsServiceException,
    GtfsStop,
    GtfsStopTime
} from "../../../domain/models.js";

type CsvRecord = Record<string, string>;

interface GtfsSource
{
    read(name: string, required: boolean): Promise<string | null>;
}

class DirectoryGtfsSource implements GtfsSource
{
    public constructor(private readonly path: string)
    {
    }

    public async read(name: string, required: boolean): Promise<string | null>
    {
        try
        {
            return await readFile(join(this.path, name), "utf8");
        }
        catch (error)
        {
            if (!required && isMissingFile(error))
            {
                return null;
            }

            throw error;
        }
    }
}

class ZipGtfsSource implements GtfsSource
{
    private readonly archive: AdmZip;

    public constructor(path: string)
    {
        this.archive = new AdmZip(path);
    }

    public async read(name: string, required: boolean): Promise<string | null>
    {
        const entry = this.archive.getEntries().find((candidate) =>
        {
            const normalized = candidate.entryName.replaceAll("\\", "/");
            return normalized === name || normalized.endsWith(`/${name}`);
        });

        if (!entry)
        {
            if (required)
            {
                throw new GtfsImportError(`Fichier GTFS requis absent : ${name}`);
            }

            return null;
        }

        return entry.getData().toString("utf8");
    }
}

export class GtfsImportError extends Error
{
    public constructor(message: string)
    {
        super(message);
        this.name = "GtfsImportError";
    }
}

export class BlaBlaCarGtfsImporter
{
    public async import(sourcePath: string): Promise<GtfsFeed>
    {
        const source = await this.openSource(sourcePath);
        const [
            agencyRows,
            stopRows,
            routeRows,
            tripRows,
            stopTimeRows,
            calendarRows,
            calendarDateRows
        ] = await Promise.all([
            this.readRows(source, "agency.txt", true),
            this.readRows(source, "stops.txt", true),
            this.readRows(source, "routes.txt", true),
            this.readRows(source, "trips.txt", true),
            this.readRows(source, "stop_times.txt", true),
            this.readRows(source, "calendar.txt", false),
            this.readRows(source, "calendar_dates.txt", false)
        ]);

        const agencies = agencyRows.map((row, index) => this.mapAgency(row, index));
        const stops = stopRows.map((row, index) => this.mapStop(row, index));
        const routes = routeRows.map((row, index) => this.mapRoute(row, index, agencies));
        const calendarExceptions = calendarDateRows.map((row, index) => this.mapCalendarException(row, index));
        const calendars = calendarRows.map((row, index) => this.mapCalendar(row, index));
        const stopTimes = this.groupStopTimes(stopTimeRows);
        const trips = tripRows.map((row, index) => this.mapTrip(row, index, stopTimes, routes));

        this.addMissingCalendars(calendars, calendarExceptions, trips);
        this.validateReferences(agencies, stops, routes, calendars, trips);

        return {
            agencies,
            stops,
            routes,
            calendars,
            calendarExceptions,
            trips,
            sourcePath
        };
    }

    private async openSource(sourcePath: string): Promise<GtfsSource>
    {
        const sourceStat = await stat(sourcePath);

        if (sourceStat.isDirectory())
        {
            return new DirectoryGtfsSource(sourcePath);
        }

        return new ZipGtfsSource(sourcePath);
    }

    private async readRows(source: GtfsSource, name: string, required: boolean): Promise<CsvRecord[]>
    {
        const content = await source.read(name, required);

        if (content === null)
        {
            return [];
        }

        return parse(content,
        {
            bom: true,
            columns: true,
            relax_column_count: true,
            skip_empty_lines: true,
            trim: true
        }) as CsvRecord[];
    }

    private mapAgency(row: CsvRecord, index: number): GtfsAgency
    {
        return {
            externalId: optional(row, "agency_id") ?? "default",
            name: required(row, "agency_name", "agency.txt", index),
            url: required(row, "agency_url", "agency.txt", index),
            timezone: required(row, "agency_timezone", "agency.txt", index),
            language: optional(row, "agency_lang")
        };
    }

    private mapStop(row: CsvRecord, index: number): GtfsStop
    {
        return {
            externalId: required(row, "stop_id", "stops.txt", index),
            code: optional(row, "stop_code"),
            name: required(row, "stop_name", "stops.txt", index),
            description: optional(row, "stop_desc"),
            latitude: numberValue(row, "stop_lat", "stops.txt", index),
            longitude: numberValue(row, "stop_lon", "stops.txt", index),
            timezone: optional(row, "stop_timezone"),
            wheelchairBoarding: optionalInteger(row, "wheelchair_boarding", "stops.txt", index)
        };
    }

    private mapRoute(row: CsvRecord, index: number, agencies: GtfsAgency[]): GtfsRoute
    {
        const fallbackAgency = agencies.length === 1 ? agencies[0]?.externalId : null;
        const agencyExternalId = optional(row, "agency_id") ?? fallbackAgency;

        if (!agencyExternalId)
        {
            throw new GtfsImportError(`agency_id manquant dans routes.txt à la ligne ${index + 2}`);
        }

        return {
            externalId: required(row, "route_id", "routes.txt", index),
            agencyExternalId,
            shortName: optional(row, "route_short_name") ?? "",
            longName: optional(row, "route_long_name") ?? "",
            type: integerValue(row, "route_type", "routes.txt", index),
            color: optional(row, "route_color"),
            textColor: optional(row, "route_text_color")
        };
    }

    private mapCalendar(row: CsvRecord, index: number): GtfsServiceCalendar
    {
        return {
            externalId: required(row, "service_id", "calendar.txt", index),
            monday: booleanValue(row, "monday", "calendar.txt", index),
            tuesday: booleanValue(row, "tuesday", "calendar.txt", index),
            wednesday: booleanValue(row, "wednesday", "calendar.txt", index),
            thursday: booleanValue(row, "thursday", "calendar.txt", index),
            friday: booleanValue(row, "friday", "calendar.txt", index),
            saturday: booleanValue(row, "saturday", "calendar.txt", index),
            sunday: booleanValue(row, "sunday", "calendar.txt", index),
            startDate: dateValue(row, "start_date", "calendar.txt", index),
            endDate: dateValue(row, "end_date", "calendar.txt", index)
        };
    }

    private mapCalendarException(row: CsvRecord, index: number): GtfsServiceException
    {
        const type = integerValue(row, "exception_type", "calendar_dates.txt", index);

        if (type !== 1 && type !== 2)
        {
            throw new GtfsImportError(`exception_type invalide dans calendar_dates.txt à la ligne ${index + 2}`);
        }

        return {
            serviceExternalId: required(row, "service_id", "calendar_dates.txt", index),
            date: dateValue(row, "date", "calendar_dates.txt", index),
            type
        };
    }

    private groupStopTimes(rows: CsvRecord[]): Map<string, GtfsStopTime[]>
    {
        const grouped = new Map<string, GtfsStopTime[]>();

        rows.forEach((row, index) =>
        {
            const tripId = required(row, "trip_id", "stop_times.txt", index);
            const stopTime: GtfsStopTime = {
                stopExternalId: required(row, "stop_id", "stop_times.txt", index),
                sequence: integerValue(row, "stop_sequence", "stop_times.txt", index),
                arrivalSeconds: timeValue(row, "arrival_time", "stop_times.txt", index),
                departureSeconds: timeValue(row, "departure_time", "stop_times.txt", index),
                pickupType: optionalInteger(row, "pickup_type", "stop_times.txt", index),
                dropOffType: optionalInteger(row, "drop_off_type", "stop_times.txt", index)
            };
            const current = grouped.get(tripId) ?? [];
            current.push(stopTime);
            grouped.set(tripId, current);
        });

        grouped.forEach((values) =>
        {
            values.sort((left, right) => left.sequence - right.sequence);
        });

        return grouped;
    }

    private mapTrip(
        row: CsvRecord,
        index: number,
        stopTimes: Map<string, GtfsStopTime[]>,
        routes: GtfsRoute[]
    ): GtfsScheduledTrip
    {
        const externalId = required(row, "trip_id", "trips.txt", index);
        const routeExternalId = required(row, "route_id", "trips.txt", index);
        const route = routes.find((candidate) => candidate.externalId === routeExternalId);
        const tripStopTimes = stopTimes.get(externalId) ?? [];

        if (tripStopTimes.length === 0)
        {
            throw new GtfsImportError(`Aucun horaire trouvé pour le trajet ${externalId}`);
        }

        return {
            externalId,
            routeExternalId,
            serviceExternalId: required(row, "service_id", "trips.txt", index),
            serviceNumber: serviceNumber(row, route, routeExternalId),
            headsign: optional(row, "trip_headsign"),
            wheelchairAccessible: optionalInteger(row, "wheelchair_accessible", "trips.txt", index),
            bikesAllowed: optionalInteger(row, "bikes_allowed", "trips.txt", index),
            stopTimes: tripStopTimes
        };
    }

    private addMissingCalendars(
        calendars: GtfsServiceCalendar[],
        exceptions: GtfsServiceException[],
        trips: GtfsScheduledTrip[]
    ): void
    {
        const known = new Set(calendars.map((calendar) => calendar.externalId));
        const serviceIds = new Set(trips.map((trip) => trip.serviceExternalId));

        serviceIds.forEach((serviceId) =>
        {
            if (known.has(serviceId))
            {
                return;
            }

            const dates = exceptions
                .filter((exception) => exception.serviceExternalId === serviceId && exception.type === 1)
                .map((exception) => exception.date)
                .sort();

            if (dates.length === 0)
            {
                throw new GtfsImportError(`Calendrier absent pour le service ${serviceId}`);
            }

            calendars.push({
                externalId: serviceId,
                monday: false,
                tuesday: false,
                wednesday: false,
                thursday: false,
                friday: false,
                saturday: false,
                sunday: false,
                startDate: dates[0] as string,
                endDate: dates[dates.length - 1] as string
            });
        });
    }

    private validateReferences(
        agencies: GtfsAgency[],
        stops: GtfsStop[],
        routes: GtfsRoute[],
        calendars: GtfsServiceCalendar[],
        trips: GtfsScheduledTrip[]
    ): void
    {
        assertUnique(agencies.map((agency) => agency.externalId), "agency_id");
        assertUnique(stops.map((stop) => stop.externalId), "stop_id");
        assertUnique(routes.map((route) => route.externalId), "route_id");
        assertUnique(calendars.map((calendar) => calendar.externalId), "service_id");
        assertUnique(trips.map((trip) => trip.externalId), "trip_id");

        const agencyIds = new Set(agencies.map((agency) => agency.externalId));
        const stopIds = new Set(stops.map((stop) => stop.externalId));
        const routeIds = new Set(routes.map((route) => route.externalId));
        const serviceIds = new Set(calendars.map((calendar) => calendar.externalId));

        routes.forEach((route) =>
        {
            if (!agencyIds.has(route.agencyExternalId))
            {
                throw new GtfsImportError(`Agence inconnue ${route.agencyExternalId} pour la route ${route.externalId}`);
            }
        });

        trips.forEach((trip) =>
        {
            if (!routeIds.has(trip.routeExternalId))
            {
                throw new GtfsImportError(`Route inconnue ${trip.routeExternalId} pour le trajet ${trip.externalId}`);
            }

            if (!serviceIds.has(trip.serviceExternalId))
            {
                throw new GtfsImportError(`Service inconnu ${trip.serviceExternalId} pour le trajet ${trip.externalId}`);
            }

            trip.stopTimes.forEach((stopTime) =>
            {
                if (!stopIds.has(stopTime.stopExternalId))
                {
                    throw new GtfsImportError(`Arrêt inconnu ${stopTime.stopExternalId} pour le trajet ${trip.externalId}`);
                }
            });
        });
    }
}

function isMissingFile(error: unknown): boolean
{
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function required(row: CsvRecord, key: string, file: string, index: number): string
{
    const value = optional(row, key);

    if (value === null)
    {
        throw new GtfsImportError(`${key} manquant dans ${file} à la ligne ${index + 2}`);
    }

    return value;
}

function optional(row: CsvRecord, key: string): string | null
{
    const value = row[key]?.trim();
    return value ? value : null;
}

function serviceNumber(row: CsvRecord, route: GtfsRoute | undefined, routeExternalId: string): string
{
    const value = optional(row, "trip_short_name")
        ?? route?.shortName
        ?? routeExternalId;
    return value.replace(/^FlixBus\s+/i, "").trim();
}

function numberValue(row: CsvRecord, key: string, file: string, index: number): number
{
    const value = Number(required(row, key, file, index));

    if (!Number.isFinite(value))
    {
        throw new GtfsImportError(`${key} invalide dans ${file} à la ligne ${index + 2}`);
    }

    return value;
}

function integerValue(row: CsvRecord, key: string, file: string, index: number): number
{
    const value = numberValue(row, key, file, index);

    if (!Number.isInteger(value))
    {
        throw new GtfsImportError(`${key} doit être un entier dans ${file} à la ligne ${index + 2}`);
    }

    return value;
}

function optionalInteger(row: CsvRecord, key: string, file: string, index: number): number | null
{
    if (optional(row, key) === null)
    {
        return null;
    }

    return integerValue(row, key, file, index);
}

function booleanValue(row: CsvRecord, key: string, file: string, index: number): boolean
{
    const value = integerValue(row, key, file, index);

    if (value !== 0 && value !== 1)
    {
        throw new GtfsImportError(`${key} doit valoir 0 ou 1 dans ${file} à la ligne ${index + 2}`);
    }

    return value === 1;
}

function dateValue(row: CsvRecord, key: string, file: string, index: number): string
{
    const value = required(row, key, file, index);
    const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);

    if (!match)
    {
        throw new GtfsImportError(`${key} invalide dans ${file} à la ligne ${index + 2}`);
    }

    return `${match[1]}-${match[2]}-${match[3]}`;
}

function timeValue(row: CsvRecord, key: string, file: string, index: number): number
{
    const value = required(row, key, file, index);
    const match = /^(\d+):(\d{2}):(\d{2})$/.exec(value);

    if (!match)
    {
        throw new GtfsImportError(`${key} invalide dans ${file} à la ligne ${index + 2}`);
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);

    if (minutes > 59 || seconds > 59)
    {
        throw new GtfsImportError(`${key} invalide dans ${file} à la ligne ${index + 2}`);
    }

    return (hours * 3600) + (minutes * 60) + seconds;
}

function assertUnique(values: string[], field: string): void
{
    const seen = new Set<string>();

    values.forEach((value) =>
    {
        if (seen.has(value))
        {
            throw new GtfsImportError(`${field} dupliqué : ${value}`);
        }

        seen.add(value);
    });
}

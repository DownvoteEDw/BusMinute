import { DateTime } from "luxon";
import type
{
    GtfsFeed,
    GtfsRoute,
    GtfsScheduledTrip,
    GtfsServiceCalendar,
    GtfsStop
} from "../../domain/models.js";

const defaultLocationsUrl = "https://global-api.distribusion.com/suggestion-service/v3/locations";
const defaultConnectionsUrl = "https://book.api.distribusion.com/api/connections";
const carrierCode = "AOWL";
const retailerPartnerNumber = "562801";
const agencyTimezone = "Europe/Paris";

type FetchImplementation = (
    input: string | URL | Request,
    init?: RequestInit
) => Promise<Response>;

interface SuggestionLocationName
{
    languageCode?: string;
    name?: string;
}

interface SuggestionLocation
{
    type?: string;
    code?: string;
    countryCode?: string;
    bestMatch?: string;
    names?: SuggestionLocationName[];
    carrierMetadata?: Array<{ carrierCode?: string }>;
    childrenLocations?: SuggestionLocation[];
}

interface SuggestionResponse
{
    locations?: SuggestionLocation[];
}

interface IncludedRelationship
{
    data?: { id?: string } | null;
}

interface IncludedResource
{
    id?: string;
    type?: string;
    attributes?: Record<string, unknown>;
    relationships?: Record<string, IncludedRelationship>;
}

interface ConnectionsResponse
{
    included?: IncludedResource[];
}

interface AlsaStationReference
{
    id: string;
    countryCode: string;
    cityName: string;
    stationName: string;
}

interface AlsaConnectionStation
{
    id: string;
    countryCode: string;
    cityName: string;
    name: string;
    description: string | null;
    timezone: string;
    latitude: number;
    longitude: number;
}

interface AlsaSegment
{
    id: string;
    line: string;
    departureTime: string;
    arrivalTime: string;
    departureStation: AlsaConnectionStation;
    arrivalStation: AlsaConnectionStation;
}

interface ConnectionQuery
{
    date: string;
    departures: string[];
    arrivals: string[];
}

export class AlsaDataSource
{
    public constructor(
        private readonly fetchImplementation: FetchImplementation = fetch,
        private readonly now: () => Date = () => new Date()
    )
    {
    }

    public async loadGtfs(_forceDownload = false): Promise<GtfsFeed>
    {
        const stationReferences = await this.loadStationReferences();
        const frenchStations = stationReferences.filter((station) => station.countryCode === "FR");
        const destinationCountries = readCountryFilter();
        const eligibleStations = destinationCountries
            ? stationReferences.filter((station) => destinationCountries.has(station.countryCode))
            : stationReferences;

        if (frenchStations.length === 0 || eligibleStations.length === 0)
        {
            throw new Error("Catalogue de gares ALSA vide");
        }

        const dates = serviceDates(this.now(), readPositiveInteger("ALSA_SERVICE_DAYS", 3));
        const queries = buildConnectionQueries(frenchStations, eligibleStations, dates);
        const payloads = await mapWithConcurrency(
            queries,
            readPositiveInteger("ALSA_CONCURRENCY", 4),
            (query) => this.loadConnections(query)
        );
        const referencesById = new Map(stationReferences.map((station) => [station.id, station]));
        const segments = new Map<string, AlsaSegment>();

        for (const payload of payloads)
        {
            for (const segment of extractSegments(payload, referencesById))
            {
                segments.set(segment.id, segment);
            }
        }

        if (segments.size === 0)
        {
            throw new Error("Aucun horaire ALSA desservant la France n’a été trouvé");
        }

        return buildFeed([...segments.values()]);
    }

    private async loadStationReferences(): Promise<AlsaStationReference[]>
    {
        const url = new URL(process.env.ALSA_LOCATIONS_URL ?? defaultLocationsUrl);
        url.searchParams.set("q", "");
        url.searchParams.set("rpn", retailerPartnerNumber);
        url.searchParams.set("locale", "fr");
        url.searchParams.append("carriers[]", carrierCode);
        url.searchParams.set("limitTopLevel", String(readPositiveInteger("ALSA_LOCATION_LIMIT", 500)));
        const payload = await this.readJson(url, "catalogue de gares") as SuggestionResponse;
        const references = collectStationReferences(payload.locations ?? []);
        return [...new Map(references.map((station) => [station.id, station])).values()];
    }

    private async loadConnections(query: ConnectionQuery): Promise<ConnectionsResponse>
    {
        const url = new URL(process.env.ALSA_CONNECTIONS_URL ?? defaultConnectionsUrl);
        url.searchParams.set("departureDate", query.date);
        url.searchParams.set("currency", "EUR");
        url.searchParams.set("locale", "fr");
        url.searchParams.set("retailerPartnerNumber", retailerPartnerNumber);
        url.searchParams.set("pax", "1");
        url.searchParams.set("marketingCarrierCode", carrierCode);

        for (const station of query.departures)
        {
            url.searchParams.append("departureStations[]", station);
        }

        for (const station of query.arrivals)
        {
            url.searchParams.append("arrivalStations[]", station);
        }

        return await this.readJson(url, `horaires du ${query.date}`) as ConnectionsResponse;
    }

    private async readJson(url: URL, source: string): Promise<unknown>
    {
        const response = await this.fetchImplementation(url,
        {
            cache: "no-store",
            headers: {
                Accept: "application/json",
                "User-Agent": "BusMinute/1.0"
            },
            signal: AbortSignal.timeout(readPositiveInteger("ALSA_TIMEOUT_MS", 30_000))
        });

        if (!response.ok)
        {
            throw new Error(`Lecture ALSA impossible pour ${source} : ${response.status}`);
        }

        return await response.json() as unknown;
    }
}

function collectStationReferences(
    locations: SuggestionLocation[],
    parentCityName = ""
): AlsaStationReference[]
{
    const values: AlsaStationReference[] = [];

    for (const location of locations)
    {
        const locationName = preferredName(location);
        const city = location.type === "city" ? locationName : parentCityName;

        if (location.type === "station"
            && location.code
            && location.countryCode
            && location.carrierMetadata?.some((metadata) => metadata.carrierCode === carrierCode))
        {
            values.push({
                id: location.code,
                countryCode: location.countryCode.toLocaleUpperCase("en"),
                cityName: city || locationName,
                stationName: locationName || location.code
            });
        }

        values.push(...collectStationReferences(location.childrenLocations ?? [], city));
    }

    return values;
}

function preferredName(location: SuggestionLocation): string
{
    return location.names?.find((name) => name.languageCode === "fr")?.name
        ?? location.names?.[0]?.name
        ?? location.bestMatch
        ?? location.code
        ?? "";
}

function buildConnectionQueries(
    frenchStations: AlsaStationReference[],
    eligibleStations: AlsaStationReference[],
    dates: string[]
): ConnectionQuery[]
{
    const originBatchSize = readPositiveInteger("ALSA_ORIGIN_BATCH_SIZE", 10);
    const destinationBatchSize = readPositiveInteger("ALSA_DESTINATION_BATCH_SIZE", 70);
    const frenchIds = frenchStations.map((station) => station.id);
    const eligibleIds = eligibleStations.map((station) => station.id);
    const foreignIds = eligibleStations
        .filter((station) => station.countryCode !== "FR")
        .map((station) => station.id);
    const queries: ConnectionQuery[] = [];

    for (const date of dates)
    {
        queries.push(...matrixQueries(date, frenchIds, eligibleIds, originBatchSize, destinationBatchSize));
        queries.push(...matrixQueries(date, foreignIds, frenchIds, originBatchSize, destinationBatchSize));
    }

    return queries;
}

function matrixQueries(
    date: string,
    departures: string[],
    arrivals: string[],
    departureBatchSize: number,
    arrivalBatchSize: number
): ConnectionQuery[]
{
    const values: ConnectionQuery[] = [];

    for (const departureBatch of batches(departures, departureBatchSize))
    {
        for (const arrivalBatch of batches(arrivals, arrivalBatchSize))
        {
            values.push({
                date,
                departures: departureBatch,
                arrivals: arrivalBatch
            });
        }
    }

    return values;
}

function extractSegments(
    payload: ConnectionsResponse,
    referencesById: Map<string, AlsaStationReference>
): AlsaSegment[]
{
    const included = payload.included ?? [];
    const cities = new Map(included.filter((resource) => resource.type === "cities" && resource.id)
        .map((resource) => [resource.id as string, textAttribute(resource, "name")]));
    const stations = new Map<string, AlsaConnectionStation>();

    for (const resource of included.filter((candidate) => candidate.type === "stations" && candidate.id))
    {
        const station = connectionStation(resource, cities, referencesById);

        if (station)
        {
            stations.set(station.id, station);
        }
    }

    const values: AlsaSegment[] = [];

    for (const resource of included.filter((candidate) => candidate.type === "segments" && candidate.id))
    {
        if (relationshipId(resource, "marketing_carrier") !== carrierCode)
        {
            continue;
        }

        const departureStation = stations.get(relationshipId(resource, "departure_station"));
        const arrivalStation = stations.get(relationshipId(resource, "arrival_station"));
        const departureTime = textAttribute(resource, "departure_time");
        const arrivalTime = textAttribute(resource, "arrival_time");

        if (!departureStation
            || !arrivalStation
            || !departureTime
            || !arrivalTime
            || (departureStation.countryCode !== "FR" && arrivalStation.countryCode !== "FR"))
        {
            continue;
        }

        values.push({
            id: resource.id as string,
            line: textAttribute(resource, "line") || "ALSA",
            departureTime,
            arrivalTime,
            departureStation,
            arrivalStation
        });
    }

    return values;
}

function connectionStation(
    resource: IncludedResource,
    cities: Map<string, string>,
    referencesById: Map<string, AlsaStationReference>
): AlsaConnectionStation | null
{
    const id = resource.id;
    const latitude = numberAttribute(resource, "latitude");
    const longitude = numberAttribute(resource, "longitude");

    if (!id || latitude === null || longitude === null)
    {
        return null;
    }

    const reference = referencesById.get(id);
    const cityName = cities.get(relationshipId(resource, "city"))
        || reference?.cityName
        || textAttribute(resource, "name")
        || id;
    return {
        id,
        countryCode: reference?.countryCode ?? id.slice(0, 2).toLocaleUpperCase("en"),
        cityName,
        name: textAttribute(resource, "name") || reference?.stationName || id,
        description: textAttribute(resource, "description") || null,
        timezone: textAttribute(resource, "time_zone") || agencyTimezone,
        latitude,
        longitude
    };
}

function buildFeed(segments: AlsaSegment[]): GtfsFeed
{
    const stops = new Map<string, GtfsStop>();
    const routes = new Map<string, GtfsRoute>();
    const calendars = new Map<string, GtfsServiceCalendar>();
    const trips: GtfsScheduledTrip[] = [];

    for (const segment of segments.sort((first, second) => first.departureTime.localeCompare(second.departureTime)))
    {
        const departure = DateTime.fromISO(segment.departureTime, { zone: segment.departureStation.timezone });
        const arrival = DateTime.fromISO(segment.arrivalTime, { zone: segment.arrivalStation.timezone });
        const serviceDate = departure.setZone(agencyTimezone).toISODate();

        if (!departure.isValid || !arrival.isValid || !serviceDate || arrival.toMillis() <= departure.toMillis())
        {
            continue;
        }

        const serviceExternalId = `${carrierCode}:${serviceDate}`;
        const routeExternalId = `${carrierCode}:${segment.line}:${segment.departureStation.id}:${segment.arrivalStation.id}`;
        const dayStart = DateTime.fromISO(serviceDate, { zone: agencyTimezone }).startOf("day");
        const departureSeconds = Math.round(departure.diff(dayStart, "seconds").seconds);
        const arrivalSeconds = Math.round(arrival.diff(dayStart, "seconds").seconds);

        stops.set(segment.departureStation.id, toGtfsStop(segment.departureStation));
        stops.set(segment.arrivalStation.id, toGtfsStop(segment.arrivalStation));
        routes.set(routeExternalId,
        {
            externalId: routeExternalId,
            agencyExternalId: carrierCode,
            shortName: segment.line,
            longName: `${formatStopName(segment.departureStation)} → ${formatStopName(segment.arrivalStation)}`,
            type: 3,
            color: "3EC8EC",
            textColor: "003B5C"
        });
        calendars.set(serviceExternalId, calendarForDate(serviceExternalId, serviceDate));
        trips.push({
            externalId: segment.id,
            routeExternalId,
            serviceExternalId,
            serviceNumber: segment.line,
            headsign: formatStopName(segment.arrivalStation),
            wheelchairAccessible: null,
            bikesAllowed: null,
            stopTimes: [
                {
                    stopExternalId: segment.departureStation.id,
                    sequence: 1,
                    arrivalSeconds: departureSeconds,
                    departureSeconds,
                    pickupType: null,
                    dropOffType: null
                },
                {
                    stopExternalId: segment.arrivalStation.id,
                    sequence: 2,
                    arrivalSeconds,
                    departureSeconds: arrivalSeconds,
                    pickupType: null,
                    dropOffType: null
                }
            ]
        });
    }

    if (trips.length === 0)
    {
        throw new Error("Les horaires ALSA reçus sont invalides");
    }

    return {
        agencies: [
            {
                externalId: carrierCode,
                name: "Alsa",
                url: "https://www.alsa.com/fr",
                timezone: agencyTimezone,
                language: "fr"
            }
        ],
        stops: [...stops.values()],
        routes: [...routes.values()],
        calendars: [...calendars.values()],
        calendarExceptions: [],
        trips,
        sourcePath: "alsa-distribusion-api"
    };
}

function toGtfsStop(station: AlsaConnectionStation): GtfsStop
{
    return {
        externalId: station.id,
        code: station.id,
        name: formatStopName(station),
        description: station.description,
        latitude: station.latitude,
        longitude: station.longitude,
        timezone: station.timezone,
        wheelchairBoarding: null
    };
}

function formatStopName(station: AlsaConnectionStation): string
{
    const city = station.cityName.trim();
    const stationName = station.name.trim();
    const remainder = stationName.toLocaleLowerCase("fr").startsWith(`${city.toLocaleLowerCase("fr")} `)
        ? stationName.slice(city.length).trim()
        : stationName;
    return remainder ? `${city} - ${remainder}` : city;
}

function calendarForDate(externalId: string, date: string): GtfsServiceCalendar
{
    const weekday = DateTime.fromISO(date, { zone: "UTC" }).weekday;
    return {
        externalId,
        monday: weekday === 1,
        tuesday: weekday === 2,
        wednesday: weekday === 3,
        thursday: weekday === 4,
        friday: weekday === 5,
        saturday: weekday === 6,
        sunday: weekday === 7,
        startDate: date,
        endDate: date
    };
}

function serviceDates(now: Date, count: number): string[]
{
    const start = DateTime.fromJSDate(now, { zone: agencyTimezone }).startOf("day");
    const values: string[] = [];

    for (let offset = 0; offset < count; offset += 1)
    {
        const date = start.plus({ days: offset }).toISODate();

        if (date)
        {
            values.push(date);
        }
    }

    return values;
}

function relationshipId(resource: IncludedResource, name: string): string
{
    return resource.relationships?.[name]?.data?.id ?? "";
}

function textAttribute(resource: IncludedResource, name: string): string
{
    const value = resource.attributes?.[name];
    return typeof value === "string" ? value.trim() : "";
}

function numberAttribute(resource: IncludedResource, name: string): number | null
{
    const value = resource.attributes?.[name];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readCountryFilter(): Set<string> | null
{
    const value = process.env.ALSA_DESTINATION_COUNTRIES?.trim();

    if (!value)
    {
        return null;
    }

    return new Set(value.split(",")
        .map((country) => country.trim().toLocaleUpperCase("en"))
        .filter(Boolean));
}

function readPositiveInteger(name: string, fallback: number): number
{
    const value = Number.parseInt(process.env[name] ?? "", 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function batches<T>(values: T[], size: number): T[][]
{
    const result: T[][] = [];

    for (let index = 0; index < values.length; index += size)
    {
        result.push(values.slice(index, index + size));
    }

    return result;
}

async function mapWithConcurrency<TInput, TOutput>(
    values: TInput[],
    concurrency: number,
    operation: (value: TInput) => Promise<TOutput>
): Promise<TOutput[]>
{
    const results = new Array<TOutput>(values.length);
    let nextIndex = 0;

    async function worker(): Promise<void>
    {
        while (nextIndex < values.length)
        {
            const index = nextIndex;
            nextIndex += 1;
            const value = values[index];

            if (value !== undefined)
            {
                results[index] = await operation(value);
            }
        }
    }

    const workerCount = Math.min(Math.max(1, concurrency), values.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
}

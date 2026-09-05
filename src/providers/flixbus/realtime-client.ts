import { AsyncCache } from "../../application/async-cache.js";

export interface FlixBusRealtimeDeviation
{
    timestamp: string;
    seconds: number;
    classification: string;
    type: string;
    updatedAt: string;
}

export interface FlixBusRealtimeEvent
{
    scheduledAt: string;
    deviation: FlixBusRealtimeDeviation | null;
}

export interface FlixBusRealtimeCall
{
    sequence: number;
    stopId: string;
    stopName: string;
    cityName: string;
    arrival: FlixBusRealtimeEvent | null;
    departure: FlixBusRealtimeEvent | null;
}

export interface FlixBusRealtimeRide
{
    id: string;
    serviceNumber: string;
    direction: string;
    nextStopSequence: number | null;
    hasArrivedAtNextStop: boolean | null;
    deviation: FlixBusRealtimeDeviation | null;
    calls: FlixBusRealtimeCall[];
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const defaultApiUrl = "https://global.api.flixbus.com/gis";
const defaultTrackerUrl = "https://www.flixbus.fr/track";

export class FlixBusRealtimeClient
{
    private readonly cache = new AsyncCache<FlixBusRealtimeRide[]>(
        readPositiveInteger("FLIXBUS_REALTIME_CACHE_SECONDS", 30) * 1000,
        200
    );
    private apiKeyPromise: Promise<string> | null = null;

    public constructor(private readonly fetcher: Fetcher = fetch)
    {
    }

    public isEnabled(): boolean
    {
        if (process.env.FLIXBUS_REALTIME_ENABLED === "false")
        {
            return false;
        }

        return process.env.NODE_ENV !== "test" || process.env.FLIXBUS_REALTIME_ENABLED === "true";
    }

    public async loadStationRides(
        stationId: string,
        from: Date,
        to: Date
    ): Promise<FlixBusRealtimeRide[]>
    {
        if (!this.isEnabled())
        {
            return [];
        }

        const cacheKey = `${stationId}:${hourKey(from)}:${hourKey(to)}`;
        return this.cache.get(cacheKey, () => this.loadStationTimetables(stationId, from, to));
    }

    private async loadStationTimetables(stationId: string, from: Date, to: Date): Promise<FlixBusRealtimeRide[]>
    {
        const apiKey = await this.apiKey();
        const [departures, arrivals] = await Promise.all(
        [
            this.loadTimetable(stationId, "departures", from, to, apiKey),
            this.loadTimetable(stationId, "arrivals", from, to, apiKey)
        ]);
        return deduplicateRides([...departures, ...arrivals]);
    }

    private async loadTimetable(
        stationId: string,
        direction: "departures" | "arrivals",
        from: Date,
        to: Date,
        apiKey: string
    ): Promise<FlixBusRealtimeRide[]>
    {
        const apiUrl = process.env.FLIXBUS_REALTIME_API_URL ?? defaultApiUrl;
        const parameters = new URLSearchParams(
        {
            from: from.toISOString(),
            to: to.toISOString(),
            apiKey
        });
        const url = `${apiUrl}/v2/timetable/${encodeURIComponent(stationId)}/${direction}?${parameters}`;
        const response = await this.fetcher(url,
        {
            headers: {
                Accept: "application/json",
                "Accept-Language": "fr-FR"
            },
            signal: AbortSignal.timeout(readPositiveInteger("FLIXBUS_REALTIME_TIMEOUT_MS", 12_000))
        });

        if (!response.ok)
        {
            throw new Error(`Lecture du temps réel FlixBus impossible : ${response.status}`);
        }

        return parseRealtimeRides(await response.json() as unknown);
    }

    private async apiKey(): Promise<string>
    {
        const configured = process.env.FLIXBUS_REALTIME_API_KEY?.trim();

        if (configured)
        {
            return configured;
        }

        this.apiKeyPromise ??= this.discoverApiKey().catch((error: unknown) =>
        {
            this.apiKeyPromise = null;
            throw error;
        });
        return this.apiKeyPromise;
    }

    private async discoverApiKey(): Promise<string>
    {
        const trackerUrl = process.env.FLIXBUS_TRACKER_URL ?? defaultTrackerUrl;
        const trackerResponse = await this.fetcher(trackerUrl,
        {
            headers: { "Accept-Language": "fr-FR" },
            signal: AbortSignal.timeout(readPositiveInteger("FLIXBUS_REALTIME_TIMEOUT_MS", 12_000))
        });

        if (!trackerResponse.ok)
        {
            throw new Error(`Lecture du suivi FlixBus impossible : ${trackerResponse.status}`);
        }

        const trackerHtml = await trackerResponse.text();
        const assetPath = trackerHtml.match(/<script[^>]+src=["']([^"']*\/assets\/index-[^"']+\.js)["']/i)?.[1];

        if (!assetPath)
        {
            throw new Error("Configuration du suivi FlixBus introuvable");
        }

        const assetUrl = new URL(assetPath, trackerResponse.url || trackerUrl);
        const assetResponse = await this.fetcher(assetUrl,
        {
            signal: AbortSignal.timeout(readPositiveInteger("FLIXBUS_REALTIME_TIMEOUT_MS", 12_000))
        });

        if (!assetResponse.ok)
        {
            throw new Error(`Lecture de la configuration FlixBus impossible : ${assetResponse.status}`);
        }

        const asset = await assetResponse.text();
        const apiKey = asset.match(/WIMR_API_KEY\s*:\s*["']([^"']+)["']/)?.[1];

        if (!apiKey)
        {
            throw new Error("Clé du suivi FlixBus introuvable");
        }

        return apiKey;
    }
}

export function parseRealtimeRides(value: unknown): FlixBusRealtimeRide[]
{
    const root = record(value);
    const rides = Array.isArray(root?.rides) ? root.rides : [];
    return rides.map(parseRide).filter((ride): ride is FlixBusRealtimeRide => ride !== null);
}

function parseRide(value: unknown): FlixBusRealtimeRide | null
{
    const ride = record(value);
    const line = record(ride?.line);
    const status = record(ride?.status);
    const id = textValue(ride?.id);
    const serviceNumber = textValue(line?.code);
    const calls = Array.isArray(ride?.calls)
        ? ride.calls.map(parseCall).filter((call): call is FlixBusRealtimeCall => call !== null)
        : [];

    if (!id || !serviceNumber || calls.length === 0)
    {
        return null;
    }

    return {
        id,
        serviceNumber,
        direction: textValue(line?.direction) ?? calls[calls.length - 1]?.cityName ?? "",
        nextStopSequence: numberValue(status?.next_stop_sequence),
        hasArrivedAtNextStop: booleanValue(status?.has_arrived_at_next_stop),
        deviation: parseDeviation(status?.deviation),
        calls
    };
}

function parseCall(value: unknown): FlixBusRealtimeCall | null
{
    const call = record(value);
    const stop = record(call?.stop);
    const city = record(stop?.city);
    const sequence = numberValue(call?.sequence);
    const stopId = textValue(stop?.id);

    if (sequence === null || !stopId)
    {
        return null;
    }

    return {
        sequence,
        stopId,
        stopName: textValue(stop?.name) ?? stopId,
        cityName: textValue(city?.name) ?? textValue(stop?.name) ?? stopId,
        arrival: parseEvent(call?.arrival),
        departure: parseEvent(call?.departure)
    };
}

function parseEvent(value: unknown): FlixBusRealtimeEvent | null
{
    const event = record(value);
    const scheduledAt = textValue(event?.scheduled);

    if (!scheduledAt)
    {
        return null;
    }

    return {
        scheduledAt,
        deviation: parseDeviation(event?.deviation)
    };
}

function parseDeviation(value: unknown): FlixBusRealtimeDeviation | null
{
    const deviation = record(value);
    const timestamp = textValue(deviation?.deviation_timestamp);
    const seconds = numberValue(deviation?.deviation_seconds);

    if (!timestamp || seconds === null)
    {
        return null;
    }

    return {
        timestamp,
        seconds,
        classification: textValue(deviation?.deviation_class) ?? "UNKNOWN",
        type: textValue(deviation?.deviation_type) ?? "UNKNOWN",
        updatedAt: textValue(deviation?.updated_at) ?? timestamp
    };
}

function deduplicateRides(rides: FlixBusRealtimeRide[]): FlixBusRealtimeRide[]
{
    return [...new Map(rides.map((ride) => [ride.id, ride])).values()];
}

function hourKey(value: Date): string
{
    return value.toISOString().slice(0, 13);
}

function record(value: unknown): Record<string, unknown> | null
{
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function textValue(value: unknown): string | null
{
    return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null
{
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean | null
{
    return typeof value === "boolean" ? value : null;
}

function readPositiveInteger(name: string, fallback: number): number
{
    const value = Number.parseInt(process.env[name] ?? "", 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

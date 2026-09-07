import { DateTime } from "luxon";
import { AsyncCache } from "../../application/async-cache.js";

export interface AlsaRealtimeEndpoint
{
    name: string;
    city: string;
    countryCode: string;
    timezone: string;
}

export interface AlsaRealtimeRequest
{
    cacheKey: string;
    serviceNumber: string;
    serviceDate: string;
    departureAt: string;
    arrivalAt: string;
    origin: AlsaRealtimeEndpoint;
    destination: AlsaRealtimeEndpoint;
}

export interface AlsaRealtimeVehicle
{
    registration: string | null;
    latitude: number | null;
    longitude: number | null;
}

export interface AlsaRealtimeCall
{
    stopId: string;
    stopName: string;
    sequence: number;
    visited: boolean;
    aimedArrivalAt: string | null;
    expectedArrivalAt: string | null;
    actualArrivalAt: string | null;
    aimedDepartureAt: string | null;
    expectedDepartureAt: string | null;
    actualDepartureAt: string | null;
    latitude: number | null;
    longitude: number | null;
}

export interface AlsaRealtimeJourney
{
    serviceNumber: string;
    flight: string;
    originStopId: string;
    destinationStopId: string;
    recordedAt: string;
    calls: AlsaRealtimeCall[];
    vehicles: AlsaRealtimeVehicle[];
}

export interface AlsaTrackingLocation
{
    id: string;
    name: string;
    provinceCountryName: string;
}

interface AlsaSession
{
    actionUrl: string;
    generation: number;
    expiresAt: number;
}

interface CachedRouteSearch
{
    resourceUrl: string;
    legs: AlsaSearchLeg[];
}

interface AlsaSearchLeg
{
    departureDate: string;
    departureTime: string;
    arrivalDate: string;
    arrivalTime: string;
    headerDate: string;
    service: string;
    flight: string;
    originId: string;
    destinationId: string;
}

interface AlsaSearchSelection extends AlsaSearchLeg
{
    resourceUrl: string;
}

interface TimedValue<T>
{
    value: T;
    expiresAt: number;
}

type FetchImplementation = (
    input: string | URL | Request,
    init?: RequestInit
) => Promise<Response>;

const defaultTrackerUrl = "https://www.alsa.com/fr/a-bord/localisez-votre-bus";
const namespace = "_TrackingBusPortlet_WAR_Alsaportlet_";

export class AlsaRealtimeClient
{
    private readonly journeyCache = new AsyncCache<AlsaRealtimeJourney | null>(
        readPositiveInteger("ALSA_REALTIME_CACHE_SECONDS", 30) * 1000,
        300
    );
    private readonly locationCache = new AsyncCache<AlsaTrackingLocation[]>(
        readPositiveInteger("ALSA_REALTIME_LOCATION_CACHE_SECONDS", 21_600) * 1000
    );
    private readonly routeSearchCache = new AsyncCache<CachedRouteSearch>(60_000, 100);
    private readonly cookies = new Map<string, string>();
    private session: TimedValue<AlsaSession> | null = null;
    private sessionPromise: Promise<AlsaSession> | null = null;
    private generation = 0;
    private activeRequests = 0;
    private readonly requestWaiters: Array<() => void> = [];

    public constructor(
        private readonly fetchImplementation: FetchImplementation = fetch,
        private readonly now: () => Date = () => new Date()
    )
    {
    }

    public isEnabled(): boolean
    {
        if (process.env.ALSA_REALTIME_ENABLED === "false")
        {
            return false;
        }

        return process.env.NODE_ENV !== "test" || process.env.ALSA_REALTIME_ENABLED === "true";
    }

    public async loadJourney(request: AlsaRealtimeRequest): Promise<AlsaRealtimeJourney | null>
    {
        if (!this.isEnabled() || !isWithinTrackingWindow(request, this.now()))
        {
            return null;
        }

        return this.journeyCache.get(request.cacheKey, () => this.withRequestSlot(async () =>
        {
            try
            {
                return await this.loadJourneyOnce(request);
            }
            catch
            {
                this.invalidateSession();
                return await this.loadJourneyOnce(request);
            }
        }));
    }

    private async loadJourneyOnce(request: AlsaRealtimeRequest): Promise<AlsaRealtimeJourney | null>
    {
        const session = await this.loadSession();
        const locations = await this.locationCache.get("locations", () => this.loadLocations(session));
        const origin = matchAlsaTrackingLocation(request.origin.city, request.origin.countryCode, locations);
        const destination = matchAlsaTrackingLocation(
            request.destination.city,
            request.destination.countryCode,
            locations
        );

        if (!origin || !destination)
        {
            return null;
        }

        const routeKey = `${session.generation}:${origin.id}:${destination.id}`;
        const routeSearch = await this.routeSearchCache.get(routeKey, () =>
        {
            return this.searchRoute(session, origin, destination);
        });
        const selection = selectSearchLeg(routeSearch, request);

        if (!selection)
        {
            return null;
        }

        return this.loadTracking(selection, request);
    }

    private async loadSession(): Promise<AlsaSession>
    {
        if (this.session && this.session.expiresAt > Date.now())
        {
            return this.session.value;
        }

        if (this.sessionPromise)
        {
            return this.sessionPromise;
        }

        this.sessionPromise = this.bootstrapSession().finally(() =>
        {
            this.sessionPromise = null;
        });
        return this.sessionPromise;
    }

    private async bootstrapSession(): Promise<AlsaSession>
    {
        this.cookies.clear();
        const trackerUrl = process.env.ALSA_REALTIME_TRACKER_URL ?? defaultTrackerUrl;
        const response = await this.request(trackerUrl,
        {
            headers: {
                Accept: "text/html,application/xhtml+xml",
                "Accept-Language": "fr-FR,fr;q=0.9"
            }
        });

        if (!response.ok)
        {
            throw new Error(`Ouverture du suivi ALSA impossible : ${response.status}`);
        }

        const html = await response.text();
        const actionUrl = readDoubleQuotedParameter(html, "byJourney");

        if (!actionUrl)
        {
            throw new Error("Action de recherche du suivi ALSA introuvable");
        }

        const value: AlsaSession = {
            actionUrl: decodeHtml(actionUrl),
            generation: this.generation += 1,
            expiresAt: Date.now() + readPositiveInteger("ALSA_REALTIME_SESSION_SECONDS", 600) * 1000
        };
        this.session = { value, expiresAt: value.expiresAt };
        return value;
    }

    private async loadLocations(session: AlsaSession): Promise<AlsaTrackingLocation[]>
    {
        const trackerUrl = process.env.ALSA_REALTIME_TRACKER_URL ?? defaultTrackerUrl;
        const configuredUrl = process.env.ALSA_REALTIME_LOCATIONS_URL?.trim();
        const url = configuredUrl
            ? new URL(configuredUrl)
            : resourceUrl(trackerUrl, "JsonGetOrigins");
        url.searchParams.set("timetableMode", "true");
        const response = await this.request(url,
        {
            headers: {
                Accept: "application/json",
                Referer: trackerUrl
            }
        });

        if (!response.ok)
        {
            this.invalidateSession(session);
            throw new Error(`Lecture des villes du suivi ALSA impossible : ${response.status}`);
        }

        return parseAlsaTrackingLocations(await response.json() as unknown);
    }

    private async searchRoute(
        session: AlsaSession,
        origin: AlsaTrackingLocation,
        destination: AlsaTrackingLocation
    ): Promise<CachedRouteSearch>
    {
        const body = new URLSearchParams();
        body.set(`${namespace}previousOriginName`, origin.name);
        body.set(`${namespace}originStationId`, origin.id);
        body.set(`${namespace}previousDestinationName`, destination.name);
        body.set(`${namespace}destinationStationId`, destination.id);
        const response = await this.request(session.actionUrl,
        {
            method: "POST",
            body,
            headers: {
                Accept: "text/html,application/xhtml+xml",
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: process.env.ALSA_REALTIME_TRACKER_URL ?? defaultTrackerUrl
            }
        });

        if (!response.ok)
        {
            this.invalidateSession(session);
            throw new Error(`Recherche du trajet ALSA impossible : ${response.status}`);
        }

        const result = parseAlsaSearchHtml(await response.text());

        if (!result)
        {
            this.invalidateSession(session);
            throw new Error("Réponse de recherche du suivi ALSA invalide");
        }

        return result;
    }

    private async loadTracking(
        selection: AlsaSearchSelection,
        request: AlsaRealtimeRequest
    ): Promise<AlsaRealtimeJourney | null>
    {
        const url = new URL(selection.resourceUrl);
        url.searchParams.set(`${namespace}date`, compactDate(selection.headerDate));
        url.searchParams.set(`${namespace}flight`, selection.flight);
        url.searchParams.set(`${namespace}service`, selection.service);
        url.searchParams.set(`${namespace}legOriginStationId`, selection.originId);
        url.searchParams.set(`${namespace}legDestinationStationId`, selection.destinationId);
        const response = await this.request(url,
        {
            method: "POST",
            headers: {
                Accept: "application/json",
                "X-Requested-With": "XMLHttpRequest",
                Referer: process.env.ALSA_REALTIME_TRACKER_URL ?? defaultTrackerUrl
            }
        });

        if (!response.ok)
        {
            throw new Error(`Lecture du temps réel ALSA impossible : ${response.status}`);
        }

        const journeys = parseAlsaTrackingResponse(
            await response.json() as unknown,
            selection,
            request,
            this.now()
        );
        return journeys[0] ?? null;
    }

    private async request(input: string | URL, init: RequestInit = {}): Promise<Response>
    {
        let url = new URL(input.toString());
        let method = init.method ?? "GET";
        let body = init.body;
        const baseHeaders = new Headers(init.headers);

        for (let redirectCount = 0; redirectCount < 20; redirectCount += 1)
        {
            const headers = new Headers(baseHeaders);
            headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36");

            if (this.cookies.size > 0)
            {
                headers.set("Cookie", [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "));
            }

            const response = await this.fetchImplementation(url,
            {
                ...init,
                method,
                body,
                headers,
                redirect: "manual",
                signal: init.signal ?? AbortSignal.timeout(readPositiveInteger("ALSA_REALTIME_TIMEOUT_MS", 15_000))
            });
            this.rememberCookies(response.headers);
            const location = response.headers.get("location");

            if (!location || !isRedirect(response.status))
            {
                return response;
            }

            url = new URL(location, url);

            if (response.status === 303 || (response.status === 301 || response.status === 302) && method === "POST")
            {
                method = "GET";
                body = null;
                baseHeaders.delete("Content-Type");
            }
        }

        throw new Error("Trop de redirections lors de la connexion au suivi ALSA");
    }

    private rememberCookies(headers: Headers): void
    {
        const cookieHeaders = headers as Headers & { getSetCookie?: () => string[] };
        const values = cookieHeaders.getSetCookie?.() ?? splitSetCookieHeader(headers.get("set-cookie"));

        for (const value of values)
        {
            const cookie = value.split(";", 1)[0];
            const separator = cookie?.indexOf("=") ?? -1;

            if (!cookie || separator <= 0)
            {
                continue;
            }

            const name = cookie.slice(0, separator).trim();
            const cookieValue = cookie.slice(separator + 1).trim();

            if (cookieValue)
            {
                this.cookies.set(name, cookieValue);
            }
            else
            {
                this.cookies.delete(name);
            }
        }
    }

    private invalidateSession(session?: AlsaSession): void
    {
        if (!session || this.session?.value.generation === session.generation)
        {
            this.session = null;
            this.sessionPromise = null;
        }
    }

    private async withRequestSlot<T>(operation: () => Promise<T>): Promise<T>
    {
        const maximum = readPositiveInteger("ALSA_REALTIME_CONCURRENCY", 2);

        if (this.activeRequests >= maximum)
        {
            await new Promise<void>((resolve) => this.requestWaiters.push(resolve));
        }

        this.activeRequests += 1;

        try
        {
            return await operation();
        }
        finally
        {
            this.activeRequests -= 1;
            this.requestWaiters.shift()?.();
        }
    }
}

export function parseAlsaTrackingLocations(value: unknown): AlsaTrackingLocation[]
{
    if (!Array.isArray(value))
    {
        return [];
    }

    return value.map((candidate) =>
    {
        const location = record(candidate);
        const id = textValue(location?.id);
        const name = textValue(location?.name);

        if (!id || !name)
        {
            return null;
        }

        return {
            id,
            name,
            provinceCountryName: textValue(location?.provincecountryName) ?? ""
        };
    }).filter((location): location is AlsaTrackingLocation => location !== null);
}

export function matchAlsaTrackingLocation(
    city: string,
    countryCode: string,
    locations: AlsaTrackingLocation[]
): AlsaTrackingLocation | null
{
    const normalizedCity = normalize(city);
    const countryName = localizedCountryName(countryCode);
    const candidates = locations.map((location) =>
    {
        const normalizedName = normalize(location.name).replace(/\s+(?:tous|todas|todos)\s+les?\s+arrets?$/, "");
        const countryMatches = !countryName
            || normalize(location.provinceCountryName).includes(countryName);
        return {
            location,
            score: countryMatches ? nameDistance(normalizedCity, normalizedName) : Number.POSITIVE_INFINITY
        };
    }).filter((candidate) => Number.isFinite(candidate.score))
        .sort((first, second) => first.score - second.score || first.location.name.length - second.location.name.length);
    const best = candidates[0];

    if (!best || best.score > 0.34)
    {
        return null;
    }

    return best.location;
}

export function parseAlsaSearchHtml(html: string): CachedRouteSearch | null
{
    const json = readSingleQuotedParameter(html, "jsonTrackingBus");
    const resourceUrlValue = readDoubleQuotedParameter(html, "getBusServiceTrackingURL");

    if (json === null || !resourceUrlValue)
    {
        return null;
    }

    const payload = record(JSON.parse(json.replace(/\\'/g, "'")) as unknown);
    const journeys = Array.isArray(payload?.navegaliaList) ? payload.navegaliaList : [];
    const legs: AlsaSearchLeg[] = [];

    for (const value of journeys)
    {
        const journey = record(value);
        const rawLegs = Array.isArray(journey?.legs) ? journey.legs : [];

        for (const rawLeg of rawLegs)
        {
            const leg = record(rawLeg);
            const parsed = parseSearchLeg(leg);

            if (parsed)
            {
                legs.push(parsed);
            }
        }
    }

    return {
        resourceUrl: decodeHtml(resourceUrlValue),
        legs
    };
}

export function parseAlsaTrackingResponse(
    value: unknown,
    selection: Pick<AlsaSearchLeg, "flight" | "originId" | "destinationId">,
    request: AlsaRealtimeRequest,
    recordedAt = new Date()
): AlsaRealtimeJourney[]
{
    const values = Array.isArray(value) ? value : [value];
    return values.map((candidate) =>
    {
        const journey = record(candidate);
        const serviceNumber = textValue(journey?.codLinea);
        const itinerary = Array.isArray(journey?.itinerario) ? journey.itinerario : [];

        if (!serviceNumber || itinerary.length === 0)
        {
            return null;
        }

        const calls = itinerary.map((rawCall, index) =>
        {
            return parseTrackingCall(
                rawCall,
                index,
                selection.originId,
                selection.destinationId,
                request
            );
        }).filter((call): call is AlsaRealtimeCall => call !== null);

        if (calls.length === 0)
        {
            return null;
        }

        const buses = Array.isArray(journey?.buses) ? journey.buses : [];
        return {
            serviceNumber,
            flight: selection.flight,
            originStopId: selection.originId,
            destinationStopId: selection.destinationId,
            recordedAt: recordedAt.toISOString(),
            calls,
            vehicles: buses.map(parseVehicle).filter((vehicle): vehicle is AlsaRealtimeVehicle => vehicle !== null)
        };
    }).filter((journey): journey is AlsaRealtimeJourney => journey !== null);
}

function parseSearchLeg(value: Record<string, unknown> | null): AlsaSearchLeg | null
{
    const departureDate = textValue(value?.departureDate);
    const departureTime = textValue(value?.departureTime);
    const arrivalDate = textValue(value?.arrivalDate);
    const arrivalTime = textValue(value?.arrivalTime);
    const service = textValue(value?.service);
    const flight = textValue(value?.flight);
    const originId = textValue(value?.legOriginId);
    const destinationId = textValue(value?.legDestinationId);

    if (!departureDate
        || !departureTime
        || !arrivalDate
        || !arrivalTime
        || !service
        || !flight
        || !originId
        || !destinationId)
    {
        return null;
    }

    return {
        departureDate,
        departureTime,
        arrivalDate,
        arrivalTime,
        headerDate: textValue(value?.headerDate) ?? departureDate,
        service,
        flight,
        originId,
        destinationId
    };
}

function selectSearchLeg(search: CachedRouteSearch, request: AlsaRealtimeRequest): AlsaSearchSelection | null
{
    const departureTime = DateTime.fromISO(request.departureAt).setZone(request.origin.timezone);
    const arrivalTime = DateTime.fromISO(request.arrivalAt).setZone(request.destination.timezone);
    const candidates = search.legs.filter((leg) =>
    {
        return normalizeServiceNumber(leg.service) === normalizeServiceNumber(request.serviceNumber)
            && europeanDateToIso(leg.departureDate) === request.serviceDate;
    }).map((leg) =>
    {
        return {
            leg,
            departureDifference: clockDifferenceMinutes(leg.departureTime, departureTime.toFormat("HH:mm")),
            arrivalDifference: clockDifferenceMinutes(leg.arrivalTime, arrivalTime.toFormat("HH:mm"))
        };
    }).sort((first, second) =>
    {
        return first.departureDifference - second.departureDifference
            || first.arrivalDifference - second.arrivalDifference;
    });
    const best = candidates[0];

    if (!best || best.departureDifference > 20 || best.arrivalDifference > 90)
    {
        return null;
    }

    return {
        ...best.leg,
        resourceUrl: search.resourceUrl
    };
}

function parseTrackingCall(
    value: unknown,
    index: number,
    originId: string,
    destinationId: string,
    request: AlsaRealtimeRequest
): AlsaRealtimeCall | null
{
    const call = record(value);
    const stopId = textValue(call?.pueblo);
    const stopName = textValue(call?.nomPueblo);
    const date = textValue(call?.fecha);

    if (!stopId || !stopName || !date)
    {
        return null;
    }

    const timezone = stopId === originId
        ? request.origin.timezone
        : stopId === destinationId
            ? request.destination.timezone
            : request.origin.timezone;
    const aimedArrivalAt = localDateTime(date, textValue(call?.hllegada), timezone);
    const aimedDepartureAt = localDateTime(date, textValue(call?.hsalida), timezone);
    const actualArrivalAt = localDateTime(date, trackingTime(call?.realArrivalTime), timezone);
    const actualDepartureAt = localDateTime(date, trackingTime(call?.realDepartureTime), timezone);
    const explicitExpectedArrivalAt = localDateTime(date, trackingTime(call?.estArrivalTime), timezone);
    const explicitExpectedDepartureAt = localDateTime(date, trackingTime(call?.estDepartureTime), timezone);
    const generalEstimate = localDateTime(date, trackingTime(call?.estDate), timezone);
    const sameScheduledTime = aimedArrivalAt === aimedDepartureAt;
    const expectedArrivalAt = actualArrivalAt
        ? null
        : explicitExpectedArrivalAt
            ?? (stopId === destinationId || sameScheduledTime ? generalEstimate : null);
    const expectedDepartureAt = actualDepartureAt
        ? null
        : explicitExpectedDepartureAt
            ?? (stopId === originId || sameScheduledTime ? generalEstimate : null);

    return {
        stopId,
        stopName,
        sequence: index + 1,
        visited: textValue(call?.visitada) === "1",
        aimedArrivalAt,
        expectedArrivalAt,
        actualArrivalAt,
        aimedDepartureAt,
        expectedDepartureAt,
        actualDepartureAt,
        latitude: numberValue(call?.latitud),
        longitude: numberValue(call?.longitud)
    };
}

function parseVehicle(value: unknown): AlsaRealtimeVehicle | null
{
    const vehicle = record(value);

    if (!vehicle)
    {
        return null;
    }

    return {
        registration: textValue(vehicle.matricula),
        latitude: numberValue(vehicle.latitud),
        longitude: numberValue(vehicle.longitud)
    };
}

function isWithinTrackingWindow(request: AlsaRealtimeRequest, now: Date): boolean
{
    const today = DateTime.fromJSDate(now, { zone: request.origin.timezone }).toISODate();

    if (today !== request.serviceDate)
    {
        return false;
    }

    const departure = new Date(request.departureAt).getTime();
    const arrival = new Date(request.arrivalAt).getTime();
    const current = now.getTime();

    if (!Number.isFinite(departure) || !Number.isFinite(arrival))
    {
        return false;
    }

    return current >= departure - readPositiveInteger("ALSA_REALTIME_BEFORE_DEPARTURE_MINUTES", 120) * 60_000
        && current <= arrival + readPositiveInteger("ALSA_REALTIME_AFTER_ARRIVAL_MINUTES", 360) * 60_000;
}

function resourceUrl(baseUrl: string, resourceId: string): URL
{
    const url = new URL(baseUrl);
    url.searchParams.set("p_p_id", "TrackingBusPortlet_WAR_Alsaportlet");
    url.searchParams.set("p_p_lifecycle", "2");
    url.searchParams.set("p_p_state", "normal");
    url.searchParams.set("p_p_mode", "view");
    url.searchParams.set("p_p_resource_id", resourceId);
    url.searchParams.set("p_p_cacheability", "cacheLevelPage");
    return url;
}

function readSingleQuotedParameter(html: string, name: string): string | null
{
    const escapedName = escapeRegularExpression(name);
    return html.match(new RegExp(`params\\["${escapedName}"\\]\\s*=\\s*'((?:\\\\.|[^'])*)'`))?.[1] ?? null;
}

function readDoubleQuotedParameter(html: string, name: string): string | null
{
    const escapedName = escapeRegularExpression(name);
    return html.match(new RegExp(`params\\["${escapedName}"\\]\\s*=\\s*"((?:\\\\.|[^"])*)"`))?.[1] ?? null;
}

function escapeRegularExpression(value: string): string
{
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtml(value: string): string
{
    return value.replace(/&amp;/g, "&").replace(/\\\//g, "/");
}

function splitSetCookieHeader(value: string | null): string[]
{
    return value?.split(/,(?=\s*[^;,\s=]+=[^;,]*)/) ?? [];
}

function isRedirect(status: number): boolean
{
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function compactDate(value: string): string
{
    const [day, month, year] = value.split("/");
    return day && month && year ? `${year}${month}${day}` : value.replace(/\D/g, "");
}

function europeanDateToIso(value: string): string
{
    const [day, month, year] = value.split("/");
    return day && month && year ? `${year}-${month}-${day}` : "";
}

function clockDifferenceMinutes(first: string, second: string): number
{
    const firstMinutes = clockMinutes(first);
    const secondMinutes = clockMinutes(second);

    if (firstMinutes === null || secondMinutes === null)
    {
        return Number.POSITIVE_INFINITY;
    }

    const difference = Math.abs(firstMinutes - secondMinutes);
    return Math.min(difference, 1_440 - difference);
}

function clockMinutes(value: string): number | null
{
    const match = value.match(/^(\d{1,2}):(\d{2})/);

    if (!match)
    {
        return null;
    }

    const hours = Number.parseInt(match[1] ?? "", 10);
    const minutes = Number.parseInt(match[2] ?? "", 10);
    return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60
        ? hours * 60 + minutes
        : null;
}

function trackingTime(value: unknown): string | null
{
    const text = textValue(value)?.match(/(\d{1,2}:\d{2})/)?.[1];
    return text ?? null;
}

function localDateTime(date: string, time: string | null, timezone: string): string | null
{
    if (!time)
    {
        return null;
    }

    const value = DateTime.fromFormat(`${date} ${time}`, "yyyyMMdd HH:mm", { zone: timezone });
    return value.isValid ? value.toUTC().toISO() : null;
}

function localizedCountryName(countryCode: string): string
{
    const values: Record<string, string> = {
        BE: "belgique",
        CH: "suisse",
        DE: "allemagne",
        ES: "espagne",
        FR: "france",
        IT: "italie",
        PT: "portugal"
    };
    return values[countryCode.toLocaleUpperCase("en")] ?? "";
}

function nameDistance(first: string, second: string): number
{
    if (!first || !second)
    {
        return Number.POSITIVE_INFINITY;
    }

    if (first === second)
    {
        return 0;
    }

    if (first.startsWith(`${second} `) || second.startsWith(`${first} `))
    {
        return 0.08;
    }

    return levenshteinDistance(first, second) / Math.max(first.length, second.length);
}

function levenshteinDistance(first: string, second: string): number
{
    const previous = Array.from({ length: second.length + 1 }, (_, index) => index);

    for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1)
    {
        const current = [firstIndex];

        for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1)
        {
            current[secondIndex] = Math.min(
                (current[secondIndex - 1] ?? 0) + 1,
                (previous[secondIndex] ?? 0) + 1,
                (previous[secondIndex - 1] ?? 0) + Number(first[firstIndex - 1] !== second[secondIndex - 1])
            );
        }

        previous.splice(0, previous.length, ...current);
    }

    return previous[second.length] ?? Math.max(first.length, second.length);
}

function normalizeServiceNumber(value: string): string
{
    return value.trim().toLocaleUpperCase("en").replace(/^ALSA\s+/, "");
}

function normalize(value: string): string
{
    return value.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("fr")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function record(value: unknown): Record<string, unknown> | null
{
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function textValue(value: unknown): string | null
{
    if (typeof value === "number" && Number.isFinite(value))
    {
        return String(value);
    }

    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null
{
    const number = typeof value === "number" ? value : Number.parseFloat(typeof value === "string" ? value : "");
    return Number.isFinite(number) ? number : null;
}

function readPositiveInteger(name: string, fallback: number): number
{
    const value = Number.parseInt(process.env[name] ?? "", 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

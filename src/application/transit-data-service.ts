import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GtfsFeed, SiriEstimatedTimetable, SiriJourney } from "../domain/models.js";
import { getDatabasePool } from "../db/database.js";
import
{
    PostgresTransitSnapshotRepository,
    type TransitSyncStatus
} from "../db/postgres-transit-snapshot-repository.js";
import { BlaBlaCarGtfsImporter } from "../providers/blablacar/gtfs/importer.js";
import { BlaBlaCarSiriParser } from "../providers/blablacar/siri/parser.js";
import { GtfsSiriTripMatcher } from "../services/trip-matcher.js";
import
{
    buildJourneyView,
    cityName,
    citySlug,
    type CityBoardView,
    type CityDirectoryEntryView,
    type DepartureBoardView,
    type JourneyView,
    type PlaceSearchResultView,
    type PunctualitySummaryView,
    type RouteBoardView,
    type SeoIndexView,
    type StopBoardView
} from "./journey-view.js";

const officialGtfsUrl = "https://drive.google.com/uc?export=download&id=1VXd01yQl2Mb67C9bkrx0P8sqNIL532_o";
const officialSiriUrl = "https://open-data.bus.blablacar.com/api/siri-lite/estimated-timetable";
const siriLifetimeMilliseconds = 45_000;
const databaseFeedLifetimeMilliseconds = 300_000;
const punctualityLifetimeMilliseconds = 600_000;

interface TimedValue<T>
{
    value: T;
    expiresAt: number;
}

export class TransitDataService
{
    private readonly gtfsImporter = new BlaBlaCarGtfsImporter();
    private readonly siriParser = new BlaBlaCarSiriParser();
    private readonly matcher = new GtfsSiriTripMatcher();
    private gtfsPromise: Promise<GtfsFeed> | null = null;
    private databaseFeedCache: TimedValue<GtfsFeed> | null = null;
    private siriCache: TimedValue<SiriEstimatedTimetable> | null = null;
    private databaseRepository: PostgresTransitSnapshotRepository | null = null;
    private readonly punctualityCache = new Map<string, TimedValue<PunctualitySummaryView | null>>();

    public async search(query: string, limit = 12): Promise<JourneyView[]>
    {
        const normalized = normalizeSearch(query);

        if (normalized.length < 2)
        {
            return [];
        }

        const [feed, timetable] = await Promise.all([this.getFeed(), this.getTimetable()]);
        const journeys = timetable.journeys.filter((journey) =>
        {
            return normalizeSearch(journey.serviceNumber).includes(normalized)
                || normalizeSearch(journey.journeyRef).includes(normalized)
                || journey.calls.some((call) =>
                {
                    return normalizeSearch(call.stopPointRef).includes(normalized)
                        || call.stopPointName !== null && normalizeSearch(call.stopPointName).includes(normalized);
                });
        });

        return this.toViews(feed, journeys, limit);
    }

    public async searchPlaces(query: string, limit = 8): Promise<PlaceSearchResultView[]>
    {
        const normalized = normalizeSearch(query);

        if (normalized.length < 2)
        {
            return [];
        }

        const feed = await this.getFeed();
        const directory = buildCityDirectory(feed, []);
        const cities = directory
            .filter((city) => normalizeSearch(city.name).includes(normalized) || city.slug.includes(normalized))
            .map((city) =>
            {
                return {
                    type: "city" as const,
                    id: city.slug,
                    label: city.name,
                    detail: `${city.stopCount} gare${city.stopCount > 1 ? "s" : ""}`,
                    href: `/ville/${city.slug}`
                };
            });
        const stops = feed.stops
            .filter((stop) =>
            {
                return normalizeSearch(stop.externalId).includes(normalized)
                    || normalizeSearch(stop.name).includes(normalized);
            })
            .map((stop) =>
            {
                return {
                    type: "stop" as const,
                    id: stop.externalId,
                    label: stop.name,
                    detail: `Gare · ${stop.externalId}`,
                    href: `/gares/${encodeURIComponent(stop.externalId)}`
                };
            });

        return [...cities, ...stops]
            .sort((first, second) =>
            {
                return placeSearchScore(first, normalized) - placeSearchScore(second, normalized)
                    || Number(first.type === "stop") - Number(second.type === "stop")
                    || first.label.localeCompare(second.label, "fr");
            })
            .slice(0, limit);
    }

    public async getCityDirectory(): Promise<CityDirectoryEntryView[]>
    {
        const [feed, timetable] = await Promise.all([this.getFeed(), this.getTimetable()]);
        return buildCityDirectory(feed, timetable.journeys);
    }

    public async getFeaturedCities(limit = 6): Promise<CityDirectoryEntryView[]>
    {
        const directory = await this.getCityDirectory();
        return [...directory]
            .sort((first, second) =>
            {
                return second.liveJourneyCount - first.liveJourneyCount
                    || second.stopCount - first.stopCount
                    || first.name.localeCompare(second.name, "fr");
            })
            .slice(0, limit);
    }

    public async getCityBoard(slug: string): Promise<CityBoardView | null>
    {
        const [feed, timetable] = await Promise.all([this.getFeed(), this.getTimetable()]);
        const stops = feed.stops.filter((stop) => citySlug(cityName(stop.name)) === slug);

        if (stops.length === 0)
        {
            return null;
        }

        const stopIds = new Set(stops.map((stop) => stop.externalId));
        const journeys = timetable.journeys.filter((journey) =>
        {
            return journey.calls.some((call) => stopIds.has(call.stopPointRef));
        });

        return {
            slug,
            name: cityName(stops[0]?.name ?? slug),
            stops: stops.map((stop) =>
            {
                return {
                    stopId: stop.externalId,
                    name: stop.name,
                    latitude: stop.latitude,
                    longitude: stop.longitude
                };
            }),
            journeys: this.toViews(feed, journeys, 40)
        };
    }

    public async getDepartureBoard(slug: string, serviceDate: string): Promise<DepartureBoardView | null>
    {
        const board = await this.getCityBoard(slug);

        if (!board)
        {
            return null;
        }

        return {
            ...board,
            serviceDate,
            journeys: board.journeys.filter((journey) => journey.serviceDate === serviceDate)
        };
    }

    public async getSeoIndex(): Promise<SeoIndexView>
    {
        const [feed, timetable] = await Promise.all([this.getFeed(), this.getTimetable()]);
        const cities = buildCityDirectory(feed, timetable.journeys);
        const routes = new Map<string, { originStopId: string; destinationStopId: string }>();
        const departures = new Map<string, { citySlug: string; serviceDate: string }>();

        for (const journey of timetable.journeys)
        {
            const origin = journey.calls[0];
            const destination = journey.calls[journey.calls.length - 1];

            if (origin && destination && origin.stopPointRef !== destination.stopPointRef)
            {
                const key = `${origin.stopPointRef}:${destination.stopPointRef}`;
                routes.set(key,
                {
                    originStopId: origin.stopPointRef,
                    destinationStopId: destination.stopPointRef
                });
            }

            for (const call of journey.calls)
            {
                const stop = feed.stops.find((candidate) => candidate.externalId === call.stopPointRef);
                const slug = citySlug(cityName(call.stopPointName ?? stop?.name ?? call.stopPointRef));
                const key = `${slug}:${journey.serviceDate}`;
                departures.set(key, { citySlug: slug, serviceDate: journey.serviceDate });
            }
        }

        return {
            cities: cities.map((city) => ({ slug: city.slug })),
            stops: feed.stops.map((stop) => ({ stopId: stop.externalId })),
            routes: [...routes.values()],
            departures: [...departures.values()],
            journeys: timetable.journeys.map((journey) => ({ journeyRef: journey.journeyRef }))
        };
    }

    public async getJourney(journeyRef: string): Promise<JourneyView | null>
    {
        const persistedJourney = await this.readPersistedJourney(journeyRef);

        if (persistedJourney)
        {
            const persistedFeed = await this.getFeed();
            const persistedView = buildJourneyView(
                persistedFeed,
                persistedJourney,
                this.matcher.match(persistedFeed, persistedJourney)
            );
            return this.attachPunctuality(persistedView);
        }

        const [feed, timetable] = await Promise.all([this.getFeed(), this.getTimetable()]);
        let journey = timetable.journeys.find((candidate) => candidate.journeyRef === journeyRef);

        if (!journey)
        {
            const fallback = await this.readFallbackTimetable();
            journey = fallback.journeys.find((candidate) => candidate.journeyRef === journeyRef);
        }

        if (!journey)
        {
            return null;
        }

        const view = buildJourneyView(feed, journey, this.matcher.match(feed, journey));
        return this.attachPunctuality(view);
    }

    public async getStopBoard(stopId: string): Promise<StopBoardView | null>
    {
        const [feed, timetable] = await Promise.all([this.getFeed(), this.getTimetable()]);
        const stop = feed.stops.find((candidate) => candidate.externalId.toLocaleLowerCase("fr") === stopId.toLocaleLowerCase("fr"));

        if (!stop)
        {
            return null;
        }

        const journeys = timetable.journeys.filter((journey) =>
        {
            return journey.calls.some((call) => call.stopPointRef === stop.externalId);
        });

        return {
            stopId: stop.externalId,
            name: stop.name,
            city: cityName(stop.name),
            latitude: stop.latitude,
            longitude: stop.longitude,
            journeys: this.toViews(feed, journeys, 40)
        };
    }

    public async getRouteBoard(originStopId: string, destinationStopId: string): Promise<RouteBoardView | null>
    {
        const [feed, timetable] = await Promise.all([this.getFeed(), this.getTimetable()]);
        const origin = feed.stops.find((stop) => stop.externalId.toLocaleLowerCase("fr") === originStopId.toLocaleLowerCase("fr"));
        const destination = feed.stops.find((stop) => stop.externalId.toLocaleLowerCase("fr") === destinationStopId.toLocaleLowerCase("fr"));

        if (!origin || !destination)
        {
            return null;
        }

        const journeys = timetable.journeys.filter((journey) =>
        {
            const originIndex = journey.calls.findIndex((call) => call.stopPointRef === origin.externalId);
            const destinationIndex = journey.calls.findIndex((call) => call.stopPointRef === destination.externalId);
            return originIndex >= 0 && destinationIndex > originIndex;
        });

        return {
            originStopId: origin.externalId,
            originName: origin.name,
            destinationStopId: destination.externalId,
            destinationName: destination.name,
            journeys: this.toViews(feed, journeys, 40)
        };
    }

    public async getFeaturedJourneys(limit = 4): Promise<JourneyView[]>
    {
        const [feed, timetable] = await Promise.all([this.getFeed(), this.getTimetable()]);
        const viable = timetable.journeys.filter((journey) => !journey.cancellation && journey.calls.length >= 2);
        return this.toViews(feed, viable, limit);
    }

    public async getSyncStatuses(): Promise<TransitSyncStatus[]>
    {
        const repository = this.getDatabaseRepository();

        if (!repository)
        {
            return [];
        }

        try
        {
            return await repository.latestSyncStatuses();
        }
        catch
        {
            return [];
        }
    }

    private toViews(feed: GtfsFeed, journeys: SiriJourney[], limit: number): JourneyView[]
    {
        const views: JourneyView[] = [];

        for (const journey of journeys)
        {
            const match = this.matcher.match(feed, journey);

            if (match.status !== "matched")
            {
                continue;
            }

            views.push(buildJourneyView(feed, journey, match));

            if (views.length >= limit)
            {
                break;
            }
        }

        return views;
    }

    private async getFeed(): Promise<GtfsFeed>
    {
        if (this.databaseFeedCache && this.databaseFeedCache.expiresAt > Date.now())
        {
            return this.databaseFeedCache.value;
        }

        const repository = this.getDatabaseRepository();

        if (repository)
        {
            try
            {
                const persistedFeed = await repository.loadFeed();

                if (persistedFeed)
                {
                    this.databaseFeedCache = {
                        value: persistedFeed,
                        expiresAt: Date.now() + databaseFeedLifetimeMilliseconds
                    };
                    return persistedFeed;
                }
            }
            catch
            {
            }
        }

        if (!this.gtfsPromise)
        {
            this.gtfsPromise = this.loadFeed().catch(async () =>
            {
                return this.gtfsImporter.import(this.fixtureGtfsPath());
            });
        }

        return this.gtfsPromise;
    }

    private async loadFeed(): Promise<GtfsFeed>
    {
        const configuredPath = process.env.GTFS_PATH;

        if (configuredPath)
        {
            return this.gtfsImporter.import(configuredPath);
        }

        const sharedDownload = join(tmpdir(), "blablacar-gtfs.zip");

        if (await exists(sharedDownload))
        {
            return this.gtfsImporter.import(sharedDownload);
        }

        const cacheDirectory = join(tmpdir(), "busminute");
        const cachePath = join(cacheDirectory, "blablacar-gtfs.zip");

        if (!(await exists(cachePath)))
        {
            await mkdir(cacheDirectory, { recursive: true });
            const response = await fetch(process.env.GTFS_URL ?? officialGtfsUrl,
            {
                redirect: "follow",
                signal: AbortSignal.timeout(15_000)
            });

            if (!response.ok)
            {
                throw new Error(`Téléchargement GTFS impossible : ${response.status}`);
            }

            await writeFile(cachePath, Buffer.from(await response.arrayBuffer()));
        }

        return this.gtfsImporter.import(cachePath);
    }

    private async getTimetable(): Promise<SiriEstimatedTimetable>
    {
        if (this.siriCache && this.siriCache.expiresAt > Date.now())
        {
            return this.siriCache.value;
        }

        let timetable: SiriEstimatedTimetable;

        const repository = this.getDatabaseRepository();

        if (repository)
        {
            try
            {
                const persistedTimetable = await repository.loadTimetable();

                if (persistedTimetable)
                {
                    this.siriCache = {
                        value: persistedTimetable,
                        expiresAt: Date.now() + siriLifetimeMilliseconds
                    };
                    return persistedTimetable;
                }
            }
            catch
            {
            }
        }

        try
        {
            timetable = await this.loadTimetable();
        }
        catch
        {
            timetable = await this.readFallbackTimetable();
        }

        this.siriCache = {
            value: timetable,
            expiresAt: Date.now() + siriLifetimeMilliseconds
        };
        return timetable;
    }

    private getDatabaseRepository(): PostgresTransitSnapshotRepository | null
    {
        const pool = getDatabasePool();

        if (!pool)
        {
            return null;
        }

        this.databaseRepository ??= new PostgresTransitSnapshotRepository(pool);
        return this.databaseRepository;
    }

    private async readPersistedJourney(journeyRef: string): Promise<SiriJourney | null>
    {
        const repository = this.getDatabaseRepository();

        if (!repository)
        {
            return null;
        }

        try
        {
            return await repository.loadJourney(journeyRef);
        }
        catch
        {
            return null;
        }
    }

    private async attachPunctuality(journey: JourneyView): Promise<JourneyView>
    {
        const repository = this.getDatabaseRepository();

        if (!repository)
        {
            return journey;
        }

        const key = `${journey.serviceNumber}:${journey.destinationStopId}`;
        const cached = this.punctualityCache.get(key);

        if (cached && cached.expiresAt > Date.now())
        {
            return { ...journey, punctuality: cached.value };
        }

        try
        {
            const punctuality = await repository.loadPunctuality(
                journey.serviceNumber,
                journey.destinationStopId
            );
            this.punctualityCache.set(key,
            {
                value: punctuality,
                expiresAt: Date.now() + punctualityLifetimeMilliseconds
            });
            return { ...journey, punctuality };
        }
        catch
        {
            return journey;
        }
    }

    private async loadTimetable(): Promise<SiriEstimatedTimetable>
    {
        const configuredPath = process.env.SIRI_PATH;

        if (configuredPath)
        {
            return this.siriParser.parse(JSON.parse(await readFile(configuredPath, "utf8")) as unknown);
        }

        const sharedDownload = join(tmpdir(), "blablacar-siri.json");

        if (process.env.NODE_ENV !== "production" && await exists(sharedDownload))
        {
            return this.siriParser.parse(JSON.parse(await readFile(sharedDownload, "utf8")) as unknown);
        }

        const response = await fetch(process.env.SIRI_URL ?? officialSiriUrl,
        {
            cache: "no-store",
            signal: AbortSignal.timeout(10_000)
        });

        if (!response.ok)
        {
            throw new Error(`Lecture SIRI impossible : ${response.status}`);
        }

        return this.siriParser.parse(await response.json() as unknown);
    }

    private async readFallbackTimetable(): Promise<SiriEstimatedTimetable>
    {
        const content = await readFile(this.fixtureSiriPath(), "utf8");
        return this.siriParser.parse(JSON.parse(content) as unknown);
    }

    private fixtureGtfsPath(): string
    {
        return join(process.cwd(), "tests", "fixtures", "gtfs-50819");
    }

    private fixtureSiriPath(): string
    {
        return join(process.cwd(), "tests", "fixtures", "siri-50819-2026-08-22.json");
    }
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

export const transitDataService = new TransitDataService();

function buildCityDirectory(feed: GtfsFeed, journeys: SiriJourney[]): CityDirectoryEntryView[]
{
    const entries = new Map<string, CityDirectoryEntryView>();

    for (const stop of feed.stops)
    {
        const name = cityName(stop.name);
        const slug = citySlug(name);
        const entry = entries.get(slug);

        if (entry)
        {
            entry.stopCount += 1;
        }
        else
        {
            entries.set(slug,
            {
                slug,
                name,
                stopCount: 1,
                liveJourneyCount: 0
            });
        }
    }

    for (const journey of journeys)
    {
        const seen = new Set<string>();

        for (const call of journey.calls)
        {
            const stop = feed.stops.find((candidate) => candidate.externalId === call.stopPointRef);
            const slug = citySlug(cityName(call.stopPointName ?? stop?.name ?? call.stopPointRef));

            if (seen.has(slug))
            {
                continue;
            }

            seen.add(slug);
            const entry = entries.get(slug);

            if (entry)
            {
                entry.liveJourneyCount += 1;
            }
        }
    }

    return [...entries.values()].sort((first, second) => first.name.localeCompare(second.name, "fr"));
}

function normalizeSearch(value: string): string
{
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("fr")
        .trim();
}

function placeSearchScore(place: PlaceSearchResultView, query: string): number
{
    const id = normalizeSearch(place.id);
    const label = normalizeSearch(place.label);

    if (id === query || label === query)
    {
        return 0;
    }

    if (label.startsWith(`${query} `) || label.startsWith(`${query}-`))
    {
        return 1;
    }

    if (label.split(/[\s-]+/).includes(query))
    {
        return 2;
    }

    return 3;
}

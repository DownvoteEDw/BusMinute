import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GtfsFeed, GtfsStop, SiriEstimatedTimetable, SiriJourney } from "../domain/models.js";
import { getDatabasePool } from "../db/database.js";
import
{
    PostgresTransitSnapshotRepository,
    type TransitSyncStatus
} from "../db/postgres-transit-snapshot-repository.js";
import { BlaBlaCarGtfsImporter } from "../providers/blablacar/gtfs/importer.js";
import { BlaBlaCarSiriParser } from "../providers/blablacar/siri/parser.js";
import { isServiceActive } from "../providers/blablacar/gtfs/service-calendar.js";
import { FlixBusDataSource } from "../providers/flixbus/data-source.js";
import { FlixBusRealtimeClient } from "../providers/flixbus/realtime-client.js";
import { AlsaDataSource } from "../providers/alsa/data-source.js";
import { AlsaRealtimeClient } from "../providers/alsa/realtime-client.js";
import { GtfsSiriTripMatcher } from "../services/trip-matcher.js";
import { enrichAlsaJourney as applyAlsaRealtime } from "./alsa-realtime.js";
import { enrichFlixBusJourney } from "./flixbus-realtime.js";
import
{
    buildJourneyView,
    cityName,
    citySlug,
    type CityBoardView,
    type CityDirectoryEntryView,
    type CityJourneyPageView,
    type DepartureBoardView,
    type JourneyView,
    type PlaceSearchResultView,
    type PunctualitySummaryView,
    type RouteBoardView,
    type SeoIndexView,
    type StopBoardOperatorView,
    type StopBoardView
} from "./journey-view.js";
import
{
    alsaOperator,
    blablacarBusOperator,
    flixBusOperator,
    parseScheduledJourneyRef,
    parseStopReference,
    publicStopId,
    type TransitOperator
} from "./operators.js";
import
{
    buildScheduledJourneyView,
    buildScheduledJourneyViews,
    scheduledServiceDates
} from "./scheduled-journeys.js";
import { distanceMeters, samePhysicalStation } from "./station-identity.js";
import { AsyncCache } from "./async-cache.js";
import { JourneyPublications, withPublicJourneyUrl } from "./journey-publications.js";
import { journeyLinks, type JourneyLinksView } from "./journey-links.js";
import { busServicePath, cityRoutePath } from "./journey-url.js";
import { isJourneyCompleted, isJourneyOutsideIndexingWindow } from "./seo.js";
import { liveBoardEventTime as boardEventTime } from "./live-board.js";
import { journeyDateInCity, journeyStopInCity, journeyTimeInCity } from "./station-schedule.js";
import { isSearchQueryWithinLimits } from "./search-query.js";
import { isPublicDepartureDate } from "./journey-date.js";
import { BoundedConcurrency } from "./bounded-concurrency.js";

const officialGtfsUrl = "https://drive.google.com/uc?export=download&id=1VXd01yQl2Mb67C9bkrx0P8sqNIL532_o";
const officialSiriUrl = "https://open-data.bus.blablacar.com/api/siri-lite/estimated-timetable";
const siriLifetimeMilliseconds = 45_000;
const liveBoardLifetimeMilliseconds = 30_000;
const databaseFeedLifetimeMilliseconds = 300_000;
const punctualityLifetimeMilliseconds = 600_000;
const scheduledJourneyLifetimeMilliseconds = 300_000;

interface OperatorFeed
{
    operator: TransitOperator;
    feed: GtfsFeed;
}

interface TimedValue<T>
{
    value: T;
    expiresAt: number;
}

export class TransitDataService
{
    private readonly allowProviderRequests: boolean;
    private readonly snapshotSource: TransitDataService | undefined;

    public constructor(options: { allowProviderRequests?: boolean; snapshotSource?: TransitDataService } = {})
    {
        this.allowProviderRequests = options.allowProviderRequests ?? true;
        this.snapshotSource = options.snapshotSource;
    }

    private readonly publications = new JourneyPublications();
    private readonly servicePages = new AsyncCache<{ example: JourneyView; journeys: JourneyView[] } | null>(30_000, 200);
    private readonly gtfsImporter = new BlaBlaCarGtfsImporter();
    private readonly siriParser = new BlaBlaCarSiriParser();
    private readonly matcher = new GtfsSiriTripMatcher();
    private readonly flixBusDataSource = new FlixBusDataSource();
    private readonly flixBusRealtimeClient = new FlixBusRealtimeClient();
    private readonly alsaDataSource = new AlsaDataSource();
    private readonly alsaRealtimeClient = new AlsaRealtimeClient();
    private gtfsPromise: Promise<GtfsFeed> | null = null;
    private flixBusGtfsPromise: Promise<GtfsFeed | null> | null = null;
    private alsaGtfsPromise: Promise<GtfsFeed | null> | null = null;
    private databaseFeedCache: TimedValue<GtfsFeed> | null = null;
    private flixBusDatabaseFeedCache: TimedValue<GtfsFeed> | null = null;
    private alsaDatabaseFeedCache: TimedValue<GtfsFeed> | null = null;
    private siriCache: TimedValue<SiriEstimatedTimetable> | null = null;
    private blablacarJourneyViews: { feed: GtfsFeed; timetable: SiriEstimatedTimetable; views: JourneyView[] } | null = null;
    private flixBusJourneyCache: TimedValue<JourneyView[]> | null = null;
    private alsaJourneyCache: TimedValue<JourneyView[]> | null = null;
    private readonly allJourneyViewsCache = new AsyncCache<JourneyView[]>(15_000);
    private readonly availableJourneyViewsCache = new AsyncCache<JourneyView[]>(30_000);
    private readonly cityDatedJourneyViewsCache = new AsyncCache<JourneyView[]>(15_000, 100);
    private readonly cityJourneyGenerationQueue = new BoundedConcurrency(4, 100);
    private readonly cityDirectoryCache = new AsyncCache<CityDirectoryEntryView[]>(15_000);
    private readonly popularLinksCache = new AsyncCache<JourneyLinksView>(60_000);
    private readonly cityBoardCache = new AsyncCache<CityBoardView | null>(15_000, 100);
    private readonly stopBoardCache = new AsyncCache<StopBoardView | null>(15_000, 100);
    private readonly journeyCache = new AsyncCache<JourneyView | null>(15_000, 200);
    private readonly liveBoardCache = new AsyncCache<JourneyView[]>(liveBoardLifetimeMilliseconds);
    private readonly feedRequests = new AsyncCache<GtfsFeed>(0);
    private readonly flixBusFeedRequests = new AsyncCache<GtfsFeed | null>(0);
    private readonly alsaFeedRequests = new AsyncCache<GtfsFeed | null>(0);
    private readonly timetableRequests = new AsyncCache<SiriEstimatedTimetable>(0);
    private databaseRepository: PostgresTransitSnapshotRepository | null = null;
    private flixBusDatabaseRepository: PostgresTransitSnapshotRepository | null = null;
    private alsaDatabaseRepository: PostgresTransitSnapshotRepository | null = null;
    private readonly punctualityCache = new Map<string, TimedValue<PunctualitySummaryView | null>>();

    public async search(query: string, limit = 12): Promise<JourneyView[]>
    {
        if (!isSearchQueryWithinLimits(query))
        {
            return [];
        }

        const normalized = normalizeSearch(query);

        if (normalized.length < 2)
        {
            return [];
        }

        const routeCandidates = routeQueryCandidates(normalized);
        const journeys = await this.getAllJourneyViews();
        return journeys
            .map((journey) =>
            {
                return {
                    journey,
                    score: journeyViewSearchScore(journey, normalized, routeCandidates)
                };
            })
            .filter((candidate) => Number.isFinite(candidate.score))
            .sort((first, second) =>
            {
                return first.score - second.score
                    || boardEventTime(first.journey) - boardEventTime(second.journey);
            })
            .slice(0, Math.max(0, Math.min(limit, 50)))
            .map((candidate) => candidate.journey);
    }

    public async searchPlaces(query: string, limit = 8): Promise<PlaceSearchResultView[]>
    {
        if (!isSearchQueryWithinLimits(query))
        {
            return [];
        }

        const normalized = normalizeSearch(query);

        if (normalized.length < 2)
        {
            return [];
        }

        const operatorFeeds = await this.getOperatorFeeds();
        const directory = buildCityDirectory(operatorFeeds, []);
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
        const stops = operatorFeeds.flatMap(({ feed, operator }) =>
        {
            return feed.stops.filter((stop) =>
            {
                return normalizeSearch(stop.externalId).includes(normalized)
                    || normalizeSearch(stop.name).includes(normalized);
            })
            .map((stop) =>
            {
                const id = publicStopId(operator, stop.externalId);
                return {
                    type: "stop" as const,
                    id,
                    label: stop.name,
                    detail: `${operator.name} · ${stop.code ?? stop.externalId}`,
                    href: `/gares/${encodeURIComponent(id)}`
                };
            });
        });

        return [...cities, ...stops]
            .sort((first, second) =>
            {
                return placeSearchScore(first, normalized) - placeSearchScore(second, normalized)
                    || Number(first.type === "stop") - Number(second.type === "stop")
                    || first.label.localeCompare(second.label, "fr");
            })
            .slice(0, Math.max(0, Math.min(limit, 50)));
    }

    public async getCityDirectory(): Promise<CityDirectoryEntryView[]>
    {
        return this.cityDirectoryCache.get("directory", () => this.loadCityDirectory());
    }

    public async hasCity(slug: string): Promise<boolean>
    {
        return (await this.getOperatorFeeds()).some(({ feed }) =>
        {
            return feed.stops.some((stop) => citySlug(cityName(stop.name)) === slug);
        });
    }

    public async hasStop(stopId: string): Promise<boolean>
    {
        const reference = parseStopReference(stopId);
        return (await this.getOperatorFeeds()).some(({ feed, operator }) =>
        {
            return operator.slug === reference.operatorSlug && feed.stops.some((stop) =>
            {
                return stop.externalId.toLocaleLowerCase("fr") === reference.externalId.toLocaleLowerCase("fr");
            });
        });
    }

    public async hasRoute(origin: string, destination: string): Promise<boolean>
    {
        if (origin !== destination && await this.hasCity(origin) && await this.hasCity(destination))
        {
            return true;
        }
        return parseStopReference(origin).operatorSlug === parseStopReference(destination).operatorSlug
            && await this.hasStop(origin) && await this.hasStop(destination);
    }

    public async getBusServiceIdentity(operator: string, service: string): Promise<{ operatorSlug: string; serviceNumber: string } | null>
    {
        if (![blablacarBusOperator.slug, flixBusOperator.slug, alsaOperator.slug].includes(operator) || service.length > 100)
        {
            return null;
        }
        const published = await this.publications.serviceExample(operator, service);
        if (published)
        {
            return { operatorSlug: published.operatorSlug, serviceNumber: published.serviceNumber };
        }
        const source = (await this.getOperatorFeeds()).find((entry) => entry.operator.slug === operator);
        if (!source)
        {
            return null;
        }
        const dates = scheduledServiceDates(source.feed);
        const exists = source.feed.trips.some((trip) =>
        {
            if (trip.serviceNumber !== service || trip.stopTimes.length === 0)
            {
                return false;
            }
            const calendar = source.feed.calendars.find((candidate) => candidate.externalId === trip.serviceExternalId);
            return calendar && dates.some((date) => isServiceActive(calendar, source.feed.calendarExceptions, date));
        });
        return exists ? { operatorSlug: operator, serviceNumber: service } : null;
    }

    private async loadCityDirectory(): Promise<CityDirectoryEntryView[]>
    {
        const [operatorFeeds, journeys] = await Promise.all([
            this.getOperatorFeeds(),
            this.getAllJourneyViews()
        ]);
        return buildCityDirectory(operatorFeeds, journeys);
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

    public async getPopularLinks(limit = 12): Promise<JourneyLinksView>
    {
        return this.popularLinksCache.get("popular", async () =>
        {
            const [cities, journeys] = await Promise.all([this.getFeaturedCities(6), this.getAllJourneyViews()]);
            return journeyLinks(journeys, cities.map((city) => city.slug), limit);
        });
    }

    public async getCityBoard(slug: string): Promise<CityBoardView | null>
    {
        return this.cityBoardCache.get(slug, () => this.loadCityBoard(slug));
    }

    private async loadCityBoard(slug: string): Promise<CityBoardView | null>
    {
        const [operatorFeeds, allJourneys] = await Promise.all([
            this.getOperatorFeeds(),
            this.getAllJourneyViews()
        ]);
        const stops = operatorFeeds.flatMap(({ feed, operator }) =>
        {
            return feed.stops
                .filter((stop) => citySlug(cityName(stop.name)) === slug)
                .map((stop) => ({ stop, operator }));
        });

        if (stops.length === 0)
        {
            return null;
        }

        const stopIds = new Set(stops.map(({ stop, operator }) => publicStopId(operator, stop.externalId)));
        const currentTime = Date.now();
        const journeys = allJourneys.filter((journey) =>
        {
            return journey.stops.some((stop) => stopIds.has(stop.stopId));
        }).sort((first, second) => compareJourneyViewsAtStops(first, second, stopIds));
        const rankedStops = groupCityStops(stops).map((group) =>
        {
            const members = [...group].sort((first, second) =>
            {
                return operatorRank(first.operator.slug) - operatorRank(second.operator.slug);
            });
            const representative = members[0];
            const activities = members.map(({ stop, operator }) =>
            {
                return stopUpcomingActivity(
                    allJourneys,
                    publicStopId(operator, stop.externalId),
                    currentTime
                );
            });
            const nextJourneyAt = activities.map((activity) => activity.nextJourneyAt)
                .filter((value): value is string => value !== null)
                .sort()[0] ?? null;

            if (!representative)
            {
                throw new Error("Groupe de gare vide");
            }

            return {
                stopId: publicStopId(representative.operator, representative.stop.externalId),
                name: representative.stop.name,
                operatorSlug: representative.operator.slug,
                operatorName: representative.operator.name,
                operatorSlugs: [...new Set(members.map(({ operator }) => operator.slug))],
                latitude: representative.stop.latitude,
                longitude: representative.stop.longitude,
                upcomingJourneyCount: activities.reduce((sum, activity) => sum + activity.count, 0),
                nextJourneyAt
            };
        }).sort((first, second) =>
        {
            return second.upcomingJourneyCount - first.upcomingJourneyCount
                || nextJourneyTime(first.nextJourneyAt) - nextJourneyTime(second.nextJourneyAt)
                || first.name.localeCompare(second.name, "fr");
        });

        return {
            slug,
            name: cityName(stops[0]?.stop.name ?? slug),
            stops: rankedStops,
            journeys
        };
    }

    public async getDepartureBoard(slug: string, serviceDate: string): Promise<DepartureBoardView | null>
    {
        if (!isPublicDepartureDate(serviceDate))
        {
            return null;
        }

        const board = await this.getCityBoard(slug);

        if (!board)
        {
            return null;
        }

        const journeys = await this.getJourneysForCityAndServiceDate(slug, serviceDate);
        return {
            ...board,
            serviceDate,
            journeys: journeys.map(withPublicJourneyUrl)
        };
    }

    public async getCityJourneyPage(
        slug: string,
        serviceDate: string,
        cursor: string | null = null,
        limit = 20
    ): Promise<CityJourneyPageView | null>
    {
        if (!isPublicDepartureDate(serviceDate))
        {
            return null;
        }

        const board = await this.getCityBoard(slug);

        if (!board)
        {
            return null;
        }

        const journeys = await this.getJourneysForCityAndServiceDate(slug, serviceDate);
        const page = paginateCityJourneys(journeys, slug, cursor, limit);
        const enriched = await this.enrichAlsaJourneys(page.journeys);
        return {
            ...page,
            journeys: await this.publications.publish(enriched)
        };
    }

    public async getSeoIndex(): Promise<SeoIndexView>
    {
        const [operatorFeeds, journeys] = await Promise.all([
            this.getOperatorFeeds(),
            this.getAvailableJourneyViews()
        ]);
        const cities = buildCityDirectory(operatorFeeds, journeys);
        const routes = new Map<string, { originStopId: string; destinationStopId: string }>();

        for (const journey of journeys)
        {
            const origin = journey.stops[0];
            const destination = journey.stops[journey.stops.length - 1];

            if (origin && destination && origin.stopId !== destination.stopId)
            {
                const key = `${origin.stopId}:${destination.stopId}`;
                routes.set(key,
                {
                    originStopId: origin.stopId,
                    destinationStopId: destination.stopId
                });
            }
        }

        return {
            cities: cities.map((city) => ({ slug: city.slug })),
            stops: operatorFeeds.flatMap(({ feed, operator }) =>
            {
                return feed.stops.map((stop) => ({ stopId: publicStopId(operator, stop.externalId) }));
            }),
            routes: [...routes.values()],
            services: (await this.publications.listServices()).map(busServicePath),
            cityRoutes: journeys.map((journey) => cityRoutePath(citySlug(journey.originCity), citySlug(journey.destinationCity)))
        };
    }

    public async getJourney(journeyRef: string): Promise<JourneyView | null>
    {
        return this.journeyCache.get(journeyRef, async () =>
        {
            const archived = await this.publications.findByReference(journeyRef);
            if (archived && (!this.allowProviderRequests || isJourneyOutsideIndexingWindow(archived)))
            {
                return archived;
            }
            try
            {
                const journey = await this.loadJourney(journeyRef);
                return journey ? (await this.publications.publish([journey]))[0] ?? null : archived;
            }
            catch (error)
            {
                if (archived)
                {
                    return archived;
                }
                throw error;
            }
        });
    }

    public async getPublicJourney(id: string): Promise<JourneyView | null>
    {
        if (!/^[a-f0-9]{20}$/.test(id))
        {
            return null;
        }
        let journey = await this.publications.findById(id);
        if (!journey)
        {
            journey = (await this.getAllJourneyViews()).find((candidate) => candidate.publicId === id) ?? null;
        }
        return journey && this.allowProviderRequests ? this.getJourney(journey.journeyRef) : journey;
    }

    public async getBusService(operator: string, service: string): Promise<{ example: JourneyView; journeys: JourneyView[] } | null>
    {
        if (![blablacarBusOperator.slug, flixBusOperator.slug, alsaOperator.slug].includes(operator) || service.length > 100)
        {
            return null;
        }
        return this.servicePages.get(`${operator}:${service}`, async () =>
        {
            const [feeds, current] = await Promise.all([this.getOperatorFeeds(), this.getAllJourneyViews()]);
            const realtime = current.filter((journey) => journey.operatorSlug === operator && journey.serviceNumber === service);
            const source = feeds.find((entry) => entry.operator.slug === operator);
            const scheduled = source ? buildScheduledJourneyViews(
                { ...source.feed, trips: source.feed.trips.filter((trip) => trip.serviceNumber === service) }, source.operator
            ) : [];
            const matchedTrips = new Set(realtime.map((journey) => `${journey.scheduledTripId}:${journey.serviceDate}`));
            const candidates = [...realtime, ...scheduled.filter((journey) => !matchedTrips.has(`${journey.scheduledTripId}:${journey.serviceDate}`))];
            const published = await this.publications.publish(candidates);
            const journeys = published.filter((journey) => !isJourneyCompleted(journey))
                .sort((a, b) => boardEventTime(a) - boardEventTime(b));
            const example = journeys[0] ?? published[0] ?? await this.publications.serviceExample(operator, service);
            return example ? { example, journeys } : null;
        });
    }

    public async getCityRouteBoard(origin: string, destination: string): Promise<{
        originCity: string; destinationCity: string; journeys: JourneyView[];
    } | null>
    {
        const [directory, journeys] = await Promise.all([this.getCityDirectory(), this.getAvailableJourneyViews()]);
        const from = directory.find((city) => city.slug === origin);
        const to = directory.find((city) => city.slug === destination);
        if (!from || !to || from.slug === to.slug)
        {
            return null;
        }
        const matching = journeys.filter((journey) =>
        {
            const start = journey.stops.findIndex((stop) => citySlug(stop.city) === origin);
            return start >= 0 && journey.stops.some((stop, index) => index > start && citySlug(stop.city) === destination);
        }).filter((journey) => !isJourneyCompleted(journey)).sort((a, b) => boardEventTime(a) - boardEventTime(b));
        return { originCity: from.name, destinationCity: to.name, journeys: matching };
    }

    private async loadJourney(journeyRef: string): Promise<JourneyView | null>
    {
        const scheduledOperator = [flixBusOperator, alsaOperator, blablacarBusOperator].find((operator) =>
        {
            return parseScheduledJourneyRef(journeyRef, operator) !== null;
        });
        const scheduledReference = scheduledOperator
            ? parseScheduledJourneyRef(journeyRef, scheduledOperator)
            : null;

        if (scheduledOperator && scheduledReference)
        {
            const feed = scheduledOperator.slug === flixBusOperator.slug
                ? await this.getFlixBusFeed()
                : scheduledOperator.slug === alsaOperator.slug
                    ? await this.getAlsaFeed()
                    : await this.getFeed();
            const trip = feed?.trips.find((candidate) => candidate.externalId === scheduledReference.tripId);
            const calendar = feed?.calendars.find((candidate) => candidate.externalId === trip?.serviceExternalId);

            if (!feed
                || !trip
                || !calendar
                || !isServiceActive(calendar, feed.calendarExceptions, scheduledReference.serviceDate))
            {
                return null;
            }

            const view = buildScheduledJourneyView(
                feed,
                trip,
                scheduledReference.serviceDate,
                scheduledOperator
            );

            if (!view)
            {
                return null;
            }

            if (scheduledOperator.slug === flixBusOperator.slug)
            {
                return this.enrichFlixBusJourney(view);
            }

            if (scheduledOperator.slug === alsaOperator.slug)
            {
                return this.enrichAlsaJourney(view);
            }

            const realtimeView = (await this.getAllJourneyViews()).find((journey) =>
            {
                return journey.operatorSlug === scheduledOperator.slug
                    && journey.serviceDate === scheduledReference.serviceDate
                    && journey.scheduledTripId === scheduledReference.tripId;
            });
            return realtimeView ? this.attachPunctuality(realtimeView) : view;
        }

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
        return this.stopBoardCache.get(stopId, () => this.loadStopBoard(stopId));
    }

    private async loadStopBoard(stopId: string): Promise<StopBoardView | null>
    {
        const reference = parseStopReference(stopId);
        const operatorFeeds = await this.getOperatorFeeds();
        const operatorFeed = operatorFeeds.find(({ operator }) =>
        {
            return operator.slug === reference.operatorSlug;
        });
        const stop = operatorFeed?.feed.stops.find((candidate) =>
        {
            return candidate.externalId.toLocaleLowerCase("fr") === reference.externalId.toLocaleLowerCase("fr");
        });

        if (!operatorFeed || !stop)
        {
            return null;
        }

        const publicId = publicStopId(operatorFeed.operator, stop.externalId);
        const operatorStops = stationOperatorStops(operatorFeeds, operatorFeed, stop);
        const stopIds = new Set(operatorStops.map((candidate) => candidate.stopId));
        const stationJourneys = (await this.getAllJourneyViews()).filter((journey) =>
        {
            return journey.stops.some((candidate) => stopIds.has(candidate.stopId));
        });
        const currentTime = Date.now();
        const flixBusJourneys = await this.enrichFlixBusJourneysAtStops(
            stationJourneys,
            operatorStops
                .filter((candidate) => candidate.operatorSlug === flixBusOperator.slug)
                .map((candidate) => candidate.stopId)
        );
        const journeys = (await this.enrichAlsaJourneys(flixBusJourneys)).filter((journey) =>
        {
            return isUpcomingAtStops(journey, stopIds, currentTime);
        }).sort((first, second) =>
        {
            return compareJourneyViewsAtStops(first, second, stopIds);
        });
        const limitedJourneys = operatorStops.flatMap((operator) =>
        {
            return journeys
                .filter((journey) => journey.operatorSlug === operator.operatorSlug)
                .slice(0, 40);
        }).sort((first, second) =>
        {
            return compareJourneyViewsAtStops(first, second, stopIds);
        });

        return {
            stopId: publicId,
            name: stop.name,
            city: cityName(stop.name),
            operatorSlug: operatorFeed.operator.slug,
            operatorName: operatorFeed.operator.name,
            realtimeAvailable: operatorFeed.operator.realtimeAvailable,
            latitude: stop.latitude,
            longitude: stop.longitude,
            operatorStops,
            journeys: limitedJourneys
        };
    }

    public async getRouteBoard(originStopId: string, destinationStopId: string): Promise<RouteBoardView | null>
    {
        const originReference = parseStopReference(originStopId);
        const destinationReference = parseStopReference(destinationStopId);

        if (originReference.operatorSlug !== destinationReference.operatorSlug)
        {
            return null;
        }

        const operatorFeed = (await this.getOperatorFeeds()).find(({ operator }) =>
        {
            return operator.slug === originReference.operatorSlug;
        });
        const origin = operatorFeed?.feed.stops.find((stop) =>
        {
            return stop.externalId.toLocaleLowerCase("fr") === originReference.externalId.toLocaleLowerCase("fr");
        });
        const destination = operatorFeed?.feed.stops.find((stop) =>
        {
            return stop.externalId.toLocaleLowerCase("fr") === destinationReference.externalId.toLocaleLowerCase("fr");
        });

        if (!operatorFeed || !origin || !destination)
        {
            return null;
        }

        const publicOriginId = publicStopId(operatorFeed.operator, origin.externalId);
        const publicDestinationId = publicStopId(operatorFeed.operator, destination.externalId);
        const matchingJourneys = (await this.getAllJourneyViews()).filter((journey) =>
        {
            const originIndex = journey.stops.findIndex((stop) => stop.stopId === publicOriginId);
            const destinationIndex = journey.stops.findIndex((stop) => stop.stopId === publicDestinationId);
            return originIndex >= 0 && destinationIndex > originIndex;
        }).sort((first, second) =>
        {
            return compareJourneyViewsAtStops(first, second, new Set([publicOriginId]));
        }).slice(0, 40);
        const journeys = await this.enrichAlsaJourneys(matchingJourneys);

        return {
            originStopId: publicOriginId,
            originName: origin.name,
            destinationStopId: publicDestinationId,
            destinationName: destination.name,
            journeys
        };
    }

    public async getFeaturedJourneys(limit = 4): Promise<JourneyView[]>
    {
        return this.getLiveBoard(limit);
    }

    public async getLiveBoard(limit = 8): Promise<JourneyView[]>
    {
        const normalizedLimit = Math.max(0, Math.floor(limit));

        if (normalizedLimit === 0)
        {
            return [];
        }

        return this.liveBoardCache.get(String(normalizedLimit), () => this.loadLiveBoard(normalizedLimit));
    }

    private async loadLiveBoard(limit: number): Promise<JourneyView[]>
    {
        const currentTime = Date.now();
        const allViews = (await this.getAllJourneyViews()).filter((journey) =>
        {
            return journey.stops.length >= 2
                && boardEventTime(journey) >= currentTime - 300_000;
        }).sort((first, second) =>
        {
            return boardEventTime(first) - boardEventTime(second)
                || boardStatusRank(first.status) - boardStatusRank(second.status)
                || first.serviceNumber.localeCompare(second.serviceNumber, "fr", { numeric: true });
        });
        const candidates = selectLiveBoard(allViews, Math.max(limit * 2, 12));
        const enriched = await Promise.all(candidates.map((journey) =>
        {
            return journey.operatorSlug === flixBusOperator.slug
                ? this.enrichFlixBusJourney(journey)
                : journey.operatorSlug === alsaOperator.slug
                    ? this.enrichAlsaJourney(journey)
                    : Promise.resolve(journey);
        }));
        const visible = enriched.filter((journey) =>
        {
            return boardEventTime(journey) >= Date.now() - 300_000;
        }).sort((first, second) =>
        {
            return boardEventTime(first) - boardEventTime(second)
                || boardStatusRank(first.status) - boardStatusRank(second.status)
                || first.serviceNumber.localeCompare(second.serviceNumber, "fr", { numeric: true });
        });
        return selectLiveBoard(visible, limit);
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

    private async getAllJourneyViews(): Promise<JourneyView[]>
    {
        if (this.snapshotSource)
        {
            return this.snapshotSource.getAllJourneyViews();
        }
        return this.allJourneyViewsCache.get("journeys", () => this.loadAllJourneyViews());
    }

    private async getAvailableJourneyViews(): Promise<JourneyView[]>
    {
        if (this.snapshotSource)
        {
            return this.snapshotSource.getAvailableJourneyViews();
        }
        return this.availableJourneyViewsCache.get("available", async () =>
        {
            const [current, feed] = await Promise.all([this.getAllJourneyViews(), this.getFeed()]);
            const matchedTrips = new Set(current.filter((journey) => journey.operatorSlug === blablacarBusOperator.slug)
                .map((journey) => `${journey.scheduledTripId}:${journey.serviceDate}`));
            const scheduled = buildScheduledJourneyViews(feed, blablacarBusOperator)
                .filter((journey) => !matchedTrips.has(`${journey.scheduledTripId}:${journey.serviceDate}`));
            return [...current, ...await this.publications.publish(scheduled)];
        });
    }

    private async loadAllJourneyViews(): Promise<JourneyView[]>
    {
        const [feed, timetable, flixBusJourneys, alsaJourneys] = await Promise.all([
            this.getFeed(),
            this.getTimetable(),
            this.getFlixBusJourneys(),
            this.getAlsaJourneys()
        ]);
        if (this.blablacarJourneyViews?.feed !== feed || this.blablacarJourneyViews.timetable !== timetable)
        {
            this.blablacarJourneyViews =
            {
                feed,
                timetable,
                views: !this.allowProviderRequests && timetable.journeys.length === 0
                    ? buildScheduledJourneyViews(feed, blablacarBusOperator)
                    : this.toViews(feed, timetable.journeys, timetable.journeys.length)
            };
        }

        return this.publications.publish([
            ...this.blablacarJourneyViews.views,
            ...flixBusJourneys,
            ...alsaJourneys
        ]);
    }

    private async getJourneysForCityAndServiceDate(slug: string, serviceDate: string): Promise<JourneyView[]>
    {
        return this.cityDatedJourneyViewsCache.get(`${slug}:${serviceDate}`, () => this.cityJourneyGenerationQueue.run(async () =>
        {
            const [operatorFeeds, currentJourneys] = await Promise.all([
                this.getOperatorFeeds(),
                this.getAllJourneyViews()
            ]);
            const currentForDate = currentJourneys.filter((journey) =>
            {
                return journeyStopInCity(journey, slug)
                    && journeyDateInCity(journey, slug) === serviceDate;
            });
            const currentTripKeys = new Set(currentForDate.flatMap((journey) =>
            {
                return journey.scheduledTripId
                    ? [scheduledTripKey(journey.operatorSlug, journey.scheduledTripId, journey.serviceDate)]
                    : [];
            }));
            const scheduledJourneys = operatorFeeds.flatMap(({ feed, operator }) =>
            {
                const cityStopIds = new Set(feed.stops.filter((stop) =>
                {
                    return citySlug(cityName(stop.name)) === slug;
                }).map((stop) => stop.externalId));
                const cityTrips = feed.trips.filter((trip) =>
                {
                    return trip.stopTimes.some((stopTime) => cityStopIds.has(stopTime.stopExternalId));
                });

                if (cityTrips.length === 0)
                {
                    return [];
                }

                return buildScheduledJourneyViews({ ...feed, trips: cityTrips }, operator, [serviceDate]);
            }).filter((journey) =>
            {
                return journeyDateInCity(journey, slug) === serviceDate
                    && (!journey.scheduledTripId
                        || !currentTripKeys.has(scheduledTripKey(
                            journey.operatorSlug,
                            journey.scheduledTripId,
                            journey.serviceDate
                        )));
            });
            return [...currentForDate, ...scheduledJourneys]
                .sort((first, second) => compareJourneyViewsInCity(first, second, slug));
        }));
    }

    private async getOperatorFeeds(): Promise<OperatorFeed[]>
    {
        const [blablacarFeed, flixBusFeed, alsaFeed] = await Promise.all([
            this.getFeed(),
            this.getFlixBusFeed(),
            this.getAlsaFeed()
        ]);
        const values: OperatorFeed[] = [
            {
                operator: blablacarBusOperator,
                feed: blablacarFeed
            }
        ];

        if (flixBusFeed)
        {
            values.push({ operator: flixBusOperator, feed: flixBusFeed });
        }

        if (alsaFeed)
        {
            values.push({ operator: alsaOperator, feed: alsaFeed });
        }

        return values;
    }

    private async getAlsaJourneys(): Promise<JourneyView[]>
    {
        if (this.alsaJourneyCache && this.alsaJourneyCache.expiresAt > Date.now())
        {
            return this.alsaJourneyCache.value;
        }

        const feed = await this.getAlsaFeed();

        if (!feed)
        {
            return [];
        }

        const now = new Date();
        const views = buildScheduledJourneyViews(
            feed,
            alsaOperator,
            scheduledServiceDates(feed, now, 3),
            now
        ).filter((journey) =>
        {
            return boardEventTime(journey) >= now.getTime() - 300_000;
        });
        this.alsaJourneyCache = {
            value: views,
            expiresAt: Date.now() + scheduledJourneyLifetimeMilliseconds
        };
        return views;
    }

    private async getAlsaFeed(): Promise<GtfsFeed | null>
    {
        if (this.snapshotSource)
        {
            return this.snapshotSource.getAlsaFeed();
        }
        return this.alsaFeedRequests.get("feed", () => this.loadAlsaFeed());
    }

    private async loadAlsaFeed(): Promise<GtfsFeed | null>
    {
        if (process.env.ALSA_ENABLED !== "true")
        {
            return null;
        }

        if (this.alsaDatabaseFeedCache && this.alsaDatabaseFeedCache.expiresAt > Date.now())
        {
            return this.alsaDatabaseFeedCache.value;
        }

        const repository = this.getAlsaDatabaseRepository();

        if (repository)
        {
            try
            {
                const persistedFeed = await repository.loadFeed();

                if (persistedFeed)
                {
                    this.alsaDatabaseFeedCache = {
                        value: persistedFeed,
                        expiresAt: Date.now() + databaseFeedLifetimeMilliseconds
                    };
                    return persistedFeed;
                }
            }
            catch
            {
            }

            if (process.env.NODE_ENV === "production")
            {
                return this.alsaDatabaseFeedCache?.value ?? null;
            }
        }

        if (!this.allowProviderRequests)
        {
            return this.alsaDatabaseFeedCache?.value ?? null;
        }

        if (!this.alsaGtfsPromise)
        {
            this.alsaGtfsPromise = this.alsaDataSource.loadGtfs(false).catch(() => null);
        }

        const feed = await this.alsaGtfsPromise;

        if (!feed)
        {
            this.alsaGtfsPromise = null;
        }

        return feed;
    }

    private async getFlixBusJourneys(): Promise<JourneyView[]>
    {
        if (this.flixBusJourneyCache && this.flixBusJourneyCache.expiresAt > Date.now())
        {
            return this.flixBusJourneyCache.value;
        }

        const feed = await this.getFlixBusFeed();

        if (!feed)
        {
            return [];
        }

        const now = new Date();
        const views = buildScheduledJourneyViews(
            feed,
            flixBusOperator,
            scheduledServiceDates(feed, now, 3),
            now
        ).filter((journey) =>
        {
            return boardEventTime(journey) >= now.getTime() - 300_000;
        });
        this.flixBusJourneyCache = {
            value: views,
            expiresAt: Date.now() + scheduledJourneyLifetimeMilliseconds
        };
        return views;
    }

    private async getFlixBusFeed(): Promise<GtfsFeed | null>
    {
        if (this.snapshotSource)
        {
            return this.snapshotSource.getFlixBusFeed();
        }
        return this.flixBusFeedRequests.get("feed", () => this.loadFlixBusFeed());
    }

    private async loadFlixBusFeed(): Promise<GtfsFeed | null>
    {
        if (process.env.FLIXBUS_GTFS_ENABLED === "false")
        {
            return null;
        }

        if (this.flixBusDatabaseFeedCache && this.flixBusDatabaseFeedCache.expiresAt > Date.now())
        {
            return this.flixBusDatabaseFeedCache.value;
        }

        const repository = this.getFlixBusDatabaseRepository();

        if (repository)
        {
            try
            {
                const persistedFeed = await repository.loadFeed();

                if (persistedFeed)
                {
                    this.flixBusDatabaseFeedCache = {
                        value: persistedFeed,
                        expiresAt: Date.now() + databaseFeedLifetimeMilliseconds
                    };
                    return persistedFeed;
                }
            }
            catch
            {
            }

            if (process.env.NODE_ENV === "production" && !process.env.FLIXBUS_GTFS_PATH)
            {
                return this.flixBusDatabaseFeedCache?.value ?? null;
            }
        }

        if (!this.allowProviderRequests && !process.env.FLIXBUS_GTFS_PATH)
        {
            return this.flixBusDatabaseFeedCache?.value ?? null;
        }

        if (!this.flixBusGtfsPromise)
        {
            this.flixBusGtfsPromise = this.flixBusDataSource.loadGtfs(false).catch(() => null);
        }

        const feed = await this.flixBusGtfsPromise;

        if (!feed)
        {
            this.flixBusGtfsPromise = null;
        }

        return feed;
    }

    private async enrichFlixBusJourneysAtStops(
        journeys: JourneyView[],
        stopIds: string[]
    ): Promise<JourneyView[]>
    {
        if (!this.allowProviderRequests || !this.flixBusRealtimeClient.isEnabled() || stopIds.length === 0)
        {
            return journeys;
        }

        const now = new Date();
        const from = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        const to = new Date(now.getTime() + 30 * 60 * 60 * 1000);

        try
        {
            const rideGroups = await Promise.all(stopIds.map((stopId) =>
            {
                return this.flixBusRealtimeClient.loadStationRides(
                    parseStopReference(stopId).externalId,
                    from,
                    to
                );
            }));
            const rides = [...new Map(rideGroups.flat().map((ride) => [ride.id, ride])).values()];
            return journeys.map((journey) =>
            {
                return journey.operatorSlug === flixBusOperator.slug
                    ? enrichFlixBusJourney(journey, rides, now)
                    : journey;
            });
        }
        catch
        {
            return journeys;
        }
    }

    private async enrichFlixBusJourney(journey: JourneyView): Promise<JourneyView>
    {
        if (!this.allowProviderRequests || !this.flixBusRealtimeClient.isEnabled())
        {
            return journey;
        }

        const now = new Date();
        const referenceStop = [...journey.stops].sort((first, second) =>
        {
            return Math.abs(boardStopTime(first) - now.getTime())
                - Math.abs(boardStopTime(second) - now.getTime());
        })[0];

        if (!referenceStop)
        {
            return journey;
        }

        const referenceTime = boardStopTime(referenceStop);
        const center = Number.isFinite(referenceTime) ? referenceTime : now.getTime();
        const from = new Date(center - 6 * 60 * 60 * 1000);
        const to = new Date(center + 6 * 60 * 60 * 1000);

        try
        {
            const rides = await this.flixBusRealtimeClient.loadStationRides(
                parseStopReference(referenceStop.stopId).externalId,
                from,
                to
            );
            return enrichFlixBusJourney(journey, rides, now);
        }
        catch
        {
            return journey;
        }
    }

    private async enrichAlsaJourneys(journeys: JourneyView[]): Promise<JourneyView[]>
    {
        if (!this.allowProviderRequests || !this.alsaRealtimeClient.isEnabled())
        {
            return journeys;
        }

        return Promise.all(journeys.map((journey) =>
        {
            return journey.operatorSlug === alsaOperator.slug
                ? this.enrichAlsaJourney(journey)
                : Promise.resolve(journey);
        }));
    }

    private async enrichAlsaJourney(journey: JourneyView): Promise<JourneyView>
    {
        if (!this.allowProviderRequests || !this.alsaRealtimeClient.isEnabled())
        {
            return journey;
        }

        const feed = await this.getAlsaFeed();
        const originView = journey.stops[0];
        const destinationView = journey.stops[journey.stops.length - 1];
        const originReference = originView ? parseStopReference(originView.stopId) : null;
        const destinationReference = destinationView ? parseStopReference(destinationView.stopId) : null;
        const origin = feed?.stops.find((stop) => stop.externalId === originReference?.externalId);
        const destination = feed?.stops.find((stop) => stop.externalId === destinationReference?.externalId);
        const departureAt = originView?.aimedDepartureAt;
        const arrivalAt = destinationView?.aimedArrivalAt;

        if (!feed
            || !originView
            || !destinationView
            || !originReference
            || !destinationReference
            || !departureAt
            || !arrivalAt)
        {
            return journey;
        }

        const defaultTimezone = feed.agencies[0]?.timezone ?? "Europe/Paris";

        try
        {
            const lookup = await this.alsaRealtimeClient.loadJourney(
            {
                cacheKey: journey.journeyRef,
                serviceNumber: journey.serviceNumber,
                serviceDate: journey.serviceDate,
                departureAt,
                arrivalAt,
                origin: {
                    name: originView.name,
                    city: originView.city,
                    countryCode: originReference.externalId.slice(0, 2),
                    timezone: origin?.timezone ?? defaultTimezone
                },
                destination: {
                    name: destinationView.name,
                    city: destinationView.city,
                    countryCode: destinationReference.externalId.slice(0, 2),
                    timezone: destination?.timezone ?? defaultTimezone
                }
            });
            return applyAlsaRealtime(journey, lookup);
        }
        catch
        {
            return journey;
        }
    }

    private async getFeed(): Promise<GtfsFeed>
    {
        if (this.snapshotSource)
        {
            return this.snapshotSource.getFeed();
        }
        return this.feedRequests.get("feed", () => this.loadCurrentFeed());
    }

    private async loadCurrentFeed(): Promise<GtfsFeed>
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

        if (!this.allowProviderRequests && !process.env.GTFS_PATH)
        {
            if (this.databaseFeedCache)
            {
                return this.databaseFeedCache.value;
            }
            throw new Error("Aucun horaire enregistré disponible");
        }

        if (!this.gtfsPromise)
        {
            this.gtfsPromise = this.loadFeed().catch(async (error: unknown) =>
            {
                this.gtfsPromise = null;
                if (!this.allowProviderRequests)
                {
                    throw error;
                }
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
        if (this.snapshotSource)
        {
            return this.snapshotSource.getTimetable();
        }
        return this.timetableRequests.get("timetable", () => this.loadCurrentTimetable());
    }

    private async loadCurrentTimetable(): Promise<SiriEstimatedTimetable>
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

        if (!this.allowProviderRequests && !process.env.SIRI_PATH)
        {
            return this.siriCache?.value ?? { journeys: [], responseTimestamp: new Date(), validUntil: null, version: null };
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

    private getFlixBusDatabaseRepository(): PostgresTransitSnapshotRepository | null
    {
        const pool = getDatabasePool();

        if (!pool)
        {
            return null;
        }

        this.flixBusDatabaseRepository ??= new PostgresTransitSnapshotRepository(pool, flixBusOperator.slug);
        return this.flixBusDatabaseRepository;
    }

    private getAlsaDatabaseRepository(): PostgresTransitSnapshotRepository | null
    {
        const pool = getDatabasePool();

        if (!pool)
        {
            return null;
        }

        this.alsaDatabaseRepository ??= new PostgresTransitSnapshotRepository(pool, alsaOperator.slug);
        return this.alsaDatabaseRepository;
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

const transitGlobal = globalThis as typeof globalThis &
{
    busminuteTransitDataService?: TransitDataService;
    busminutePageDataService?: TransitDataService;
};

export const transitPageDataService = transitGlobal.busminutePageDataService ??= new TransitDataService({ allowProviderRequests: false });
export const transitDataService = transitGlobal.busminuteTransitDataService ??= new TransitDataService({ snapshotSource: transitPageDataService });

function buildCityDirectory(operatorFeeds: OperatorFeed[], journeys: JourneyView[]): CityDirectoryEntryView[]
{
    const entries = new Map<string, CityDirectoryEntryView>();
    const stopsByCity = new Map<string, Array<{ stop: GtfsStop; operator: TransitOperator }>>();

    for (const { feed, operator } of operatorFeeds)
    {
        for (const stop of feed.stops)
        {
            const slug = citySlug(cityName(stop.name));
            const cityStops = stopsByCity.get(slug) ?? [];
            cityStops.push({ stop, operator });
            stopsByCity.set(slug, cityStops);
        }
    }

    for (const [slug, stops] of stopsByCity)
    {
        entries.set(slug,
        {
            slug,
            name: cityName(stops[0]?.stop.name ?? slug),
            stopCount: groupCityStops(stops).length,
            liveJourneyCount: 0
        });
    }

    for (const journey of journeys)
    {
        const seen = new Set<string>();

        for (const stop of journey.stops)
        {
            const slug = citySlug(stop.city);

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

function journeyViewSearchScore(
    journey: JourneyView,
    query: string,
    routeCandidates: Array<[string, string]>
): number
{
    const serviceNumber = normalizeSearch(journey.serviceNumber);
    const journeyRef = normalizeSearch(journey.journeyRef);

    if (serviceNumber === query || journeyRef === query)
    {
        return 0;
    }

    if (serviceNumber.includes(query) || journeyRef.includes(query))
    {
        return 5;
    }

    const routeMatch = findRouteMatch(journey, routeCandidates);

    if (routeMatch)
    {
        const startsAtOrigin = routeMatch.originIndex === 0 ? 0 : 4;
        const endsAtDestination = routeMatch.destinationIndex === journey.stops.length - 1 ? 0 : 4;
        const intermediateStops = routeMatch.destinationIndex - routeMatch.originIndex - 1;
        return 10 + startsAtOrigin + endsAtDestination + intermediateStops;
    }

    if (journey.stops.some((stop) => stopMatchesPlace(stop, query)))
    {
        return 50;
    }

    return Number.POSITIVE_INFINITY;
}

function findRouteMatch(
    journey: JourneyView,
    routeCandidates: Array<[string, string]>
): { originIndex: number; destinationIndex: number } | null
{
    for (const [origin, destination] of routeCandidates)
    {
        const originIndex = journey.stops.findIndex((stop) => stopMatchesPlace(stop, origin));

        if (originIndex < 0)
        {
            continue;
        }

        const relativeDestinationIndex = journey.stops
            .slice(originIndex + 1)
            .findIndex((stop) => stopMatchesPlace(stop, destination));

        if (relativeDestinationIndex >= 0)
        {
            return {
                originIndex,
                destinationIndex: originIndex + relativeDestinationIndex + 1
            };
        }
    }

    return null;
}

function routeQueryCandidates(query: string): Array<[string, string]>
{
    const explicit = query
        .split(/\s*(?:→|->)\s*|\s+-\s+|\s+vers\s+/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2);

    if (explicit.length === 2 && explicit[0] && explicit[1])
    {
        return [[explicit[0], explicit[1]]];
    }

    const words = query.split(/\s+/).filter((word) => word.length > 0);
    const candidates: Array<[string, string]> = [];

    for (let split = 1; split < words.length; split += 1)
    {
        const origin = words.slice(0, split).join(" ");
        const destination = words.slice(split).join(" ");

        if (origin.length >= 2 && destination.length >= 2)
        {
            candidates.push([origin, destination]);
        }
    }

    return candidates;
}

function stopMatchesPlace(stop: JourneyView["stops"][number], query: string): boolean
{
    return normalizeSearch(stop.stopId).includes(query)
        || normalizeSearch(stop.name).includes(query)
        || normalizeSearch(stop.city) === query;
}

function boardStatusRank(status: JourneyView["status"]): number
{
    const ranks: Record<JourneyView["status"], number> = {
        in_transit: 0,
        scheduled: 1,
        cancelled: 2,
        arrived: 3
    };
    return ranks[status];
}

export function selectLiveBoard(journeys: JourneyView[], limit: number): JourneyView[]
{
    if (limit <= 0)
    {
        return [];
    }

    const availableOperators = [blablacarBusOperator.slug, flixBusOperator.slug, alsaOperator.slug].filter((operatorSlug) =>
    {
        return journeys.some((journey) => journey.operatorSlug === operatorSlug);
    });
    const minimumPerOperator = availableOperators.length > 1 && limit >= availableOperators.length
        ? Math.min(2, Math.floor(limit / availableOperators.length))
        : 0;
    const selected: JourneyView[] = [];
    const selectedReferences = new Set<string>();

    for (const operatorSlug of availableOperators)
    {
        for (const journey of journeys.filter((candidate) => candidate.operatorSlug === operatorSlug).slice(0, minimumPerOperator))
        {
            selected.push(journey);
            selectedReferences.add(journey.journeyRef);
        }
    }

    for (const journey of journeys)
    {
        if (selected.length >= limit)
        {
            break;
        }

        if (!selectedReferences.has(journey.journeyRef))
        {
            selected.push(journey);
            selectedReferences.add(journey.journeyRef);
        }
    }

    return selected.sort((first, second) =>
    {
        return boardEventTime(first) - boardEventTime(second)
            || first.serviceNumber.localeCompare(second.serviceNumber, "fr", { numeric: true });
    });
}

function compareJourneyViewsAtStops(first: JourneyView, second: JourneyView, stopIds: Set<string>): number
{
    const firstStop = journeyBoardStop(first, stopIds);
    const secondStop = journeyBoardStop(second, stopIds);
    return boardStopRank(firstStop) - boardStopRank(secondStop)
        || boardStopTime(firstStop) - boardStopTime(secondStop)
        || first.serviceNumber.localeCompare(second.serviceNumber, "fr", { numeric: true });
}

function journeyBoardStop(journey: JourneyView, stopIds: Set<string>): JourneyView["stops"][number] | undefined
{
    const stops = journey.stops.filter((stop) => stopIds.has(stop.stopId));
    return stops.find((stop) => stop.phase !== "passed") ?? stops[stops.length - 1];
}

function boardStopRank(stop: JourneyView["stops"][number] | undefined): number
{
    const eventTime = boardStopTime(stop);
    const hasPassed = stop?.phase === "passed"
        || eventTime < Date.now() - 300_000;
    return hasPassed ? 1 : 0;
}

function boardStopTime(stop: JourneyView["stops"][number] | undefined): number
{
    const value = stop?.expectedDepartureAt
        ?? stop?.aimedDepartureAt
        ?? stop?.expectedArrivalAt
        ?? stop?.aimedArrivalAt
        ?? stop?.actualDepartureAt
        ?? stop?.actualArrivalAt;
    return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

interface CityJourneyCursor
{
    rank: number;
    time: number;
    journeyRef: string;
}

export function paginateCityJourneys(
    journeys: JourneyView[],
    slug: string,
    cursor: string | null,
    limit: number
): CityJourneyPageView
{
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
    const cursorValue = decodeCityJourneyCursor(cursor);
    let startIndex = 0;

    if (cursorValue)
    {
        const exactIndex = journeys.findIndex((journey) => journey.journeyRef === cursorValue.journeyRef);
        startIndex = exactIndex >= 0
            ? exactIndex + 1
            : journeys.findIndex((journey) => compareCityJourneyCursor(journey, slug, cursorValue) > 0);

        if (startIndex < 0)
        {
            startIndex = journeys.length;
        }
    }

    const selectedJourneys = journeys.slice(startIndex, startIndex + safeLimit);
    const hasMore = startIndex + selectedJourneys.length < journeys.length;
    const lastJourney = selectedJourneys[selectedJourneys.length - 1];
    return {
        journeys: selectedJourneys,
        nextCursor: hasMore && lastJourney ? encodeCityJourneyCursor(lastJourney, slug) : null,
        totalCount: journeys.length
    };
}

function compareJourneyViewsInCity(first: JourneyView, second: JourneyView, slug: string): number
{
    const firstKey = cityJourneyCursor(first, slug);
    const secondKey = cityJourneyCursor(second, slug);
    return firstKey.rank - secondKey.rank
        || firstKey.time - secondKey.time
        || firstKey.journeyRef.localeCompare(secondKey.journeyRef, "fr", { numeric: true });
}

function compareCityJourneyCursor(journey: JourneyView, slug: string, cursor: CityJourneyCursor): number
{
    const key = cityJourneyCursor(journey, slug);
    return key.rank - cursor.rank
        || key.time - cursor.time
        || key.journeyRef.localeCompare(cursor.journeyRef, "fr", { numeric: true });
}

function cityJourneyCursor(journey: JourneyView, slug: string): CityJourneyCursor
{
    const stop = journeyStopInCity(journey, slug);
    const time = journeyTimeInCity(journey, slug);
    return {
        rank: boardStopRank(stop),
        time: time ? new Date(time).getTime() : Number.MAX_SAFE_INTEGER,
        journeyRef: journey.journeyRef
    };
}

function encodeCityJourneyCursor(journey: JourneyView, slug: string): string
{
    return Buffer.from(JSON.stringify(cityJourneyCursor(journey, slug))).toString("base64url");
}

function decodeCityJourneyCursor(value: string | null): CityJourneyCursor | null
{
    if (!value || value.length > 500)
    {
        return null;
    }

    try
    {
        const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<CityJourneyCursor>;

        if (typeof parsed.rank !== "number"
            || typeof parsed.time !== "number"
            || typeof parsed.journeyRef !== "string")
        {
            return null;
        }

        return {
            rank: parsed.rank,
            time: parsed.time,
            journeyRef: parsed.journeyRef
        };
    }
    catch
    {
        return null;
    }
}

function scheduledTripKey(operatorSlug: string, tripId: string, serviceDate: string): string
{
    return `${operatorSlug}:${tripId}:${serviceDate}`;
}

function stopUpcomingActivity(
    journeys: JourneyView[],
    stopId: string,
    currentTime: number
): { count: number; nextJourneyAt: string | null }
{
    let count = 0;
    let nextTime = Number.MAX_SAFE_INTEGER;

    for (const journey of journeys)
    {
        if (journey.cancelled)
        {
            continue;
        }

        const stop = journey.stops.find((candidate) => candidate.stopId === stopId);
        const eventTime = boardStopTime(stop);

        if (!stop
            || stop.cancelled
            || stop.phase === "passed"
            || eventTime < currentTime - 300_000)
        {
            continue;
        }

        count += 1;
        nextTime = Math.min(nextTime, eventTime);
    }

    return {
        count,
        nextJourneyAt: nextTime === Number.MAX_SAFE_INTEGER ? null : new Date(nextTime).toISOString()
    };
}

function nextJourneyTime(value: string | null): number
{
    return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function groupCityStops(
    stops: Array<{ stop: GtfsStop; operator: TransitOperator }>
): Array<Array<{ stop: GtfsStop; operator: TransitOperator }>>
{
    const groups: Array<Array<{ stop: GtfsStop; operator: TransitOperator }>> = [];

    for (const candidate of stops)
    {
        const group = groups.find((members) =>
        {
            return members.some(({ stop, operator }) => samePhysicalStation(
                stop,
                candidate.stop,
                operator.slug,
                candidate.operator.slug
            ));
        });

        if (group)
        {
            group.push(candidate);
        }
        else
        {
            groups.push([candidate]);
        }
    }

    return groups;
}

function isUpcomingAtStops(journey: JourneyView, stopIds: Set<string>, currentTime: number): boolean
{
    const stop = journeyBoardStop(journey, stopIds);
    return Boolean(stop)
        && stop?.phase !== "passed"
        && boardStopTime(stop) >= currentTime - 300_000;
}

function stationOperatorStops(
    operatorFeeds: OperatorFeed[],
    currentOperatorFeed: OperatorFeed,
    currentStop: GtfsFeed["stops"][number]
): StopBoardOperatorView[]
{
    const matches: StopBoardOperatorView[] = [];

    for (const operatorFeed of operatorFeeds)
    {
        const candidate = operatorFeed.operator.slug === currentOperatorFeed.operator.slug
            ? currentStop
            : operatorFeed.feed.stops
                .filter((stop) => samePhysicalStation(
                    currentStop,
                    stop,
                    currentOperatorFeed.operator.slug,
                    operatorFeed.operator.slug
                ))
                .map((stop) =>
                {
                    return {
                        stop,
                        distance: distanceMeters(currentStop, stop)
                    };
                })
                .sort((first, second) => first.distance - second.distance)[0]?.stop;

        if (!candidate)
        {
            continue;
        }

        matches.push(
        {
            operatorSlug: operatorFeed.operator.slug,
            operatorName: operatorFeed.operator.name,
            realtimeAvailable: operatorFeed.operator.realtimeAvailable,
            stopId: publicStopId(operatorFeed.operator, candidate.externalId),
            stopName: candidate.name
        });
    }

    return matches.sort((first, second) => operatorRank(first.operatorSlug) - operatorRank(second.operatorSlug));
}

function operatorRank(operatorSlug: string): number
{
    if (operatorSlug === blablacarBusOperator.slug)
    {
        return 0;
    }

    if (operatorSlug === flixBusOperator.slug)
    {
        return 1;
    }

    if (operatorSlug === alsaOperator.slug)
    {
        return 2;
    }

    return 3;
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

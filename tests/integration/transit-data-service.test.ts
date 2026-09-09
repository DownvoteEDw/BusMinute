import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransitDataService } from "../../src/application/transit-data-service.js";
import { GtfsSiriTripMatcher } from "../../src/services/trip-matcher.js";

const gtfsPath = fileURLToPath(new URL("../fixtures/gtfs-50819", import.meta.url));
const siriPath = fileURLToPath(new URL("../fixtures/siri-50819-2026-08-22.json", import.meta.url));
const flixBusGtfsPath = fileURLToPath(new URL("../fixtures/gtfs-flixbus", import.meta.url));
let previousGtfsPath: string | undefined;
let previousSiriPath: string | undefined;
let previousFlixBusEnabled: string | undefined;
let previousFlixBusGtfsPath: string | undefined;
let previousFlixBusRealtimeEnabled: string | undefined;

describe("TransitDataService", () =>
{
    beforeEach(() =>
    {
        previousGtfsPath = process.env.GTFS_PATH;
        previousSiriPath = process.env.SIRI_PATH;
        previousFlixBusEnabled = process.env.FLIXBUS_GTFS_ENABLED;
        previousFlixBusGtfsPath = process.env.FLIXBUS_GTFS_PATH;
        previousFlixBusRealtimeEnabled = process.env.FLIXBUS_REALTIME_ENABLED;
        process.env.GTFS_PATH = gtfsPath;
        process.env.SIRI_PATH = siriPath;
        process.env.FLIXBUS_GTFS_ENABLED = "false";
        process.env.FLIXBUS_REALTIME_ENABLED = "false";
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
        vi.useRealTimers();
        restoreEnvironment("GTFS_PATH", previousGtfsPath);
        restoreEnvironment("SIRI_PATH", previousSiriPath);
        restoreEnvironment("FLIXBUS_GTFS_ENABLED", previousFlixBusEnabled);
        restoreEnvironment("FLIXBUS_GTFS_PATH", previousFlixBusGtfsPath);
        restoreEnvironment("FLIXBUS_REALTIME_ENABLED", previousFlixBusRealtimeEnabled);
    });

    it("partage les calculs entre visiteurs et les renouvelle quand le flux change", async () =>
    {
        vi.useFakeTimers();
        const match = vi.spyOn(GtfsSiriTripMatcher.prototype, "match");
        const service = new TransitDataService();
        await Promise.all(
        [
            service.getFeaturedCities(),
            service.getLiveBoard(),
            service.getStopBoard("XPB"),
            service.search("paris")
        ]);
        expect(match).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(16_000);
        await service.search("paris");
        expect(match).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(30_000);
        await service.search("paris");
        expect(match).toHaveBeenCalledTimes(2);
    });

    it("alimente recherche, suivi, gare et liaison avec les données normalisées", async () =>
    {
        const service = new TransitDataService();
        const searchResults = await service.search("50819");
        const journey = await service.getJourney("50819:2026-08-22");
        const stop = await service.getStopBoard("XPB");
        const route = await service.getRouteBoard("XPB", "XTO");
        const city = await service.getCityBoard("paris");
        const departure = await service.getDepartureBoard("paris", "2026-08-22");
        const page = await service.getCityJourneyPage("paris", "2026-08-22", null, 20);

        expect(searchResults).toHaveLength(1);
        expect(journey?.scheduledTripId).toBe("7672428505");
        expect(journey?.status).toBe("arrived");
        expect(journey?.delaySeconds).toBe(-544);
        expect(journey?.stops.every((stop) => stop.location && Number.isFinite(stop.location.latitude))).toBe(true);
        expect(journey?.vehiclePositions).toEqual([]);
        expect(stop?.journeys).toHaveLength(0);
        expect(stop?.operatorStops).toEqual(
        [
            {
                operatorSlug: "blablacar-bus",
                operatorName: "BlaBlaCar Bus",
                realtimeAvailable: true,
                stopId: "XPB",
                stopName: "Paris - Bercy-Seine Bus Station"
            }
        ]);
        expect(route?.journeys[0]?.journeyRef).toBe("50819:2026-08-22");
        expect(city?.stops[0]?.stopId).toBe("XPB");
        expect(city?.stops[0]?.upcomingJourneyCount).toBe(0);
        expect(city?.stops[0]?.nextJourneyAt).toBeNull();
        expect(city?.journeys[0]?.journeyRef).toBe("50819:2026-08-22");
        expect(departure?.journeys[0]?.journeyRef).toBe("50819:2026-08-22");
        expect(page?.journeys[0]?.journeyRef).toBe("50819:2026-08-22");
        expect(page?.totalCount).toBe(1);
    });

    it("rend les villes et gares découvrables sans connaître un numéro de bus", async () =>
    {
        const service = new TransitDataService();
        const places = await service.searchPlaces("orleans");
        const parisPlaces = await service.searchPlaces("paris");
        const directory = await service.getCityDirectory();

        expect(places).toContainEqual(
        {
            type: "city",
            id: "orleans",
            label: "Orléans",
            detail: "1 gare",
            href: "/ville/orleans"
        });
        expect(places.some((place) => place.id === "XOS" && place.type === "stop")).toBe(true);
        expect(parisPlaces[0]?.href).toBe("/ville/paris");
        expect(directory.map((city) => city.slug)).toEqual(["orleans", "paris", "tours"]);
    });

    it("construit l’index SEO à partir des données GTFS et SIRI", async () =>
    {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-22T12:00:00Z"));
        const service = new TransitDataService();
        const index = await service.getSeoIndex();

        expect(index.cities).toContainEqual({ slug: "paris" });
        expect(index.stops).toContainEqual({ stopId: "XPB" });
        expect(index.routes).toContainEqual({ originStopId: "XPB", destinationStopId: "XTO" });
        expect(index.departures).toContainEqual({ citySlug: "paris", serviceDate: "2026-08-22" });
        expect(index.journeys).toContainEqual(expect.objectContaining({ journeyRef: "50819:2026-08-22", publicPath: expect.stringMatching(/^\/suivi\/blablacar-bus\/50819\/2026-08-22-[a-f0-9]{20}$/) }));
        expect(index.services).toContain("/bus/blablacar-bus/50819");
    });

    it("retire les circulations expirées du sitemap et conserve leur page permanente", async () =>
    {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
        const service = new TransitDataService();
        const index = await service.getSeoIndex();
        expect(index.journeys.some((journey) => journey.journeyRef === "50819:2026-08-22")).toBe(false);
        expect(index.services).toContain("/bus/blablacar-bus/50819");
        const archived = await service.getJourney("50819:2026-08-22");
        expect(archived?.publicId).toMatch(/^[a-f0-9]{20}$/);
        expect(await service.getPublicJourney(archived!.publicId!)).toEqual(archived);
    });

    it("sépare les prochains départs du service permanent et retrouve un départ publié", async () =>
    {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-08T00:00:00Z"));
        const service = new TransitDataService();
        const board = await service.getBusService("blablacar-bus", "50819");
        expect(board?.journeys.map((journey) => journey.serviceDate)).toEqual(["2026-09-08", "2026-09-09", "2026-09-10"]);
        const first = board!.journeys[0]!;
        expect((await service.getPublicJourney(first.publicId!))?.journeyRef).toBe(first.journeyRef);
        expect(await service.getBusService("unknown", "50819")).toBeNull();
        expect(await service.getPublicJourney("../../invalid")).toBeNull();
        const route = await service.getCityRouteBoard("paris", "tours");
        expect(route?.journeys.map((journey) => journey.publicPath)).toContain(first.publicPath);
        vi.setSystemTime(new Date("2028-01-01T12:00:00Z"));
        const endedService = await service.getBusService("blablacar-bus", "50819");
        expect(endedService?.journeys).toEqual([]);
        expect(endedService?.example.serviceNumber).toBe("50819");
    });

    it("trouve un trajet par origine et destination dans les deux sens", async () =>
    {
        const service = new TransitDataService();
        const direct = await service.search("Paris Tours");
        const explicit = await service.search("Paris vers Tours");
        const reverse = await service.search("Tours Paris");

        expect(direct[0]?.journeyRef).toBe("50819:2026-08-22");
        expect(explicit[0]?.journeyRef).toBe("50819:2026-08-22");
        expect(reverse).toHaveLength(0);
    });

    it("alimente le panneau temps réel", async () =>
    {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-22T12:49:00.000Z"));
        const service = new TransitDataService();
        const board = await service.getLiveBoard(6);

        expect(board).toHaveLength(1);
        expect(board[0]?.journeyRef).toBe("50819:2026-08-22");
    });

    it("conserve les horaires FlixBus quand le temps réel n’est pas disponible", async () =>
    {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-05T21:00:00.000Z"));
        process.env.FLIXBUS_GTFS_ENABLED = "true";
        process.env.FLIXBUS_GTFS_PATH = flixBusGtfsPath;
        const service = new TransitDataService();
        const searchResults = await service.search("1606", 20);
        const journey = searchResults.find((candidate) => candidate.operatorSlug === "flixbus");

        expect(journey).toBeDefined();
        expect(journey?.serviceNumber).toBe("1606");
        expect(journey?.operatorName).toBe("FlixBus");
        expect(journey?.realtimeAvailable).toBe(true);
        expect(journey?.realtimeObserved).toBe(false);
        expect(journey?.journeyRef).toContain("flixbus:1606-18-0850082026-M#FR-00:");

        if (!journey)
        {
            return;
        }

        const details = await service.getJourney(journey.journeyRef);
        const stop = await service.getStopBoard("flixbus:00308c34-1111-4444-8888-111111111111");
        const sharedStation = await service.getStopBoard("XPB");
        const city = await service.getCityBoard("lyon");
        const paris = await service.getCityBoard("paris");

        expect(details?.scheduledTripId).toBe("1606-18-0850082026-M#FR-00");
        expect(details?.matchMethod).toBe("GTFS_SCHEDULE");
        expect(stop?.operatorName).toBe("FlixBus");
        expect(stop?.journeys.some((candidate) => candidate.journeyRef === journey.journeyRef)).toBe(false);
        expect(stop?.journeys.every((candidate) =>
        {
            return candidate.stops.find((candidateStop) =>
            {
                return candidateStop.stopId === "flixbus:00308c34-1111-4444-8888-111111111111";
            })?.phase !== "passed";
        })).toBe(true);
        expect(sharedStation?.operatorStops.map((candidate) => candidate.operatorSlug)).toEqual(
        [
            "blablacar-bus",
            "flixbus"
        ]);
        expect(sharedStation?.journeys.every((candidate) =>
        {
            const stationStopIds = new Set(sharedStation.operatorStops.map((operator) => operator.stopId));
            return candidate.stops.find((candidateStop) => stationStopIds.has(candidateStop.stopId))?.phase !== "passed";
        })).toBe(true);
        expect(city?.stops.some((candidate) => candidate.operatorSlug === "flixbus")).toBe(true);
        expect(paris?.stops.filter((candidate) => candidate.name.includes("Bercy"))).toHaveLength(1);
        expect(paris?.stops.find((candidate) => candidate.name.includes("Bercy"))?.operatorSlugs).toEqual(
        [
            "blablacar-bus",
            "flixbus"
        ]);
        expect(searchResults.some((candidate) => candidate.serviceNumber === "FLX20")).toBe(false);
    });

    it("affiche les horaires prévus des deux opérateurs pour le lendemain", async () =>
    {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-05T18:00:00.000Z"));
        process.env.FLIXBUS_GTFS_ENABLED = "true";
        process.env.FLIXBUS_GTFS_PATH = flixBusGtfsPath;
        const service = new TransitDataService();
        const page = await service.getCityJourneyPage("paris", "2026-09-06", null, 20);
        const operators = new Set(page?.journeys.map((journey) => journey.operatorSlug));
        const blablacarJourney = page?.journeys.find((journey) => journey.operatorSlug === "blablacar-bus");

        expect(operators).toEqual(new Set(["blablacar-bus", "flixbus"]));
        expect(page?.totalCount).toBeGreaterThanOrEqual(2);
        expect(blablacarJourney?.journeyRef).toContain("blablacar-bus:");

        if (blablacarJourney)
        {
            const details = await service.getJourney(blablacarJourney.journeyRef);
            expect(details?.operatorSlug).toBe("blablacar-bus");
            expect(details?.serviceDate).toBe("2026-09-06");
        }
    });
});

function restoreEnvironment(name: string, value: string | undefined): void
{
    if (value === undefined)
    {
        delete process.env[name];
        return;
    }

    process.env[name] = value;
}

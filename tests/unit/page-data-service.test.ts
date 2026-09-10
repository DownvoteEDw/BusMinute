import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransitDataService } from "../../src/application/transit-data-service.js";
import { JourneyPublications } from "../../src/application/journey-publications.js";
import { FlixBusRealtimeClient } from "../../src/providers/flixbus/realtime-client.js";
import { AlsaRealtimeClient } from "../../src/providers/alsa/realtime-client.js";

afterEach(() =>
{
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("données du rendu serveur", () =>
{
    it("vérifie les URL avec le catalogue enregistré sans charger les départs", async () =>
    {
        vi.stubEnv("DATABASE_URL", "");
        vi.stubEnv("POSTGRES_HOST", "");
        vi.stubEnv("GTFS_PATH", resolve("tests/fixtures/gtfs-50819"));
        vi.stubEnv("FLIXBUS_GTFS_PATH", resolve("tests/fixtures/gtfs-flixbus"));
        vi.stubEnv("FLIXBUS_GTFS_ENABLED", "true");
        vi.stubEnv("ALSA_ENABLED", "false");
        const network = vi.fn();
        vi.stubGlobal("fetch", network);
        const service = new TransitDataService({ allowProviderRequests: false });
        const departures = vi.spyOn(service as unknown as { getAllJourneyViews(): Promise<unknown[]> }, "getAllJourneyViews")
            .mockImplementation(() => new Promise(() => {}));
        vi.spyOn(JourneyPublications.prototype, "serviceExample").mockResolvedValue(null);
        expect(await service.hasCity("paris")).toBe(true);
        expect(await service.hasCity("inconnue")).toBe(false);
        expect(await service.hasStop("XPB")).toBe(true);
        expect(await service.hasStop("inconnue")).toBe(false);
        expect(await service.hasRoute("paris", "tours")).toBe(true);
        expect(await service.hasRoute("XPB", "XTO")).toBe(true);
        expect(await service.hasRoute("paris", "inconnue")).toBe(false);
        expect(await service.getBusServiceIdentity("flixbus", "9901")).toEqual({ operatorSlug: "flixbus", serviceNumber: "9901" });
        expect(await service.getBusServiceIdentity("flixbus", "inconnu")).toBeNull();
        expect(departures).not.toHaveBeenCalled();
        expect(network).not.toHaveBeenCalled();
    });

    it("rend les horaires enregistrés sans appeler les opérateurs même lorsque le temps réel est activé", async () =>
    {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-02T07:00:00Z"));
        vi.stubEnv("DATABASE_URL", "");
        vi.stubEnv("POSTGRES_HOST", "");
        vi.stubEnv("GTFS_PATH", resolve("tests/fixtures/gtfs-50819"));
        vi.stubEnv("SIRI_PATH", "");
        vi.stubEnv("FLIXBUS_GTFS_PATH", resolve("tests/fixtures/gtfs-flixbus"));
        vi.stubEnv("FLIXBUS_GTFS_ENABLED", "true");
        vi.stubEnv("FLIXBUS_REALTIME_ENABLED", "true");
        vi.stubEnv("ALSA_ENABLED", "true");
        vi.stubEnv("ALSA_REALTIME_ENABLED", "true");
        const network = vi.fn(() => new Promise<Response>(() => {}));
        vi.stubGlobal("fetch", network);
        const flix = vi.spyOn(FlixBusRealtimeClient.prototype, "loadStationRides");
        const alsa = vi.spyOn(AlsaRealtimeClient.prototype, "loadJourney");
        const service = new TransitDataService({ allowProviderRequests: false });
        const [search, board, station, city] = await Promise.all([
            service.search("9901"), service.getLiveBoard(7), service.getStopBoard("XPB"), service.getCityBoard("paris")
        ]);
        const journey = await service.getJourney(search[0]!.journeyRef);
        expect(journey?.serviceNumber).toBe("9901");
        expect(journey?.realtimeObserved).toBe(false);
        expect(journey?.delaySeconds).toBeNull();
        expect(board.length).toBeGreaterThan(0);
        expect(station).not.toBeNull();
        expect(city).not.toBeNull();
        expect((await service.search("50819")).length).toBeGreaterThan(0);
        const api = new TransitDataService({ snapshotSource: service });
        expect((await api.search("9901"))[0]).toBe(search[0]);
        expect(await service.getPublicJourney(search[0]!.publicId!)).not.toBeNull();
        expect(network).not.toHaveBeenCalled();
        expect(flix).not.toHaveBeenCalled();
        expect(alsa).not.toHaveBeenCalled();
        const observed = { ...journey!, realtimeObserved: true, delaySeconds: 600 };
        vi.spyOn(JourneyPublications.prototype, "findByReference").mockResolvedValue(observed);
        const page = new TransitDataService({ allowProviderRequests: false });
        expect(await page.getJourney(observed.journeyRef)).toBe(observed);
    });

    it("ne remplace pas des horaires absents par un téléchargement ou des données de démonstration", async () =>
    {
        vi.stubEnv("DATABASE_URL", "");
        vi.stubEnv("POSTGRES_HOST", "");
        vi.stubEnv("GTFS_PATH", "");
        vi.stubEnv("SIRI_PATH", "");
        vi.stubEnv("ALSA_ENABLED", "false");
        vi.stubEnv("FLIXBUS_GTFS_ENABLED", "false");
        const network = vi.fn();
        vi.stubGlobal("fetch", network);
        const service = new TransitDataService({ allowProviderRequests: false });
        await expect(service.getCityDirectory()).rejects.toThrow("Aucun horaire enregistré");
        expect(network).not.toHaveBeenCalled();
    });
});

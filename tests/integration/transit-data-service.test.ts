import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TransitDataService } from "../../src/application/transit-data-service.js";

const gtfsPath = fileURLToPath(new URL("../fixtures/gtfs-50819", import.meta.url));
const siriPath = fileURLToPath(new URL("../fixtures/siri-50819-2026-08-22.json", import.meta.url));
let previousGtfsPath: string | undefined;
let previousSiriPath: string | undefined;

describe("TransitDataService", () =>
{
    beforeEach(() =>
    {
        previousGtfsPath = process.env.GTFS_PATH;
        previousSiriPath = process.env.SIRI_PATH;
        process.env.GTFS_PATH = gtfsPath;
        process.env.SIRI_PATH = siriPath;
    });

    afterEach(() =>
    {
        restoreEnvironment("GTFS_PATH", previousGtfsPath);
        restoreEnvironment("SIRI_PATH", previousSiriPath);
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

        expect(searchResults).toHaveLength(1);
        expect(journey?.scheduledTripId).toBe("7672428505");
        expect(journey?.status).toBe("arrived");
        expect(journey?.delaySeconds).toBe(-544);
        expect(stop?.journeys[0]?.journeyRef).toBe("50819:2026-08-22");
        expect(route?.journeys[0]?.journeyRef).toBe("50819:2026-08-22");
        expect(city?.stops[0]?.stopId).toBe("XPB");
        expect(city?.stops[0]?.upcomingJourneyCount).toBe(0);
        expect(city?.stops[0]?.nextJourneyAt).toBeNull();
        expect(city?.journeys[0]?.journeyRef).toBe("50819:2026-08-22");
        expect(departure?.journeys[0]?.journeyRef).toBe("50819:2026-08-22");
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
        const service = new TransitDataService();
        const index = await service.getSeoIndex();

        expect(index.cities).toContainEqual({ slug: "paris" });
        expect(index.stops).toContainEqual({ stopId: "XPB" });
        expect(index.routes).toContainEqual({ originStopId: "XPB", destinationStopId: "XTO" });
        expect(index.departures).toContainEqual({ citySlug: "paris", serviceDate: "2026-08-22" });
        expect(index.journeys).toContainEqual({ journeyRef: "50819:2026-08-22" });
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
        const service = new TransitDataService();
        const board = await service.getLiveBoard(6);

        expect(board).toHaveLength(1);
        expect(board[0]?.journeyRef).toBe("50819:2026-08-22");
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

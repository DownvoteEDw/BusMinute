import { describe, expect, it } from "vitest";
import type { JourneyView } from "../../src/application/journey-view.js";
import { journeyLinks } from "../../src/application/journey-links.js";

const now = new Date("2026-09-06T07:00:00Z");

describe("liens vers les pages permanentes", () =>
{
    it("relie une ville à ses lignes et à ses destinations en aval", () =>
    {
        const links = journeyLinks([
            journey("51063", ["Paris", "Orléans", "Tours"]),
            journey("51063", ["Paris", "Orléans", "Tours"], "51063-b"),
            journey("8500", ["Bordeaux", "Paris", "Lyon"])
        ], ["paris"], 10, now);

        expect(links.services.map((service) => [service.path, service.journeyCount])).toEqual([
            ["/bus/blablacar-bus/51063", 2],
            ["/bus/blablacar-bus/8500", 1]
        ]);
        expect(links.routes.map((route) => [route.path, route.journeyCount])).toEqual([
            ["/trajets/paris/orleans", 2],
            ["/trajets/paris/tours", 2],
            ["/trajets/paris/lyon", 1]
        ]);
        expect(links.routes.some((route) => route.path.includes("bordeaux"))).toBe(false);
    });

    it("ignore les circulations terminées, annulées ou étrangères à la ville", () =>
    {
        const cancelled = { ...journey("1", ["Paris", "Lille"]), cancelled: true };
        const links = journeyLinks([
            journey("2", ["Paris", "Lille"], "past", "2026-09-01T08:00:00Z"),
            cancelled,
            journey("3", ["Nantes", "Rennes"])
        ], ["paris"], 10, now);

        expect(links).toEqual({ routes: [], services: [] });
    });

    it("limite le nombre de liens", () =>
    {
        const journeys = Array.from({ length: 8 }, (_, index) => journey(String(index), ["Paris", `Ville ${index}`]));
        const links = journeyLinks(journeys, ["paris"], 3, now);

        expect(links.routes).toHaveLength(3);
        expect(links.services).toHaveLength(3);
    });
});

function journey(serviceNumber: string, cities: string[], journeyRef = serviceNumber, firstDeparture = "2026-09-06T08:00:00Z"): JourneyView
{
    const start = new Date(firstDeparture).getTime();
    const stops = cities.map((city, index) =>
    {
        const time = new Date(start + index * 3_600_000).toISOString();
        return {
            stopId: `${journeyRef}-${index}`,
            name: city,
            city,
            order: index + 1,
            phase: "upcoming" as const,
            aimedArrivalAt: time,
            expectedArrivalAt: null,
            actualArrivalAt: null,
            aimedDepartureAt: time,
            expectedDepartureAt: null,
            actualDepartureAt: null,
            arrivalStatus: null,
            departureStatus: null,
            delaySeconds: null,
            cancelled: false
        };
    });
    return {
        journeyRef,
        serviceNumber,
        serviceDate: firstDeparture.slice(0, 10),
        operatorSlug: "blablacar-bus",
        operatorName: "BlaBlaCar Bus",
        realtimeAvailable: false,
        realtimeObserved: false,
        realtimeStatus: "scheduled_only",
        originStopId: stops[0]!.stopId,
        originName: cities[0]!,
        originCity: cities[0]!,
        destinationStopId: stops[stops.length - 1]!.stopId,
        destinationName: cities[cities.length - 1]!,
        destinationCity: cities[cities.length - 1]!,
        status: "scheduled",
        delaySeconds: null,
        updatedAt: firstDeparture,
        cancelled: false,
        completeStopSequence: true,
        matchConfidence: null,
        matchMethod: "GTFS_SCHEDULE",
        scheduledTripId: journeyRef,
        punctuality: null,
        stops
    };
}

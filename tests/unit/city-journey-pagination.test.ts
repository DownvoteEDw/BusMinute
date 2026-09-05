import { describe, expect, it } from "vitest";
import type { JourneyView } from "../../src/application/journey-view.js";
import { paginateCityJourneys } from "../../src/application/transit-data-service.js";

describe("pagination des passages par ville", () =>
{
    it("charge tous les trajets sans doublon par blocs successifs", () =>
    {
        const journeys = Array.from({ length: 45 }, (_, index) => journey(index));
        const first = paginateCityJourneys(journeys, "paris", null, 20);
        const second = paginateCityJourneys(journeys, "paris", first.nextCursor, 20);
        const third = paginateCityJourneys(journeys, "paris", second.nextCursor, 20);
        const references = [...first.journeys, ...second.journeys, ...third.journeys]
            .map((candidate) => candidate.journeyRef);

        expect(first.journeys).toHaveLength(20);
        expect(second.journeys).toHaveLength(20);
        expect(third.journeys).toHaveLength(5);
        expect(third.nextCursor).toBeNull();
        expect(new Set(references).size).toBe(45);
    });

    it("limite la taille maximale d’un chargement", () =>
    {
        const journeys = Array.from({ length: 60 }, (_, index) => journey(index));
        expect(paginateCityJourneys(journeys, "paris", null, 500).journeys).toHaveLength(50);
    });
});

function journey(index: number): JourneyView
{
    const time = new Date(Date.UTC(2026, 8, 6, 8, index)).toISOString();
    const journeyRef = `journey-${index}`;
    return {
        journeyRef,
        serviceNumber: String(index),
        serviceDate: "2026-09-06",
        operatorSlug: "flixbus",
        operatorName: "FlixBus",
        realtimeAvailable: true,
        realtimeObserved: false,
        originStopId: "paris",
        originName: "Paris",
        originCity: "Paris",
        destinationStopId: "lyon",
        destinationName: "Lyon",
        destinationCity: "Lyon",
        status: "scheduled",
        delaySeconds: null,
        updatedAt: time,
        cancelled: false,
        completeStopSequence: true,
        matchConfidence: null,
        matchMethod: "GTFS_SCHEDULE",
        scheduledTripId: journeyRef,
        punctuality: null,
        stops: [
            {
                stopId: "paris",
                name: "Paris",
                city: "Paris",
                order: 1,
                phase: "current",
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
            }
        ]
    };
}

import { describe, expect, it } from "vitest";
import type { JourneyView } from "../../src/application/journey-view.js";
import
{
    groupStationJourneysByDate,
    journeyDateAtStop,
    stationDateHeading
} from "../../src/application/station-schedule.js";

describe("horaires par gare", () =>
{
    it("sépare les passages selon leur date locale, y compris après minuit", () =>
    {
        const earlier = journey("5000", "2026-09-01T20:30:00.000Z");
        const beforeMidnight = journey("5001", "2026-09-01T21:55:00.000Z");
        const afterMidnight = journey("5002", "2026-09-01T22:55:00.000Z");
        const groups = groupStationJourneysByDate([beforeMidnight, afterMidnight, earlier], "XYL");

        expect(journeyDateAtStop(beforeMidnight, "XYL")).toBe("2026-09-01");
        expect(journeyDateAtStop(afterMidnight, "XYL")).toBe("2026-09-02");
        expect(groups.map((group) => group.date)).toEqual(["2026-09-01", "2026-09-02"]);
        expect(groups.map((group) => group.journeys.length)).toEqual([2, 1]);
        expect(groups[0]?.journeys.map((item) => item.serviceNumber)).toEqual(["5000", "5001"]);
    });

    it("nomme hier, aujourd’hui et demain en heure française", () =>
    {
        const now = new Date("2026-09-01T10:00:00.000Z");

        expect(stationDateHeading("2026-08-31", now)).toEqual({
            relative: "Hier",
            full: "Lundi 31 août"
        });
        expect(stationDateHeading("2026-09-01", now)).toEqual({
            relative: "Aujourd’hui",
            full: "Mardi 1 septembre"
        });
        expect(stationDateHeading("2026-09-02", now)).toEqual({
            relative: "Demain",
            full: "Mercredi 2 septembre"
        });
    });

    it("nomme les dates en anglais quand cette langue est sélectionnée", () =>
    {
        const now = new Date("2026-09-01T10:00:00.000Z");

        expect(stationDateHeading("2026-09-01", now, "en")).toEqual({
            relative: "Today",
            full: "Tuesday 1 September"
        });
    });
});

function journey(serviceNumber: string, aimedDepartureAt: string): JourneyView
{
    return {
        journeyRef: `${serviceNumber}:2026-09-01`,
        serviceNumber,
        serviceDate: "2026-09-01",
        operatorSlug: "blablacar-bus",
        operatorName: "BlaBlaCar Bus",
        realtimeAvailable: true,
        realtimeObserved: true,
        realtimeStatus: "live",
        originStopId: "XYL",
        originName: "Lyon - Gerland",
        originCity: "Lyon",
        destinationStopId: "XPB",
        destinationName: "Paris - Bercy",
        destinationCity: "Paris",
        status: "scheduled",
        delaySeconds: null,
        updatedAt: "2026-09-01T10:00:00.000Z",
        cancelled: false,
        completeStopSequence: true,
        matchConfidence: 1,
        matchMethod: "test",
        scheduledTripId: serviceNumber,
        punctuality: null,
        stops: [
            {
                stopId: "XYL",
                name: "Lyon - Gerland",
                city: "Lyon",
                order: 1,
                phase: "upcoming",
                aimedArrivalAt: null,
                expectedArrivalAt: null,
                actualArrivalAt: null,
                aimedDepartureAt,
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

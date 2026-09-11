import { describe, expect, it } from "vitest";
import { buildJourneyView } from "../../src/application/journey-view.js";
import type
{
    GtfsFeed,
    SiriCall,
    SiriJourney,
    TripMatchResult
} from "../../src/domain/models.js";

describe("buildJourneyView", () =>
{
    it("utilise le retard de l'arrêt courant avant les prévisions des arrêts suivants", () =>
    {
        const journey = buildJourneyView(feed(), siriJourney(
        [
            call("Montpellier", 1, {
                aimedArrivalTime: new Date("2026-09-11T10:35:00Z"),
                actualArrivalTime: new Date("2026-09-11T10:38:00Z")
            }),
            call("Clermont-Ferrand", 2, {
                aimedArrivalTime: new Date("2026-09-11T15:15:00Z"),
                expectedArrivalTime: new Date("2026-09-11T14:21:00Z")
            }),
            call("Bourges", 3, {
                aimedArrivalTime: new Date("2026-09-11T17:15:00Z"),
                expectedArrivalTime: new Date("2026-09-11T17:15:00Z")
            })
        ]), match());

        expect(journey.stops[1]?.phase).toBe("current");
        expect(journey.stops[1]?.delaySeconds).toBe(-3_240);
        expect(journey.delaySeconds).toBe(-3_240);
    });

    it("conserve la dernière observation passée si l'arrêt courant n'a pas encore de prévision", () =>
    {
        const journey = buildJourneyView(feed(), siriJourney(
        [
            call("Montpellier", 1, {
                aimedArrivalTime: new Date("2026-09-11T10:35:00Z"),
                actualArrivalTime: new Date("2026-09-11T10:39:00Z")
            }),
            call("Clermont-Ferrand", 2, {
                aimedArrivalTime: new Date("2026-09-11T15:15:00Z")
            }),
            call("Bourges", 3, {
                aimedArrivalTime: new Date("2026-09-11T17:15:00Z"),
                expectedArrivalTime: new Date("2026-09-11T17:15:00Z")
            })
        ]), match());

        expect(journey.delaySeconds).toBe(240);
    });
});

function feed(): GtfsFeed
{
    return {
        agencies: [],
        stops: [],
        routes: [],
        calendars: [],
        calendarExceptions: [],
        trips: [],
        sourcePath: "test"
    };
}

function siriJourney(calls: SiriCall[]): SiriJourney
{
    return {
        journeyRef: "50892:2026-09-11",
        datedVehicleJourneyRef: null,
        lineRef: null,
        serviceNumber: "50892",
        serviceDate: "2026-09-11",
        cancellation: false,
        completeStopSequence: true,
        recordedAtTime: new Date("2026-09-11T11:54:03Z"),
        calls
    };
}

function call(stopPointName: string, order: number, values: Partial<SiriCall>): SiriCall
{
    return {
        stopPointRef: `stop-${order}`,
        order,
        stopPointName,
        aimedArrivalTime: null,
        expectedArrivalTime: null,
        actualArrivalTime: null,
        aimedDepartureTime: null,
        expectedDepartureTime: null,
        actualDepartureTime: null,
        arrivalStatus: null,
        departureStatus: null,
        cancellation: false,
        extraCall: false,
        source: "estimated",
        ...values
    };
}

function match(): TripMatchResult
{
    return {
        status: "unmatched",
        journeyRef: "50892:2026-09-11",
        serviceNumber: "50892",
        serviceDate: "2026-09-11",
        match: null,
        candidates: [],
        reason: null
    };
}

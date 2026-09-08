import { describe, expect, it } from "vitest";
import { liveBoardEvent, liveBoardEventTime } from "../../src/application/live-board.js";
import { selectLiveBoard } from "../../src/application/transit-data-service.js";
import type { JourneyView } from "../../src/application/journey-view.js";

describe("sélection du panneau d’accueil", () =>
{
    it("affiche les deux opérateurs dans l’ordre chronologique", () =>
    {
        const journeys = [
            journey("b1", "blablacar-bus", "2026-09-05T10:01:00Z"),
            journey("b2", "blablacar-bus", "2026-09-05T10:02:00Z"),
            journey("b3", "blablacar-bus", "2026-09-05T10:03:00Z"),
            journey("b4", "blablacar-bus", "2026-09-05T10:04:00Z"),
            journey("b5", "blablacar-bus", "2026-09-05T10:05:00Z"),
            journey("b6", "blablacar-bus", "2026-09-05T10:06:00Z"),
            journey("b7", "blablacar-bus", "2026-09-05T10:07:00Z"),
            journey("f1", "flixbus", "2026-09-05T10:08:00Z"),
            journey("f2", "flixbus", "2026-09-05T10:09:00Z")
        ];
        const selected = selectLiveBoard(journeys, 7);
        expect(selected).toHaveLength(7);
        expect(selected.filter((item) => item.operatorSlug === "flixbus")).toHaveLength(2);
        expect(selected.map(liveBoardEventTime)).toEqual([...selected.map(liveBoardEventTime)].sort((first, second) => first - second));
    });

    it("affiche et trie le prochain arrêt plutôt que le départ déjà passé", () =>
    {
        const laterEvent = journeyWithPassedOrigin("later", "2026-09-05T11:00:00Z", "2026-09-05T19:10:00Z");
        const earlierEvent = journeyWithPassedOrigin("earlier", "2026-09-05T14:00:00Z", "2026-09-05T19:05:00Z");
        const selected = selectLiveBoard([laterEvent, earlierEvent], 2);

        expect(selected.map((journey) => journey.journeyRef)).toEqual(["earlier", "later"]);
        expect(liveBoardEvent(laterEvent)).toMatchObject({
            type: "next_stop",
            time: "2026-09-05T19:10:00Z"
        });
    });

    it("réserve une place aux trois opérateurs", () =>
    {
        const journeys = [
            journey("b1", "blablacar-bus", "2026-09-05T10:01:00Z"),
            journey("b2", "blablacar-bus", "2026-09-05T10:02:00Z"),
            journey("b3", "blablacar-bus", "2026-09-05T10:03:00Z"),
            journey("b4", "blablacar-bus", "2026-09-05T10:04:00Z"),
            journey("f1", "flixbus", "2026-09-05T10:05:00Z"),
            journey("f2", "flixbus", "2026-09-05T10:06:00Z"),
            journey("a1", "alsa", "2026-09-05T10:07:00Z"),
            journey("a2", "alsa", "2026-09-05T10:08:00Z")
        ];
        const selected = selectLiveBoard(journeys, 7);

        expect(selected).toHaveLength(7);
        expect(selected.filter((item) => item.operatorSlug === "blablacar-bus")).toHaveLength(3);
        expect(selected.filter((item) => item.operatorSlug === "flixbus")).toHaveLength(2);
        expect(selected.filter((item) => item.operatorSlug === "alsa")).toHaveLength(2);
    });
});

function journey(journeyRef: string, operatorSlug: string, time: string): JourneyView
{
    return {
        journeyRef,
        serviceNumber: journeyRef,
        operatorSlug,
        updatedAt: time,
        stops: [
            {
                phase: "current",
                aimedDepartureAt: time
            }
        ]
    } as JourneyView;
}

function journeyWithPassedOrigin(journeyRef: string, originTime: string, nextStopTime: string): JourneyView
{
    return {
        journeyRef,
        serviceNumber: journeyRef,
        serviceDate: "2026-09-05",
        operatorSlug: "flixbus",
        operatorName: "FlixBus",
        realtimeAvailable: true,
        realtimeObserved: false,
        realtimeStatus: "scheduled_only",
        originStopId: "origin",
        originName: "Origin",
        originCity: "Origin",
        destinationStopId: "next",
        destinationName: "Next",
        destinationCity: "Next",
        updatedAt: originTime,
        status: "scheduled",
        delaySeconds: null,
        cancelled: false,
        completeStopSequence: true,
        matchConfidence: null,
        matchMethod: "GTFS_SCHEDULE",
        scheduledTripId: journeyRef,
        punctuality: null,
        stops: [
            {
                stopId: "origin",
                name: "Origin",
                city: "Origin",
                order: 1,
                phase: "passed",
                aimedArrivalAt: originTime,
                expectedArrivalAt: null,
                actualArrivalAt: null,
                aimedDepartureAt: originTime,
                expectedDepartureAt: null,
                actualDepartureAt: null,
                arrivalStatus: null,
                departureStatus: null,
                delaySeconds: null,
                cancelled: false
            },
            {
                stopId: "next",
                name: "Next",
                city: "Next",
                order: 2,
                phase: "current",
                aimedArrivalAt: nextStopTime,
                expectedArrivalAt: null,
                actualArrivalAt: null,
                aimedDepartureAt: nextStopTime,
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

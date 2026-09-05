import { describe, expect, it } from "vitest";
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
        expect(selected.map(eventTime)).toEqual([...selected.map(eventTime)].sort((first, second) => first - second));
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

function eventTime(journey: JourneyView): number
{
    return new Date(journey.stops[0]?.aimedDepartureAt ?? journey.updatedAt).getTime();
}

import { describe, expect, it } from "vitest";
import { journeyDateLabel } from "../../src/application/journey-date.js";
import { shouldRefreshJourney } from "../../src/application/journey-refresh.js";
import { isJourneyCompleted } from "../../src/application/seo.js";
import type { JourneyView } from "../../src/application/journey-view.js";

function journey(serviceDate: string, end = `${serviceDate}T22:00:00Z`): JourneyView
{
    return { serviceDate, status: "scheduled", stops: [{ aimedArrivalAt: end }] } as JourneyView;
}

describe("dates et archives visibles", () =>
{
    it("affiche aujourd’hui selon la date de Paris, même si UTC est encore la veille", () =>
    {
        expect(journeyDateLabel(journey("2026-09-09"), "fr", new Date("2026-09-08T22:30:00Z"))).toBe("Aujourd’hui");
    });

    it("calcule demain comme une date civile lors du changement d’heure", () =>
    {
        expect(journeyDateLabel(journey("2026-10-26"), "fr", new Date("2026-10-24T22:30:00Z"))).toBe("Demain");
    });

    it("garde ouvert un trajet de nuit et ferme une circulation terminée", () =>
    {
        const night = journey("2026-09-08", "2026-09-09T04:00:00Z");
        expect(isJourneyCompleted(night, new Date("2026-09-09T02:00:00Z"))).toBe(false);
        expect(journeyDateLabel(night, "fr", new Date("2026-09-09T05:00:00Z"))).toBe("Trajet terminé");
    });

    it("continue le suivi après l'arrivée prévue lorsqu'un retard temps réel peut encore être reçu", () =>
    {
        const delayed = {
            ...journey("2026-09-10", "2026-09-10T17:45:00Z"),
            journeyRef: "flixbus:800-5-0930092026-AMD#PQB-00:2026-09-10",
            realtimeAvailable: true,
            realtimeObserved: false,
            realtimeStatus: "scheduled_only"
        } as JourneyView;
        expect(isJourneyCompleted(delayed, new Date("2026-09-10T18:00:00Z"))).toBe(false);
        expect(shouldRefreshJourney(delayed, new Date("2026-09-10T18:00:00Z"))).toBe(true);
        expect(isJourneyCompleted(delayed, new Date("2026-09-11T00:00:01Z"))).toBe(true);
        expect(shouldRefreshJourney(delayed, new Date("2026-09-11T00:00:01Z"))).toBe(false);
    });

    it("ferme à l'heure prévue un trajet dont le suivi n'est pas offert", () =>
    {
        const journeyWithoutTracking = {
            ...journey("2026-09-10", "2026-09-10T17:45:00Z"),
            realtimeAvailable: true,
            realtimeObserved: false,
            realtimeStatus: "not_offered"
        } as JourneyView;
        expect(isJourneyCompleted(journeyWithoutTracking, new Date("2026-09-10T18:00:00Z"))).toBe(true);
        expect(shouldRefreshJourney(journeyWithoutTracking, new Date("2026-09-10T18:00:00Z"))).toBe(false);
    });
});

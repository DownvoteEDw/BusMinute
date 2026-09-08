import { describe, expect, it } from "vitest";
import { journeyDateLabel } from "../../src/application/journey-date.js";
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
});

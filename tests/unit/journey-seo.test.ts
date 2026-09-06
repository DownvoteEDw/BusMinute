import { describe, expect, it } from "vitest";
import { isJourneyOutsideIndexingWindow, type JourneySeoTiming } from "../../src/application/seo.js";

describe("SEO des circulations", () =>
{
    it("conserve une circulation dans l’index pendant quarante-huit heures", () =>
    {
        const journey = journeyAt("2026-09-04T12:00:00Z");

        expect(isJourneyOutsideIndexingWindow(journey, new Date("2026-09-06T11:59:59Z"))).toBe(false);
    });

    it("retire une ancienne circulation de l’index après quarante-huit heures", () =>
    {
        const journey = journeyAt("2026-08-27T18:00:00Z");

        expect(isJourneyOutsideIndexingWindow(journey, new Date("2026-09-06T08:00:00Z"))).toBe(true);
    });

    it("utilise le dernier horaire disponible pour les trajets de nuit", () =>
    {
        const journey = journeyAt("2026-09-05T23:30:00Z");
        journey.stops.push(stopAt("2026-09-06T04:00:00Z"));

        expect(isJourneyOutsideIndexingWindow(journey, new Date("2026-09-08T03:59:59Z"))).toBe(false);
        expect(isJourneyOutsideIndexingWindow(journey, new Date("2026-09-08T04:00:01Z"))).toBe(true);
    });
});

function journeyAt(timestamp: string): JourneySeoTiming
{
    return {
        serviceDate: timestamp.slice(0, 10),
        stops: [stopAt(timestamp)]
    };
}

function stopAt(timestamp: string): JourneySeoTiming["stops"][number]
{
    return {
        aimedArrivalAt: timestamp,
        expectedArrivalAt: null,
        actualArrivalAt: null,
        aimedDepartureAt: null,
        expectedDepartureAt: null,
        actualDepartureAt: null
    };
}

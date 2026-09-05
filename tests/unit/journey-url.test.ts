import { describe, expect, it, vi } from "vitest";
import { journeyPath, journeyPathSegment, journeyRefFromPath } from "../../src/application/journey-url.js";
import { GET } from "../../app/api/journeys/[journeyRef]/route.js";
import { transitDataService } from "../../src/application/transit-data-service.js";
import type { JourneyView } from "../../src/application/journey-view.js";

vi.mock("../../src/application/transit-data-service.js", () =>
{
    return { transitDataService: { getJourney: vi.fn() } };
});

describe("adresses des circulations", () =>
{
    it.each(
    [
        "50819:2026-08-22",
        "flixbus:774-2-0745092026-CAE#PQB-00:2026-09-05",
        "flixbus:service/avec?des;caractères\\réservés%23~:2026-09-05",
        "j~identifiant:2026-09-05"
    ])("conserve l’identifiant %s sans caractères rejetés par le proxy", (reference) =>
    {
        const segment = journeyPathSegment(reference);
        expect(segment).not.toMatch(/%(23|2f|3f|3b|5c|25|00)/i);
        expect(segment).not.toContain("#");
        expect(segment).not.toContain("/");
        expect(journeyRefFromPath(decodeURIComponent(segment))).toBe(reference);
        expect(new URL(journeyPath(reference), "https://bus-minute.xyz").hash).toBe("");
    });

    it("conserve les adresses BlaBlaCar déjà indexées", () =>
    {
        expect(journeyPath("50819:2026-08-22")).toBe("/suivi/50819%3A2026-08-22");
        expect(journeyRefFromPath("flixbus:trip#id:2026-09-05")).toBe("flixbus:trip#id:2026-09-05");
    });

    it("actualise le trajet FlixBus avec son identifiant d’origine", async () =>
    {
        const journeyRef = "flixbus:774-2-0745092026-CAE#PQB-00:2026-09-05";
        const journey = { journeyRef, delaySeconds: 1380 };
        vi.mocked(transitDataService.getJourney).mockResolvedValueOnce(journey as JourneyView);
        const response = await GET(new Request(`https://bus-minute.xyz/api/journeys/${journeyPathSegment(journeyRef)}`),
        {
            params: Promise.resolve({ journeyRef: decodeURIComponent(journeyPathSegment(journeyRef)) })
        });
        expect(response.status).toBe(200);
        expect(transitDataService.getJourney).toHaveBeenLastCalledWith(journeyRef);
        expect(await response.json()).toEqual({ journey });
    });

    it("traite un identifiant encodé invalide sans erreur serveur", async () =>
    {
        const response = await GET(new Request("https://bus-minute.xyz/api/journeys/j~~FF"),
        {
            params: Promise.resolve({ journeyRef: "j~~FF" })
        });
        expect(response.status).toBe(404);
    });
});

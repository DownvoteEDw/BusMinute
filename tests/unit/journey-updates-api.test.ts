import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/journeys/updates/route.js";
import { transitDataService } from "../../src/application/transit-data-service.js";
import type { JourneyView } from "../../src/application/journey-view.js";

afterEach(() => vi.restoreAllMocks());

describe("actualisation des trajets après affichage", () =>
{
    it("limite la taille des lots avant tout accès aux opérateurs", async () =>
    {
        const load = vi.spyOn(transitDataService, "getJourney");
        for (const references of [null, [null], [""], ["x".repeat(501)], Array(21).fill("test")])
        {
            expect((await POST(request(references))).status).toBe(400);
        }
        expect(load).not.toHaveBeenCalled();
    });

    it("conserve les résultats disponibles si un autre trajet échoue", async () =>
    {
        const load = vi.spyOn(transitDataService, "getJourney").mockImplementation(async (ref) =>
        {
            if (ref === "unavailable")
            {
                throw new Error("Unavailable");
            }
            return { journeyRef: ref } as JourneyView;
        });
        const response = await POST(request(["available", "available", "unavailable"]));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ journeys: [{ journeyRef: "available" }] });
        expect(load).toHaveBeenCalledTimes(2);
    });
});

function request(references: unknown): Request
{
    return new Request("http://localhost/api/journeys/updates", { method: "POST", body: JSON.stringify({ references }) });
}

import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { backfillJourneyLinks } from "../../src/application/backfill-journey-links.js";
import type { JourneyView } from "../../src/application/journey-view.js";

describe("reprise des anciens liens", () =>
{
    it("avance dans l’historique même si un ancien trajet est indisponible", async () =>
    {
        const query = vi.fn()
            .mockResolvedValueOnce({ rows: [{ reference: "a" }, { reference: "b" }] })
            .mockResolvedValueOnce({ rows: [{ reference: "c" }] })
            .mockResolvedValueOnce({ rows: [] });
        const getJourney = vi.fn()
            .mockResolvedValueOnce({ journeyRef: "a", publicPath: "/suivi/a" } as JourneyView)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ journeyRef: "c", publicPath: "/suivi/c" } as JourneyView);
        expect(await backfillJourneyLinks({ query } as unknown as Pool, { getJourney })).toEqual({ saved: 2, unavailable: 1 });
        expect(query.mock.calls.map((call) => call[1])).toEqual([[""], ["b"], ["c"]]);
        expect(getJourney.mock.calls.map((call) => call[0])).toEqual(["a", "b", "c"]);
    });

    it("remonte un échec de sauvegarde pour permettre une reprise", async () =>
    {
        const query = vi.fn().mockResolvedValue({ rows: [{ reference: "a" }] });
        const getJourney = vi.fn().mockRejectedValue(new Error("Database unavailable"));
        await expect(backfillJourneyLinks({ query } as unknown as Pool, { getJourney })).rejects.toThrow("Database unavailable");
    });
});

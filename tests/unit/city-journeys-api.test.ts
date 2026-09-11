import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/api/cities/[city]/journeys/route.js";
import { transitDataService } from "../../src/application/transit-data-service.js";

vi.mock("../../src/application/transit-data-service.js", () => ({
    transitDataService: { getCityJourneyPage: vi.fn() }
}));

describe("API des départs datés", () =>
{
    beforeEach(() =>
    {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
        vi.clearAllMocks();
    });

    afterEach(() => vi.useRealTimers());

    it("refuse une date hors fenêtre avant tout chargement", async () =>
    {
        const response = await GET(
            new Request("http://localhost/api/cities/paris/journeys?date=2200-01-01"),
            { params: Promise.resolve({ city: "paris" }) }
        );

        expect(response.status).toBe(400);
        expect(transitDataService.getCityJourneyPage).not.toHaveBeenCalled();
    });

    it("conserve une date légitime et la pagination demandée", async () =>
    {
        vi.mocked(transitDataService.getCityJourneyPage).mockResolvedValue({
            journeys: [],
            nextCursor: null,
            totalCount: 0
        });
        const response = await GET(
            new Request("http://localhost/api/cities/paris/journeys?date=2026-09-12&limit=15"),
            { params: Promise.resolve({ city: "paris" }) }
        );

        expect(response.status).toBe(200);
        expect(transitDataService.getCityJourneyPage).toHaveBeenCalledWith("paris", "2026-09-12", null, 15);
    });
});

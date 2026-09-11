import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/api/search/route.js";
import { transitDataService } from "../../src/application/transit-data-service.js";

vi.mock("../../src/application/transit-data-service.js", () => ({
    transitDataService: {
        search: vi.fn(),
        searchPlaces: vi.fn()
    }
}));

describe("API de recherche", () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
        vi.mocked(transitDataService.search).mockResolvedValue([]);
        vi.mocked(transitDataService.searchPlaces).mockResolvedValue([]);
    });

    it("refuse une requête trop longue avant de charger les données", async () =>
    {
        const query = encodeURIComponent("paris ".repeat(17));
        const response = await GET(new Request(`http://localhost/api/search?q=${query}`));

        expect(response.status).toBe(400);
        expect(transitDataService.search).not.toHaveBeenCalled();
        expect(transitDataService.searchPlaces).not.toHaveBeenCalled();
    });

    it("conserve une recherche de liaison légitime", async () =>
    {
        const response = await GET(new Request("http://localhost/api/search?q=Paris%20%E2%86%92%20Tours"));

        expect(response.status).toBe(200);
        expect(transitDataService.search).toHaveBeenCalledWith("Paris → Tours");
        expect(transitDataService.searchPlaces).toHaveBeenCalledWith("Paris → Tours");
    });
});

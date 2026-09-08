import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/reports/route.js";
import { transitDataService } from "../../src/application/transit-data-service.js";
import type { JourneyView } from "../../src/application/journey-view.js";

vi.mock("../../src/application/transit-data-service.js", () => ({ transitDataService: { getJourney: vi.fn() } }));

beforeEach(() =>
{
    vi.mocked(transitDataService.getJourney).mockResolvedValue({ serviceDate: "2099-01-01", status: "scheduled", stops: [] } as unknown as JourneyView);
});

function createRequest(body: Record<string, unknown>): Request
{
    return new Request("http://localhost/api/reports",
    {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "busminute-test",
            "X-Forwarded-For": "192.0.2.1"
        },
        body: JSON.stringify(body)
    });
}

describe("API des signalements voyageurs", () =>
{
    it("refuse les signalements sur une archive et une circulation inconnue", async () =>
    {
        vi.mocked(transitDataService.getJourney).mockResolvedValueOnce({ serviceDate: "2020-01-01", status: "arrived", stops: [] } as unknown as JourneyView);
        expect((await POST(createRequest({ journeyRef: "past", type: "BUS_ARRIVED" }))).status).toBe(409);
        vi.mocked(transitDataService.getJourney).mockResolvedValueOnce(null);
        expect((await POST(createRequest({ journeyRef: "unknown", type: "BUS_ARRIVED" }))).status).toBe(404);
    });
    it("refuse les références anormalement longues", async () =>
    {
        const response = await POST(createRequest({
            journeyRef: "x".repeat(161),
            stopId: "XPB",
            type: "BUS_ARRIVED"
        }));

        expect(response.status).toBe(400);
    });

    it("enregistre un signalement puis limite une répétition immédiate", async () =>
    {
        const body = {
            journeyRef: "rate-limit-test:2026-08-23",
            stopId: "XPB",
            type: "BUS_ARRIVED"
        };
        const created = await POST(createRequest(body));
        const limited = await POST(createRequest(body));

        expect(created.status).toBe(201);
        expect(limited.status).toBe(429);
    });
});

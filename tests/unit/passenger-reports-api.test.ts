import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/reports/route.js";
import { transitDataService } from "../../src/application/transit-data-service.js";
import type { JourneyView } from "../../src/application/journey-view.js";

vi.mock("../../src/application/transit-data-service.js", () => ({ transitDataService: { getJourney: vi.fn() } }));

beforeEach(() =>
{
    vi.clearAllMocks();
    vi.mocked(transitDataService.getJourney).mockResolvedValue({
        serviceDate: "2099-01-01",
        status: "scheduled",
        stops: [{ stopId: "XPB" }]
    } as unknown as JourneyView);
});

function createRequest(
    body: Record<string, unknown>,
    headers: Record<string, string> = {}
): Request
{
    return new Request("http://localhost/api/reports",
    {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "busminute-test",
            "X-Forwarded-For": "192.0.2.1",
            ...headers
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
        expect(limited.headers.get("Retry-After")).toBe("2");
    });

    it("ne permet pas de contourner la limite en changeant les en-têtes réseau", async () =>
    {
        const body = {
            journeyRef: "user-agent-bypass:2026-08-23",
            stopId: "XPB",
            type: "BUS_ARRIVED"
        };
        const created = await POST(createRequest(body, {
            "User-Agent": "browser-a",
            "X-Forwarded-For": "192.0.2.1"
        }));
        const limited = await POST(createRequest(body, {
            "User-Agent": "browser-b",
            "X-Forwarded-For": "198.51.100.2"
        }));

        expect(created.status).toBe(201);
        expect(limited.status).toBe(429);
    });

    it("refuse un arrêt étranger au trajet", async () =>
    {
        const response = await POST(createRequest({
            journeyRef: "invalid-stop:2026-08-23",
            stopId: "XTO",
            type: "BUS_ARRIVED"
        }));

        expect(response.status).toBe(400);
    });

    it("interrompt un corps JSON trop volumineux", async () =>
    {
        const request = new Request("http://localhost/api/reports",
        {
            method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": "1" },
            body: JSON.stringify({
                journeyRef: "oversized:2026-08-23",
                type: "BUS_ARRIVED",
                padding: "x".repeat(17_000)
            })
        });
        const response = await POST(request);

        expect(response.status).toBe(413);
        expect(transitDataService.getJourney).not.toHaveBeenCalled();
    });

    it("refuse une valeur JSON qui n'est pas un signalement", async () =>
    {
        const response = await POST(new Request("http://localhost/api/reports",
        {
            method: "POST",
            body: "null"
        }));

        expect(response.status).toBe(400);
        expect(transitDataService.getJourney).not.toHaveBeenCalled();
    });
});

import { describe, expect, it } from "vitest";
import { POST } from "../../app/api/reports/route.js";

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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichFlixBusJourney, matchFlixBusRealtimeRide } from "../../src/application/flixbus-realtime.js";
import type { JourneyView } from "../../src/application/journey-view.js";
import
{
    FlixBusRealtimeClient,
    parseRealtimeRides
} from "../../src/providers/flixbus/realtime-client.js";

let previousEnabled: string | undefined;
let previousApiKey: string | undefined;

describe("temps réel FlixBus", () =>
{
    beforeEach(() =>
    {
        previousEnabled = process.env.FLIXBUS_REALTIME_ENABLED;
        previousApiKey = process.env.FLIXBUS_REALTIME_API_KEY;
        process.env.FLIXBUS_REALTIME_ENABLED = "true";
    });

    afterEach(() =>
    {
        vi.useRealTimers();
        restoreEnvironment("FLIXBUS_REALTIME_ENABLED", previousEnabled);
        restoreEnvironment("FLIXBUS_REALTIME_API_KEY", previousApiKey);
    });

    it("partage les requêtes simultanées puis actualise les retards après expiration", async () =>
    {
        vi.useFakeTimers();
        process.env.FLIXBUS_REALTIME_API_KEY = "test-key";
        const fetcher = vi.fn(async () => Response.json(realtimePayload()));
        const client = new FlixBusRealtimeClient(fetcher);
        const from = new Date("2026-09-02T07:10:00Z");
        const to = new Date("2026-09-02T11:10:00Z");
        await Promise.all(Array.from({ length: 20 }, () => client.loadStationRides("paris-stop", from, to)));
        expect(fetcher).toHaveBeenCalledTimes(2);
        vi.advanceTimersByTime(31_000);
        await client.loadStationRides("paris-stop", from, to);
        expect(fetcher).toHaveBeenCalledTimes(4);
    });

    it("récupère après un échec temporaire de découverte de la configuration", async () =>
    {
        delete process.env.FLIXBUS_REALTIME_API_KEY;
        let available = false;
        const client = new FlixBusRealtimeClient(async (input) =>
        {
            if (!available)
            {
                return new Response(null, { status: 503 });
            }

            if (String(input).endsWith("/track"))
            {
                return new Response('<script src="https://tracker.example/assets/index-test.js"></script>');
            }

            if (String(input).includes("index-test.js"))
            {
                return new Response('var config={WIMR_API_KEY:"test-key"};');
            }

            return Response.json(realtimePayload());
        });
        const from = new Date("2026-09-02T07:00:00Z");
        const to = new Date("2026-09-02T11:00:00Z");
        await expect(client.loadStationRides("paris-stop", from, to)).rejects.toThrow("503");
        available = true;
        expect(await client.loadStationRides("paris-stop", from, to)).toHaveLength(1);
    });

    it("lit et déduplique le tableau des arrivées et départs", async () =>
    {
        process.env.FLIXBUS_REALTIME_API_KEY = "test-key";
        const urls: string[] = [];
        const client = new FlixBusRealtimeClient(async (input) =>
        {
            urls.push(String(input));
            return Response.json(realtimePayload());
        });
        const rides = await client.loadStationRides(
            "paris-stop",
            new Date("2026-09-02T07:00:00Z"),
            new Date("2026-09-02T11:00:00Z")
        );

        expect(rides).toHaveLength(1);
        expect(urls).toHaveLength(2);
        expect(urls.some((url) => url.includes("/departures?"))).toBe(true);
        expect(urls.some((url) => url.includes("/arrivals?"))).toBe(true);
        expect(urls.every((url) => new URL(url).searchParams.get("from") === "2026-09-02T07:00:00.000Z")).toBe(true);
        expect(urls.every((url) => new URL(url).searchParams.get("to") === "2026-09-02T11:00:00.000Z")).toBe(true);
    });

    it("retrouve automatiquement la configuration publiée par le tracker", async () =>
    {
        delete process.env.FLIXBUS_REALTIME_API_KEY;
        const urls: string[] = [];
        const client = new FlixBusRealtimeClient(async (input) =>
        {
            const url = String(input);
            urls.push(url);

            if (url.endsWith("/track"))
            {
                return new Response("<script type=\"module\" src=\"https://tracker.example/assets/index-test.js\"></script>",
                {
                    status: 200,
                    headers: { "Content-Type": "text/html" }
                });
            }

            if (url.includes("index-test.js"))
            {
                return new Response("var config={WIMR_API_KEY:\"discovered-key\"};");
            }

            return Response.json(realtimePayload());
        });
        const rides = await client.loadStationRides(
            "paris-stop",
            new Date("2026-09-02T07:00:00Z"),
            new Date("2026-09-02T11:00:00Z")
        );

        expect(rides).toHaveLength(1);
        expect(urls).toHaveLength(4);
        expect(urls[2]).toContain("apiKey=discovered-key");
    });

    it("associe une circulation GTFS et applique son retard arrêt par arrêt", () =>
    {
        const rides = parseRealtimeRides(realtimePayload());
        const enriched = enrichFlixBusJourney(
            scheduledJourney(),
            rides,
            new Date("2026-09-02T09:05:00Z")
        );

        expect(enriched.realtimeAvailable).toBe(true);
        expect(enriched.realtimeObserved).toBe(true);
        expect(enriched.delaySeconds).toBe(600);
        expect(enriched.matchMethod).toBe("FLIXBUS_REALTIME_API");
        expect(enriched.stops[0]?.expectedDepartureAt).toBe("2026-09-02T09:10:00Z");
        expect(enriched.stops[0]?.departureStatus).toBe("DELAYED");
    });

    it("corrige un écart incohérent à partir de l’horaire estimé", () =>
    {
        const rides = parseRealtimeRides(realtimePayload(rawDeviation(
            "2026-09-02T08:00:00Z",
            0,
            "ON_TIME"
        )));
        const enriched = enrichFlixBusJourney(
            scheduledJourney(),
            rides,
            new Date("2026-09-02T09:05:00Z")
        );

        expect(enriched.delaySeconds).toBe(-3600);
        expect(enriched.stops[0]?.expectedDepartureAt).toBe("2026-09-02T08:00:00Z");
        expect(enriched.stops[0]?.departureStatus).toBe("EARLY");
    });

    it("ne confond pas deux départs rapprochés portant le même numéro", () =>
    {
        const rides = parseRealtimeRides(realtimePayload(
            rawDeviation("2026-09-02T08:45:00Z", 600, "LATE"),
            "2026-09-02T08:35:00Z",
            "2026-09-02T14:35:00Z"
        ));

        expect(matchFlixBusRealtimeRide(scheduledJourney(), rides)).toBeNull();
    });
});

function realtimePayload(
    deviation: unknown = rawDeviation(),
    originScheduledAt = "2026-09-02T09:00:00Z",
    destinationScheduledAt = "2026-09-02T15:00:00Z"
): unknown
{
    return {
        rides: [
            {
                id: "ride-9901",
                status: {
                    next_stop_sequence: 1,
                    has_arrived_at_next_stop: false,
                    deviation
                },
                line: {
                    code: "9901",
                    direction: "Lyon"
                },
                calls: [
                    {
                        sequence: 1,
                        stop: {
                            id: "paris-stop",
                            name: "Paris",
                            city: { name: "Paris" }
                        },
                        arrival: null,
                        departure: {
                            scheduled: originScheduledAt,
                            deviation
                        }
                    },
                    {
                        sequence: 2,
                        stop: {
                            id: "lyon-stop",
                            name: "Lyon",
                            city: { name: "Lyon" }
                        },
                        arrival: {
                            scheduled: destinationScheduledAt,
                            deviation: null
                        },
                        departure: null
                    }
                ]
            }
        ],
        station: {
            id: "paris-stop",
            name: "Paris"
        }
    };
}

function rawDeviation(
    timestamp = "2026-09-02T09:10:00Z",
    seconds = 600,
    classification = "LATE"
): unknown
{
    return {
        deviation_timestamp: timestamp,
        deviation_seconds: seconds,
        deviation_class: classification,
        deviation_type: "FORECAST",
        updated_at: "2026-09-02T08:55:00Z"
    };
}

function scheduledJourney(): JourneyView
{
    return {
        journeyRef: "flixbus:9901-trip:2026-09-02",
        serviceNumber: "9901",
        serviceDate: "2026-09-02",
        operatorSlug: "flixbus",
        operatorName: "FlixBus",
        realtimeAvailable: true,
        realtimeObserved: false,
        realtimeStatus: "scheduled_only",
        originStopId: "flixbus:paris-stop",
        originName: "Paris",
        originCity: "Paris",
        destinationStopId: "flixbus:lyon-stop",
        destinationName: "Lyon",
        destinationCity: "Lyon",
        status: "scheduled",
        delaySeconds: null,
        updatedAt: "2026-09-02T08:00:00Z",
        cancelled: false,
        completeStopSequence: true,
        matchConfidence: null,
        matchMethod: "GTFS_SCHEDULE",
        scheduledTripId: "9901-trip",
        punctuality: null,
        stops: [
            {
                stopId: "flixbus:paris-stop",
                name: "Paris",
                city: "Paris",
                order: 1,
                phase: "current",
                aimedArrivalAt: null,
                expectedArrivalAt: null,
                actualArrivalAt: null,
                aimedDepartureAt: "2026-09-02T09:00:00Z",
                expectedDepartureAt: null,
                actualDepartureAt: null,
                arrivalStatus: null,
                departureStatus: null,
                delaySeconds: null,
                cancelled: false
            },
            {
                stopId: "flixbus:lyon-stop",
                name: "Lyon",
                city: "Lyon",
                order: 2,
                phase: "upcoming",
                aimedArrivalAt: "2026-09-02T15:00:00Z",
                expectedArrivalAt: null,
                actualArrivalAt: null,
                aimedDepartureAt: null,
                expectedDepartureAt: null,
                actualDepartureAt: null,
                arrivalStatus: null,
                departureStatus: null,
                delaySeconds: null,
                cancelled: false
            }
        ]
    };
}

function restoreEnvironment(name: string, value: string | undefined): void
{
    if (value === undefined)
    {
        delete process.env[name];
        return;
    }

    process.env[name] = value;
}

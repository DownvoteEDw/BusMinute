import { afterEach, describe, expect, it, vi } from "vitest";
import { enrichAlsaJourney } from "../../src/application/alsa-realtime.js";
import { WorkQueueFullError } from "../../src/application/bounded-concurrency.js";
import type { JourneyView } from "../../src/application/journey-view.js";
import
{
    AlsaRealtimeClient,
    matchAlsaTrackingLocation,
    parseAlsaSearchHtml,
    parseAlsaTrackingResponse,
    type AlsaRealtimeRequest
} from "../../src/providers/alsa/realtime-client.js";

describe("temps réel Alsa", () =>
{
    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    it("récupère le flight puis les retards avec une session partagée", async () =>
    {
        vi.stubEnv("ALSA_REALTIME_ENABLED", "true");
        const requests: Array<{ url: string; method: string; cookie: string | null; body: string }> = [];
        const fetchImplementation = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
        {
            const url = input instanceof Request ? input.url : input.toString();
            const headers = new Headers(init?.headers);
            requests.push({
                url,
                method: init?.method ?? "GET",
                cookie: headers.get("Cookie"),
                body: init?.body?.toString() ?? ""
            });

            if (url === trackerUrl)
            {
                return new Response(bootstrapHtml(),
                {
                    headers: { "Set-Cookie": "JSESSIONID=session-test; Path=/; HttpOnly" }
                });
            }

            if (url.includes("JsonGetOrigins"))
            {
                return Response.json([
                    { id: "90155", name: "Madrid (Tous les arrêts)", provincecountryName: "Madrid, Espagne" },
                    { id: "90365", name: "Bilbao (Tous les arrêts)", provincecountryName: "Bizkaia, Espagne" }
                ]);
            }

            if (url.includes("trackingBusTrayectoAction"))
            {
                return new Response(searchHtml());
            }

            if (url.includes("AjaxGetBusServiceTracking"))
            {
                return Response.json(trackingPayload());
            }

            return new Response(null, { status: 404 });
        });
        const client = new AlsaRealtimeClient(
            fetchImplementation,
            () => new Date("2026-09-07T09:30:00Z")
        );
        const [first, second] = await Promise.all([
            client.loadJourney(realtimeRequest()),
            client.loadJourney(realtimeRequest())
        ]);

        expect(first).toEqual(second);
        expect(first.status).toBe("live");
        expect(first.journey?.serviceNumber).toBe("3235");
        expect(first.journey?.flight).toBe("54");
        expect(first.journey?.calls[0]?.actualDepartureAt).toBe("2026-09-07T05:03:00.000Z");
        expect(first.journey?.calls[3]?.expectedArrivalAt).toBe("2026-09-07T10:04:00.000Z");
        expect(first.journey?.vehicles[0]).toEqual({
            registration: "8997MZG",
            latitude: 42.024962864,
            longitude: -3.764288023
        });
        expect(fetchImplementation).toHaveBeenCalledTimes(4);
        expect(requests[1]?.cookie).toContain("JSESSIONID=session-test");
        expect(requests[2]?.method).toBe("POST");
        expect(requests[2]?.body).toContain("originStationId=90155");
        expect(requests[3]?.url).toContain("_TrackingBusPortlet_WAR_Alsaportlet_flight=54");
    });

    it("associe la circulation et expose le retard estimé à l’arrivée", () =>
    {
        const request = realtimeRequest();
        const selection = {
            flight: "54",
            originId: "5155",
            destinationId: "365"
        };
        const realtime = parseAlsaTrackingResponse(
            trackingPayload(),
            selection,
            request,
            new Date("2026-09-07T09:30:00Z")
        )[0] ?? null;
        const journey = enrichAlsaJourney(scheduledJourney(), { status: "live", journey: realtime });

        expect(journey.realtimeAvailable).toBe(true);
        expect(journey.realtimeObserved).toBe(true);
        expect(journey.realtimeStatus).toBe("live");
        expect(journey.status).toBe("in_transit");
        expect(journey.delaySeconds).toBe(840);
        expect(journey.matchMethod).toBe("ALSA_TRACKING_BUS_API");
        expect(journey.matchConfidence).toBe(1);
        expect(journey.stops[0]?.actualDepartureAt).toBe("2026-09-07T05:03:00.000Z");
        expect(journey.stops[0]?.phase).toBe("passed");
        expect(journey.stops[1]?.expectedArrivalAt).toBe("2026-09-07T10:04:00.000Z");
        expect(journey.stops[1]?.arrivalStatus).toBe("DELAYED");
        expect(journey.vehiclePositions).toEqual([{
            id: "alsa-1",
            latitude: 42.024962864,
            longitude: -3.764288023,
            receivedAt: "2026-09-07T09:30:00.000Z"
        }]);
        expect(JSON.stringify(journey)).not.toContain("8997MZG");
        expect(journey.stops[0]?.location).toEqual({ latitude: 40, longitude: -3 });
    });

    it("conserve tous les véhicules valides et les coordonnées précises des arrêts GTFS", () =>
    {
        const realtime = parseAlsaTrackingResponse(trackingPayload(), { flight: "54", originId: "5155", destinationId: "365" }, realtimeRequest())[0]!;
        realtime.vehicles.push(
            { registration: null, latitude: 0, longitude: 0 },
            { registration: null, latitude: 95, longitude: -3 },
            { registration: null, latitude: 42.1, longitude: -3.7 }
        );
        const scheduled = scheduledJourney();
        scheduled.stops[0]!.location = { latitude: 40.438, longitude: -3.676 };
        const result = enrichAlsaJourney(scheduled, { status: "live", journey: realtime });
        expect(result.vehiclePositions).toHaveLength(2);
        expect(result.stops[0]?.location).toEqual(scheduled.stops[0]!.location);
        expect(enrichAlsaJourney({ ...scheduled, serviceNumber: "999" }, { status: "live", journey: realtime }).vehiclePositions).toBeUndefined();
    });

    it("conserve l’horaire prévu et expose l’absence de suivi pour le véhicule", () =>
    {
        const journey = enrichAlsaJourney(scheduledJourney(), {
            status: "not_offered",
            journey: null
        });

        expect(journey.realtimeAvailable).toBe(true);
        expect(journey.realtimeObserved).toBe(false);
        expect(journey.realtimeStatus).toBe("not_offered");
        expect(journey.matchMethod).toBe("GTFS_SCHEDULE");
    });

    it("lit la liste des circulations et choisit les villes dans le bon pays", () =>
    {
        const result = parseAlsaSearchHtml(searchHtml());
        const locations = [
            { id: "90042", name: "París (Tous les arrêts)", provinceCountryName: "France" },
            { id: "7006", name: "Paris", provinceCountryName: "Texas, États-Unis" },
            { id: "90365", name: "Bilbao (Tous les arrêts)", provinceCountryName: "Bizkaia, Espagne" }
        ];

        expect(result?.legs).toHaveLength(1);
        expect(result?.legs[0]).toEqual(expect.objectContaining({ service: "3235", flight: "54" }));
        expect(matchAlsaTrackingLocation("Paris", "FR", locations)?.id).toBe("90042");
        expect(matchAlsaTrackingLocation("Bilbao", "ES", locations)?.id).toBe("90365");
    });

    it("n’interroge pas ALSA pour une circulation future", async () =>
    {
        vi.stubEnv("ALSA_REALTIME_ENABLED", "true");
        const fetchImplementation = vi.fn(async () => new Response(null, { status: 500 }));
        const client = new AlsaRealtimeClient(
            fetchImplementation,
            () => new Date("2026-09-07T09:30:00Z")
        );
        const request = {
            ...realtimeRequest(),
            cacheKey: "future",
            serviceDate: "2026-09-08",
            departureAt: "2026-09-08T05:00:00.000Z",
            arrivalAt: "2026-09-08T09:50:00.000Z"
        };

        expect(await client.loadJourney(request)).toEqual({
            status: "outside_tracking_period",
            journey: null
        });
        expect(fetchImplementation).not.toHaveBeenCalled();
    });

    it("refuse de laisser croître indéfiniment la file des fournisseurs", async () =>
    {
        vi.stubEnv("ALSA_REALTIME_ENABLED", "true");
        vi.stubEnv("ALSA_REALTIME_CONCURRENCY", "1");
        vi.stubEnv("ALSA_REALTIME_QUEUE_LIMIT", "1");
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) =>
        {
            release = resolve;
        });
        const client = new AlsaRealtimeClient(async () =>
        {
            await gate;
            return new Response(null,
            {
                status: 302,
                headers: { Location: "https://alsa.queue-it.net/" }
            });
        }, () => new Date("2026-09-07T09:30:00Z"));
        const first = client.loadJourney({ ...realtimeRequest(), cacheKey: "first" });
        await Promise.resolve();
        const second = client.loadJourney({ ...realtimeRequest(), cacheKey: "second" });
        await Promise.resolve();
        const rejected = client.loadJourney({ ...realtimeRequest(), cacheKey: "third" });

        await expect(rejected).rejects.toBeInstanceOf(WorkQueueFullError);
        release();
        await expect(first).resolves.toEqual({ status: "temporarily_unavailable", journey: null });
        await expect(second).resolves.toEqual({ status: "temporarily_unavailable", journey: null });
    });

    it("continue de chercher le suivi après minuit pour un trajet de nuit", async () =>
    {
        vi.stubEnv("ALSA_REALTIME_ENABLED", "true");
        const fetchImplementation = vi.fn(async () =>
        {
            return new Response(null,
            {
                status: 302,
                headers: {
                    Location: "https://alsa.queue-it.net/?c=alsa&e=streamingibai"
                }
            });
        });
        const client = new AlsaRealtimeClient(
            fetchImplementation,
            () => new Date("2026-09-08T09:30:00Z")
        );
        const request = {
            ...realtimeRequest(),
            serviceDate: "2026-09-07",
            departureAt: "2026-09-07T17:00:00.000Z",
            arrivalAt: "2026-09-08T13:15:00.000Z"
        };

        expect(await client.loadJourney(request)).toEqual({
            status: "temporarily_unavailable",
            journey: null
        });
        expect(fetchImplementation).toHaveBeenCalledTimes(1);
    });

    it("abandonne immédiatement lorsque le suivi ALSA active Queue-it", async () =>
    {
        vi.stubEnv("ALSA_REALTIME_ENABLED", "true");
        const fetchImplementation = vi.fn(async () =>
        {
            return new Response(null,
            {
                status: 302,
                headers: {
                    Location: "https://alsa.queue-it.net/?c=alsa&e=streamingibai"
                }
            });
        });
        const client = new AlsaRealtimeClient(
            fetchImplementation,
            () => new Date("2026-09-07T09:30:00Z")
        );

        expect(await client.loadJourney(realtimeRequest())).toEqual({
            status: "temporarily_unavailable",
            journey: null
        });
        expect(await client.loadJourney(realtimeRequest())).toEqual({
            status: "temporarily_unavailable",
            journey: null
        });
        expect(fetchImplementation).toHaveBeenCalledTimes(1);
    });

    it("respecte un budget total lorsque le suivi ALSA ne répond pas", async () =>
    {
        vi.stubEnv("ALSA_REALTIME_ENABLED", "true");
        vi.stubEnv("ALSA_REALTIME_BUDGET_MS", "20");
        const fetchImplementation = vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
        {
            return new Promise<Response>((_resolve, reject) =>
            {
                init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
            });
        });
        const client = new AlsaRealtimeClient(
            fetchImplementation,
            () => new Date("2026-09-07T09:30:00Z")
        );

        expect(await client.loadJourney(realtimeRequest())).toEqual({
            status: "temporarily_unavailable",
            journey: null
        });
        expect(fetchImplementation).toHaveBeenCalledTimes(1);
    });

    it("distingue un véhicule pour lequel Alsa ne propose pas de suivi", async () =>
    {
        vi.stubEnv("ALSA_REALTIME_ENABLED", "true");
        const fetchImplementation = vi.fn(async (input: string | URL | Request) =>
        {
            const url = input instanceof Request ? input.url : input.toString();

            if (url === trackerUrl)
            {
                return new Response(bootstrapHtml(),
                {
                    headers: { "Set-Cookie": "JSESSIONID=session-test; Path=/; HttpOnly" }
                });
            }

            if (url.includes("JsonGetOrigins"))
            {
                return Response.json([
                    { id: "90155", name: "Madrid (Tous les arrêts)", provincecountryName: "Madrid, Espagne" },
                    { id: "90365", name: "Bilbao (Tous les arrêts)", provincecountryName: "Bizkaia, Espagne" }
                ]);
            }

            if (url.includes("trackingBusTrayectoAction"))
            {
                return new Response(searchHtml());
            }

            if (url.includes("AjaxGetBusServiceTracking"))
            {
                return Response.json([]);
            }

            return new Response(null, { status: 404 });
        });
        const client = new AlsaRealtimeClient(
            fetchImplementation,
            () => new Date("2026-09-07T09:30:00Z")
        );

        expect(await client.loadJourney(realtimeRequest())).toEqual({
            status: "not_offered",
            journey: null
        });
    });
});

const trackerUrl = "https://www.alsa.com/fr/a-bord/localisez-votre-bus";

function bootstrapHtml(): string
{
    return `<script>params["byJourney"] = "${trackerUrl}?p_p_id=TrackingBusPortlet_WAR_Alsaportlet&p_p_lifecycle=1&_TrackingBusPortlet_WAR_Alsaportlet_javax.portlet.action=trackingBusTrayectoAction&p_auth=test";</script>`;
}

function searchHtml(): string
{
    const payload = JSON.stringify({
        navegaliaList: [
            {
                legs: [
                    {
                        departureDate: "07/09/2026",
                        departureTime: "07:00",
                        arrivalDate: "07/09/2026",
                        arrivalTime: "11:50",
                        headerDate: "07/09/2026",
                        service: "3235",
                        flight: "54",
                        legOriginId: "5155",
                        legDestinationId: "365"
                    }
                ]
            }
        ]
    });
    const resourceUrl = `${trackerUrl}?p_p_id=TrackingBusPortlet_WAR_Alsaportlet&p_p_lifecycle=2&p_p_resource_id=AjaxGetBusServiceTracking`;
    return `<script>params["jsonTrackingBus"] = '${payload}'; params["getBusServiceTrackingURL"] = "${resourceUrl}";</script>`;
}

function realtimeRequest(): AlsaRealtimeRequest
{
    return {
        cacheKey: "alsa:madrid-bilbao:2026-09-07",
        serviceNumber: "3235",
        serviceDate: "2026-09-07",
        departureAt: "2026-09-07T05:00:00.000Z",
        arrivalAt: "2026-09-07T09:50:00.000Z",
        origin: {
            name: "Madrid - Intercambiador Avenida de América",
            city: "Madrid",
            countryCode: "ES",
            timezone: "Europe/Madrid"
        },
        destination: {
            name: "Bilbao - Intermodal",
            city: "Bilbao",
            countryCode: "ES",
            timezone: "Europe/Madrid"
        }
    };
}

function trackingPayload(): unknown
{
    return [
        {
            codLinea: "3235",
            nomLinea: "MADRID-BILBAO",
            itinerario: [
                trackingStop("5155", "MADRID (INTERCAM AV.AMERICA)", "07:00", "07:00", "1",
                {
                    realArrivalTime: "07:00h*",
                    realDepartureTime: "07:03h*"
                }),
                trackingStop("4003", "ARANDA DE DUERO", "08:40", "08:40", "1",
                {
                    realArrivalTime: "08:41h*",
                    realDepartureTime: "08:46h*"
                }),
                trackingStop("2053", "LERMA", "09:10", "09:40", "1", { estDate: "09:34" }),
                trackingStop("365", "BILBAO", "11:50", "11:50", "0", { estDate: "12:04" })
            ],
            buses: [
                {
                    matricula: "8997MZG",
                    latitud: "42.024962864",
                    longitud: "-3.764288023"
                }
            ]
        }
    ];
}

function trackingStop(
    pueblo: string,
    nomPueblo: string,
    hllegada: string,
    hsalida: string,
    visitada: string,
    extra: Record<string, string>
): unknown
{
    return {
        pueblo,
        nomPueblo,
        fecha: "20260907",
        hllegada,
        hsalida,
        visitada,
        latitud: "40.000000",
        longitud: "-3.000000",
        ...extra
    };
}

function scheduledJourney(): JourneyView
{
    return {
        journeyRef: "alsa:madrid-bilbao:2026-09-07",
        serviceNumber: "3235",
        serviceDate: "2026-09-07",
        operatorSlug: "alsa",
        operatorName: "Alsa",
        realtimeAvailable: true,
        realtimeObserved: false,
        realtimeStatus: "scheduled_only",
        originStopId: "alsa:ESMAD",
        originName: "Madrid - Intercambiador Avenida de América",
        originCity: "Madrid",
        destinationStopId: "alsa:ESBIO",
        destinationName: "Bilbao - Intermodal",
        destinationCity: "Bilbao",
        status: "scheduled",
        delaySeconds: null,
        updatedAt: "2026-09-07T04:00:00.000Z",
        cancelled: false,
        completeStopSequence: true,
        matchConfidence: null,
        matchMethod: "GTFS_SCHEDULE",
        scheduledTripId: "madrid-bilbao",
        punctuality: null,
        stops: [
            scheduledStop("alsa:ESMAD", "Madrid", 1, "2026-09-07T05:00:00.000Z"),
            scheduledStop("alsa:ESBIO", "Bilbao", 2, "2026-09-07T09:50:00.000Z")
        ]
    };
}

function scheduledStop(stopId: string, city: string, order: number, time: string): JourneyView["stops"][number]
{
    return {
        stopId,
        name: city,
        city,
        order,
        phase: order === 1 ? "passed" : "upcoming",
        aimedArrivalAt: time,
        expectedArrivalAt: null,
        actualArrivalAt: null,
        aimedDepartureAt: time,
        expectedDepartureAt: null,
        actualDepartureAt: null,
        arrivalStatus: null,
        departureStatus: null,
        delaySeconds: null,
        cancelled: false
    };
}

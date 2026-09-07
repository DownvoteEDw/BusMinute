import { afterEach, describe, expect, it, vi } from "vitest";
import { AlsaDataSource } from "../../src/providers/alsa/data-source.js";

describe("source d’horaires Alsa", () =>
{
    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    it("construit un flux planifié avec les seuls segments Alsa qui touchent la France", async () =>
    {
        vi.stubEnv("ALSA_SERVICE_DAYS", "1");
        vi.stubEnv("ALSA_ORIGIN_BATCH_SIZE", "100");
        vi.stubEnv("ALSA_DESTINATION_BATCH_SIZE", "100");
        const requestedUrls: URL[] = [];
        const fetchImplementation = vi.fn(async (input: string | URL | Request) =>
        {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            requestedUrls.push(url);
            const payload = url.pathname.includes("suggestion-service")
                ? locationsPayload()
                : connectionsPayload();
            return new Response(JSON.stringify(payload), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        });
        const dataSource = new AlsaDataSource(
            fetchImplementation,
            () => new Date("2026-09-07T10:00:00Z")
        );

        const feed = await dataSource.loadGtfs();

        expect(requestedUrls).toHaveLength(3);
        expect(requestedUrls.filter((url) => url.pathname.includes("connections"))).toHaveLength(2);
        expect(feed.agencies).toEqual([
            expect.objectContaining({ externalId: "AOWL", name: "Alsa", timezone: "Europe/Paris" })
        ]);
        expect(feed.stops).toEqual(expect.arrayContaining([
            expect.objectContaining({ externalId: "FRPARPGB", name: "Paris - Gare de Bercy Seine" }),
            expect.objectContaining({ externalId: "ESBCNEDA", name: "Barcelone - Gare routière Nord" })
        ]));
        expect(feed.routes).toEqual([
            expect.objectContaining({ shortName: "33867", type: 3, color: "3EC8EC" })
        ]);
        expect(feed.trips).toHaveLength(1);
        expect(feed.trips[0]).toMatchObject({
            externalId: "AOWL-FRPARPGB-ESBCNEDA-2026-09-07T23:30-2026-09-08T07:00-0",
            serviceNumber: "33867",
            stopTimes: [
                { stopExternalId: "FRPARPGB", departureSeconds: 84_600 },
                { stopExternalId: "ESBCNEDA", arrivalSeconds: 111_600 }
            ]
        });
        expect(feed.calendars).toEqual([
            expect.objectContaining({ externalId: "AOWL:2026-09-07", monday: true })
        ]);
    });
});

function locationsPayload(): unknown
{
    return {
        locations: [
            {
                type: "city",
                code: "FRPAR",
                countryCode: "FR",
                names: [{ languageCode: "fr", name: "Paris" }],
                childrenLocations: [
                    {
                        type: "station",
                        code: "FRPARPGB",
                        countryCode: "FR",
                        names: [{ languageCode: "fr", name: "Paris Gare de Bercy Seine" }],
                        carrierMetadata: [{ carrierCode: "AOWL" }]
                    }
                ]
            },
            {
                type: "city",
                code: "ESBCN",
                countryCode: "ES",
                names: [{ languageCode: "fr", name: "Barcelone" }],
                childrenLocations: [
                    {
                        type: "station",
                        code: "ESBCNEDA",
                        countryCode: "ES",
                        names: [{ languageCode: "fr", name: "Barcelone Gare routière Nord" }],
                        carrierMetadata: [{ carrierCode: "AOWL" }]
                    }
                ]
            }
        ]
    };
}

function connectionsPayload(): unknown
{
    return {
        included: [
            city("FRPAR", "Paris"),
            city("ESBCN", "Barcelone"),
            station("FRPARPGB", "Paris Gare de Bercy Seine", "FRPAR", "Europe/Paris", 48.8356869, 2.3801607),
            station("ESBCNEDA", "Barcelone Gare routière Nord", "ESBCN", "Europe/Madrid", 41.3946833, 2.1828769),
            segment(
                "AOWL-FRPARPGB-ESBCNEDA-2026-09-07T23:30-2026-09-08T07:00-0",
                "AOWL",
                "FRPARPGB",
                "ESBCNEDA",
                "33867",
                "2026-09-07T23:30",
                "2026-09-08T07:00"
            ),
            segment(
                "BLAB-FRPARPGB-ESBCNEDA-2026-09-07T12:00-2026-09-07T22:00-0",
                "BLAB",
                "FRPARPGB",
                "ESBCNEDA",
                "50025",
                "2026-09-07T12:00",
                "2026-09-07T22:00"
            ),
            segment(
                "AOWL-ESBCNEDA-ESMADZOB-2026-09-07T12:00-2026-09-07T20:00-0",
                "AOWL",
                "ESBCNEDA",
                "ESMADZOB",
                "1000",
                "2026-09-07T12:00",
                "2026-09-07T20:00"
            )
        ]
    };
}

function city(id: string, name: string): unknown
{
    return {
        id,
        type: "cities",
        attributes: { code: id, name }
    };
}

function station(
    id: string,
    name: string,
    cityId: string,
    timezone: string,
    latitude: number,
    longitude: number
): unknown
{
    return {
        id,
        type: "stations",
        attributes: {
            code: id,
            name,
            description: "",
            time_zone: timezone,
            latitude,
            longitude
        },
        relationships: {
            city: { data: { id: cityId, type: "cities" } }
        }
    };
}

function segment(
    id: string,
    carrier: string,
    departureStation: string,
    arrivalStation: string,
    line: string,
    departureTime: string,
    arrivalTime: string
): unknown
{
    return {
        id,
        type: "segments",
        attributes: {
            line,
            departure_time: departureTime,
            arrival_time: arrivalTime
        },
        relationships: {
            marketing_carrier: { data: { id: carrier, type: "marketing_carriers" } },
            departure_station: { data: { id: departureStation, type: "stations" } },
            arrival_station: { data: { id: arrivalStation, type: "stations" } }
        }
    };
}

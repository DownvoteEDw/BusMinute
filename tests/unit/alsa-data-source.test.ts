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
            externalId: "AOWL:33867:departure:FRPARPGB:2026-09-07T23:30",
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

    it("regroupe les destinations vendues séparément qui appartiennent à la même course", async () =>
    {
        vi.stubEnv("ALSA_SERVICE_DAYS", "1");
        vi.stubEnv("ALSA_ORIGIN_BATCH_SIZE", "100");
        vi.stubEnv("ALSA_DESTINATION_BATCH_SIZE", "100");
        const fetchImplementation = vi.fn(async (input: string | URL | Request) =>
        {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            const payload = url.pathname.includes("suggestion-service")
                ? duplicateLocationsPayload()
                : duplicateConnectionsPayload();
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
        const service33169 = feed.trips.filter((trip) => trip.serviceNumber === "33169");
        const service33170 = feed.trips.filter((trip) => trip.serviceNumber === "33170");
        const service33861 = feed.trips.filter((trip) => trip.serviceNumber === "33861");

        expect(service33169).toHaveLength(1);
        expect(service33169[0]).toMatchObject({
            externalId: "AOWL:33169:departure:FRPARPGB:2026-09-07T17:00",
            headsign: "Madrid - Estación Sur",
            stopTimes: [
                { stopExternalId: "FRPARPGB", departureSeconds: 61_200 },
                { stopExternalId: "FRBODBRD", arrivalSeconds: 88_800 },
                { stopExternalId: "FRBAYBBU", arrivalSeconds: 97_500 },
                { stopExternalId: "ESEASCBS", arrivalSeconds: 101_400 },
                { stopExternalId: "ESMADZOB", arrivalSeconds: 121_500 }
            ]
        });
        expect(service33861).toHaveLength(1);
        expect(service33861[0]?.stopTimes.map((stopTime) => stopTime.stopExternalId)).toEqual([
            "FRPARPGB",
            "ESBCNEDA"
        ]);
        expect(service33170).toHaveLength(1);
        expect(service33170[0]).toMatchObject({
            externalId: "AOWL:33170:arrival:FRPARPGB:2026-09-08T05:00",
            stopTimes: [
                { stopExternalId: "ESMADZOB" },
                { stopExternalId: "FRBAYBBU" },
                { stopExternalId: "FRBODBRD" },
                { stopExternalId: "FRPARPGB" }
            ]
        });
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

function duplicateLocationsPayload(): unknown
{
    return {
        locations: [
            location("FRPAR", "FR", "Paris", "FRPARPGB", "Paris Gare de Bercy Seine"),
            location("FRBOD", "FR", "Bordeaux", "FRBODBRD", "Bordeaux Gare routière"),
            location("FRBAY", "FR", "Bayonne", "FRBAYBBU", "Bayonne Place des Basques"),
            location("ESEAS", "ES", "Saint-Sébastien", "ESEASCBS", "Saint-Sébastien Gare routière"),
            location("ESMAD", "ES", "Madrid", "ESMADZOB", "Madrid Estación Sur"),
            location("ESBCN", "ES", "Barcelone", "ESBCNEDA", "Barcelone Gare routière Nord")
        ]
    };
}

function duplicateConnectionsPayload(): unknown
{
    return {
        included: [
            city("FRPAR", "Paris"),
            city("FRBOD", "Bordeaux"),
            city("FRBAY", "Bayonne"),
            city("ESEAS", "Saint-Sébastien"),
            city("ESMAD", "Madrid"),
            city("ESBCN", "Barcelone"),
            station("FRPARPGB", "Paris Gare de Bercy Seine", "FRPAR", "Europe/Paris", 48.8356869, 2.3801607),
            station("FRBODBRD", "Bordeaux Gare routière", "FRBOD", "Europe/Paris", 44.825, -0.556),
            station("FRBAYBBU", "Bayonne Place des Basques", "FRBAY", "Europe/Paris", 43.493, -1.475),
            station("ESEASCBS", "Saint-Sébastien Gare routière", "ESEAS", "Europe/Madrid", 43.318, -1.981),
            station("ESMADZOB", "Madrid Estación Sur", "ESMAD", "Europe/Madrid", 40.395, -3.678),
            station("ESBCNEDA", "Barcelone Gare routière Nord", "ESBCN", "Europe/Madrid", 41.395, 2.183),
            segment(
                "AOWL-FRPARPGB-FRBODBRD-2026-09-07T17:00-2026-09-08T00:40-0",
                "AOWL",
                "FRPARPGB",
                "FRBODBRD",
                "33169",
                "2026-09-07T17:00",
                "2026-09-08T00:40"
            ),
            segment(
                "AOWL-FRPARPGB-FRBAYBBU-2026-09-07T17:00-2026-09-08T03:05-0",
                "AOWL",
                "FRPARPGB",
                "FRBAYBBU",
                "33169",
                "2026-09-07T17:00",
                "2026-09-08T03:05"
            ),
            segment(
                "AOWL-FRPARPGB-ESEASCBS-2026-09-07T17:00-2026-09-08T04:10-0",
                "AOWL",
                "FRPARPGB",
                "ESEASCBS",
                "33169",
                "2026-09-07T17:00",
                "2026-09-08T04:10"
            ),
            segment(
                "AOWL-FRPARPGB-ESMADMAD-2026-09-07T17:00-2026-09-08T13:40-0",
                "AOWL",
                "FRPARPGB",
                "ESEASCBS",
                "33169",
                "2026-09-07T17:00",
                "2026-09-08T04:10"
            ),
            segment(
                "AOWL-FRPARPGB-ESMADZOB-2026-09-07T17:00-2026-09-08T09:45-0",
                "AOWL",
                "FRPARPGB",
                "ESMADZOB",
                "33169",
                "2026-09-07T17:00",
                "2026-09-08T09:45"
            ),
            segment(
                "AOWL-FRPARPGB-ESMADMAD-2026-09-07T17:00-2026-09-08T14:50-0",
                "AOWL",
                "FRPARPGB",
                "ESBCNEDA",
                "33861",
                "2026-09-07T17:00",
                "2026-09-08T06:44"
            ),
            segment(
                "AOWL-FRPARPGB-ESMADZOB-2026-09-07T17:00-2026-09-08T17:05-0",
                "AOWL",
                "FRPARPGB",
                "ESBCNEDA",
                "33861",
                "2026-09-07T17:00",
                "2026-09-08T06:44"
            ),
            segment(
                "AOWL-ESMADZOB-FRPARPGB-2026-09-07T10:00-2026-09-08T05:00-0",
                "AOWL",
                "ESMADZOB",
                "FRPARPGB",
                "33170",
                "2026-09-07T10:00",
                "2026-09-08T05:00"
            ),
            segment(
                "AOWL-FRBAYBBU-FRPARPGB-2026-09-07T20:00-2026-09-08T05:00-0",
                "AOWL",
                "FRBAYBBU",
                "FRPARPGB",
                "33170",
                "2026-09-07T20:00",
                "2026-09-08T05:00"
            ),
            segment(
                "AOWL-FRBODBRD-FRPARPGB-2026-09-07T23:00-2026-09-08T05:00-0",
                "AOWL",
                "FRBODBRD",
                "FRPARPGB",
                "33170",
                "2026-09-07T23:00",
                "2026-09-08T05:00"
            )
        ]
    };
}

function location(
    cityId: string,
    countryCode: string,
    cityName: string,
    stationId: string,
    stationName: string
): unknown
{
    return {
        type: "city",
        code: cityId,
        countryCode,
        names: [{ languageCode: "fr", name: cityName }],
        childrenLocations: [
            {
                type: "station",
                code: stationId,
                countryCode,
                names: [{ languageCode: "fr", name: stationName }],
                carrierMetadata: [{ carrierCode: "AOWL" }]
            }
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

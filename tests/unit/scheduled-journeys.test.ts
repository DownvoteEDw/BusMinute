import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BlaBlaCarGtfsImporter } from "../../src/providers/blablacar/gtfs/importer.js";
import { buildScheduledJourneyView } from "../../src/application/scheduled-journeys.js";
import { flixBusOperator } from "../../src/application/operators.js";

describe("conversion des horaires GTFS", () =>
{
    it.each(
    [
        ["2026-09-05", "2026-09-06T01:30:00.000Z"],
        ["2026-03-29", "2026-03-30T02:30:00.000Z"],
        ["2026-10-25", "2026-10-26T01:30:00.000Z"]
    ])("conserve les passages après minuit et le fuseau le %s", async (date, expected) =>
    {
        const feed = await new BlaBlaCarGtfsImporter().import(
            fileURLToPath(new URL("../fixtures/gtfs-flixbus", import.meta.url))
        );
        const agency = feed.agencies[0];
        const trip = feed.trips[0];

        if (!agency || !trip)
        {
            throw new Error("Fixture GTFS incomplète");
        }

        agency.timezone = "Europe/Paris";
        const overnightTrip =
        {
            ...trip,
            stopTimes: trip.stopTimes.map((stop, index) =>
            {
                const seconds = index === 0 ? 23 * 3600 : 27.5 * 3600;
                return { ...stop, arrivalSeconds: seconds, departureSeconds: seconds };
            })
        };
        const journey = buildScheduledJourneyView(feed, overnightTrip, date, flixBusOperator, new Date(expected));
        expect(journey?.stops[1]?.aimedArrivalAt).toBe(expected);
        expect(journey?.stops[0]?.phase).toBe("passed");
        expect(journey?.stops[1]?.phase).toBe("current");
    });
});

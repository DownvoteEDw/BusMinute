import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BlaBlaCarGtfsImporter } from "../../src/providers/blablacar/gtfs/importer.js";
import { BlaBlaCarSiriParser } from "../../src/providers/blablacar/siri/parser.js";
import { GtfsSiriTripMatcher } from "../../src/services/trip-matcher.js";

const gtfsPath = fileURLToPath(new URL("../fixtures/gtfs-50819", import.meta.url));
const siriPath = fileURLToPath(new URL("../fixtures/siri-50819-2026-08-22.json", import.meta.url));

describe("circulation réelle 50819:2026-08-22", () =>
{
    it("importe, normalise et associe Paris Bercy à Tours sans ambiguïté", async () =>
    {
        const feed = await new BlaBlaCarGtfsImporter().import(gtfsPath);
        const payload = JSON.parse(await readFile(siriPath, "utf8")) as unknown;
        const timetable = new BlaBlaCarSiriParser().parse(payload);
        const journey = timetable.journeys.find((candidate) =>
        {
            return candidate.journeyRef === "50819:2026-08-22";
        });

        expect(journey).toBeDefined();

        if (!journey)
        {
            return;
        }

        const result = new GtfsSiriTripMatcher().match(feed, journey);

        expect(result.status).toBe("matched");
        expect(result.match?.trip.externalId).toBe("7672428505");
        expect(result.match?.trip.serviceNumber).toBe("50819");
        expect(result.match?.trip.stopTimes.map((stopTime) => stopTime.stopExternalId)).toEqual([
            "XPB",
            "XOS",
            "XTO"
        ]);
        expect(result.match?.method).toBe("SERVICE_NUMBER_DATE_STOP_SEQUENCE_TIMES");
        expect(result.match?.score.total).toBe(1);
        expect(result.match?.score.comparedTimetableValues).toBe(4);
        expect(result.match?.score.averageTimetableDifferenceSeconds).toBe(0);
    });

    it("préserve les observations temps réel propres à chaque arrêt", async () =>
    {
        const payload = JSON.parse(await readFile(siriPath, "utf8")) as unknown;
        const journey = new BlaBlaCarSiriParser().parse(payload).journeys[0];

        expect(journey?.calls.map((call) => call.stopPointRef)).toEqual(["XPB", "XOS", "XTO"]);
        expect(delaySeconds(journey?.calls[0]?.actualDepartureTime, journey?.calls[0]?.aimedDepartureTime)).toBe(331);
        expect(delaySeconds(journey?.calls[1]?.actualArrivalTime, journey?.calls[1]?.aimedArrivalTime)).toBe(-239);
        expect(delaySeconds(journey?.calls[2]?.actualArrivalTime, journey?.calls[2]?.aimedArrivalTime)).toBe(-544);
    });
});

function delaySeconds(actual: Date | null | undefined, aimed: Date | null | undefined): number | null
{
    if (!actual || !aimed)
    {
        return null;
    }

    return (actual.getTime() - aimed.getTime()) / 1000;
}

import { readFile } from "node:fs/promises";
import { BlaBlaCarGtfsImporter } from "../providers/blablacar/gtfs/importer.js";
import { BlaBlaCarSiriParser } from "../providers/blablacar/siri/parser.js";
import { GtfsSiriTripMatcher } from "../services/trip-matcher.js";

async function main(): Promise<void>
{
    const [gtfsPath, siriPath, requestedJourneyRef] = process.argv.slice(2);

    if (!gtfsPath || !siriPath)
    {
        throw new Error("Usage : npm run match -- <gtfs.zip|dossier> <siri.json> [journey-ref]");
    }

    const feed = await new BlaBlaCarGtfsImporter().import(gtfsPath);
    const payload = JSON.parse(await readFile(siriPath, "utf8")) as unknown;
    const timetable = new BlaBlaCarSiriParser().parse(payload);
    const journey = requestedJourneyRef
        ? timetable.journeys.find((candidate) => candidate.journeyRef === requestedJourneyRef)
        : timetable.journeys[0];

    if (!journey)
    {
        throw new Error(`Circulation SIRI introuvable : ${requestedJourneyRef ?? "première circulation"}`);
    }

    const result = new GtfsSiriTripMatcher().match(feed, journey);
    const output = {
        status: result.status,
        journeyRef: result.journeyRef,
        serviceNumber: result.serviceNumber,
        serviceDate: result.serviceDate,
        tripId: result.match?.trip.externalId ?? null,
        method: result.match?.method ?? null,
        score: result.match?.score ?? null,
        stops: result.match?.trip.stopTimes.map((stopTime) => stopTime.stopExternalId) ?? [],
        reason: result.reason
    };

    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error: unknown) =>
{
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
});

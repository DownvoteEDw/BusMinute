import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { BlaBlaCarGtfsImporter } from "../../src/providers/blablacar/gtfs/importer.js";
import { isServiceActive } from "../../src/providers/blablacar/gtfs/service-calendar.js";
import { filterFlixBusFeed } from "../../src/providers/flixbus/data-source.js";

const gtfsPath = fileURLToPath(new URL("../fixtures/gtfs-50819", import.meta.url));
const flixBusGtfsPath = fileURLToPath(new URL("../fixtures/gtfs-flixbus", import.meta.url));

describe("BlaBlaCarGtfsImporter", () =>
{
    it("importe aussi une archive GTFS ZIP", async () =>
    {
        const temporaryDirectory = await mkdtemp(join(tmpdir(), "blablabus-gtfs-"));
        const archivePath = join(temporaryDirectory, "gtfs.zip");

        try
        {
            const archive = new AdmZip();
            archive.addLocalFolder(gtfsPath);
            archive.writeZip(archivePath);
            const feed = await new BlaBlaCarGtfsImporter().import(archivePath);

            expect(feed.agencies[0]?.timezone).toBe("Europe/Paris");
            expect(feed.stops).toHaveLength(3);
            expect(feed.trips).toHaveLength(9);
            expect(feed.trips[0]?.stopTimes).toHaveLength(3);
        }
        finally
        {
            await rm(temporaryDirectory, { recursive: true, force: true });
        }
    });

    it("sélectionne le calendrier actif à la date de circulation", async () =>
    {
        const feed = await new BlaBlaCarGtfsImporter().import(gtfsPath);
        const current = feed.calendars.find((calendar) => calendar.externalId === "7672428505");
        const future = feed.calendars.find((calendar) => calendar.externalId === "3007527339");

        expect(current).toBeDefined();
        expect(future).toBeDefined();

        if (!current || !future)
        {
            return;
        }

        expect(isServiceActive(current, feed.calendarExceptions, "2026-08-22")).toBe(true);
        expect(isServiceActive(future, feed.calendarExceptions, "2026-08-22")).toBe(false);
    });

    it("déduit le numéro FlixBus de la ligne et exclut FlixTrain", async () =>
    {
        const imported = await new BlaBlaCarGtfsImporter().import(flixBusGtfsPath);
        const feed = filterFlixBusFeed(imported);

        expect(feed.agencies.map((agency) => agency.externalId)).toEqual(["FLIXBUS-eu"]);
        expect(feed.routes.map((route) => route.externalId)).toEqual(["1606", "9901"]);
        expect(feed.trips).toHaveLength(2);
        expect(feed.trips.map((trip) => trip.serviceNumber)).toEqual(["1606", "9901"]);
    });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JourneyPublications, withPublicJourneyUrl } from "../../src/application/journey-publications.js";
import { busServicePath, journeyPath, publicJourneyId } from "../../src/application/journey-url.js";
import type { JourneyView } from "../../src/application/journey-view.js";

const directories: string[] = [];

afterEach(async () =>
{
    for (const directory of directories.splice(0))
    {
        if (!resolve(directory).startsWith(`${resolve(tmpdir())}${sep}busminute-publications-test-`))
        {
            throw new Error("Répertoire de test inattendu");
        }
        await rm(directory, { recursive: true, force: true });
    }
});

function journey(reference = "flixbus:1606-trip#FR:2026-09-08"): JourneyView
{
    return {
        journeyRef: reference,
        operatorSlug: "flixbus",
        operatorName: "FlixBus",
        serviceNumber: "1606",
        serviceDate: "2026-09-08",
        originCity: "Paris",
        destinationCity: "Lyon",
        originStopId: "flixbus:paris",
        destinationStopId: "flixbus:lyon",
        originName: "Paris Bercy",
        destinationName: "Lyon Perrache",
        status: "scheduled",
        realtimeAvailable: true,
        realtimeObserved: false,
        realtimeStatus: "scheduled_only",
        delaySeconds: null,
        updatedAt: "2026-09-08T12:00:00.000Z",
        cancelled: false,
        completeStopSequence: true,
        matchConfidence: null,
        matchMethod: null,
        scheduledTripId: null,
        punctuality: null,
        stops: []
    };
}

describe("liens permanents des circulations", () =>
{
    it("distingue deux départs du même numéro et masque les identifiants transporteur", () =>
    {
        const first = withPublicJourneyUrl(journey());
        const second = withPublicJourneyUrl(journey("flixbus:another/trip#FR:2026-09-08"));
        expect(busServicePath(first)).toBe("/bus/flixbus/1606");
        expect(journeyPath(first)).toMatch(/^\/suivi\/flixbus\/1606\/2026-09-08-[a-f0-9]{20}$/);
        expect(journeyPath(first)).not.toBe(journeyPath(second));
        expect(publicJourneyId(journeyPath(first).split("/").at(-1)!)).toBe(first.publicId);
        expect(publicJourneyId("2026-09-08-../../etc")).toBeNull();
    });

    it("retrouve l’archive et le service après redémarrage sans le flux transporteur", async () =>
    {
        const directory = await mkdtemp(join(tmpdir(), "busminute-publications-test-"));
        directories.push(directory);
        const original = journey();
        const [published] = await new JourneyPublications(null, directory).publish([original]);
        const restarted = new JourneyPublications(null, directory);
        expect(await restarted.findByReference(original.journeyRef)).toEqual(published);
        expect(await restarted.findById(published!.publicId!)).toEqual(published);
        expect(await restarted.serviceExample("flixbus", "1606")).toEqual(published);
        expect(await restarted.serviceExample("blablacar-bus", "1606")).toBeNull();
        expect((await restarted.listServices()).map(busServicePath)).toContain("/bus/flixbus/1606");
        expect(await restarted.findById("../../etc")).toBeNull();
        expect(await restarted.findByReference("unknown")).toBeNull();
    });

    it("conserve la première URL et les données les plus récentes après une republication", async () =>
    {
        const directory = await mkdtemp(join(tmpdir(), "busminute-publications-test-"));
        directories.push(directory);
        const original = journey();
        const [published] = await new JourneyPublications(null, directory).publish([original]);
        const [changed] = await new JourneyPublications(null, directory).publish([{ ...original, serviceNumber: "1606-bis", updatedAt: "2026-09-08T13:00:00.000Z" }]);
        expect(changed!.publicPath).toBe(published!.publicPath);
        const restarted = new JourneyPublications(null, directory);
        await restarted.publish([original]);
        expect((await restarted.findByReference(original.journeyRef))?.serviceNumber).toBe("1606-bis");
    });
});

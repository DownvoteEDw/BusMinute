import { afterEach, describe, expect, it, vi } from "vitest";
import { transitMetadata } from "../../app/transit-metadata.js";

afterEach(() => vi.restoreAllMocks());

describe("métadonnées en cas de panne", () =>
{
    it("préserve les métadonnées complètes et protège un résultat incomplet", async () =>
    {
        const metadata = { title: "Archive", alternates: { canonical: "/suivi/archive" }, robots: { index: false, follow: true } };
        expect(await transitMetadata(async () => metadata, "/autre-url")).toBe(metadata);
        const unavailable = await transitMetadata(async () => ({ title: "Bus introuvable" }), "/bus/flixbus/9901");
        expect(unavailable.alternates?.canonical).toBe("/bus/flixbus/9901");
        expect(unavailable.robots).toEqual({ index: false, follow: true });
    });

    it("conserve la canonical et empêche l'indexation d'un résultat indisponible", async () =>
    {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const result = await transitMetadata(async () => { throw new Error("Database unavailable"); }, "/departs/paris/2026-09-10");
        expect(result.alternates?.canonical).toBe("/departs/paris/2026-09-10");
        expect(result.robots).toEqual({ index: false, follow: true });
    });

    it("laisse Next.js traiter les 404 et les redirections", async () =>
    {
        for (const digest of ["NEXT_HTTP_ERROR_FALLBACK;404", "NEXT_REDIRECT;replace;/bus/flixbus/9901;308;"])
        {
            const error = Object.assign(new Error("Routing"), { digest });
            await expect(transitMetadata(async () => { throw error; }, "/")).rejects.toBe(error);
        }
    });
});

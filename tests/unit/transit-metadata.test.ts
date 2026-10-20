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

    it("laisse remonter une panne pour répondre en 5xx plutôt qu'en noindex", async () =>
    {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const failure = new Error("Database unavailable");
        await expect(transitMetadata(async () => { throw failure; }, "/departs/paris/2026-09-10")).rejects.toBe(failure);
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

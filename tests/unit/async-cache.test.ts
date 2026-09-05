import { afterEach, describe, expect, it, vi } from "vitest";
import { AsyncCache } from "../../src/application/async-cache.js";

describe("cache des données partagées", () =>
{
    afterEach(() => vi.useRealTimers());

    it("regroupe les appels simultanés et renouvelle les données après expiration", async () =>
    {
        vi.useFakeTimers();
        const cache = new AsyncCache<number>(15_000);
        const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
        expect(await Promise.all(Array.from({ length: 20 }, () => cache.get("gare", load)))).toEqual(Array(20).fill(1));
        expect(load).toHaveBeenCalledTimes(1);
        expect(await cache.get("gare", load)).toBe(1);
        vi.advanceTimersByTime(15_000);
        expect(await cache.get("gare", load)).toBe(2);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("permet une nouvelle tentative après une panne", async () =>
    {
        const cache = new AsyncCache<number>(15_000);
        const load = vi.fn().mockRejectedValueOnce(new Error("indisponible")).mockResolvedValueOnce(2);
        await expect(cache.get("gare", load)).rejects.toThrow("indisponible");
        expect(await cache.get("gare", load)).toBe(2);
    });

    it("borne la mémoire et isole les gares", async () =>
    {
        const cache = new AsyncCache<number>(15_000, 2);
        await cache.get("paris", async () => 1);
        await cache.get("lyon", async () => 2);
        await cache.get("caen", async () => 3);
        const reload = vi.fn().mockResolvedValue(4);
        expect(await cache.get("lyon", reload)).toBe(2);
        expect(await cache.get("paris", reload)).toBe(4);
        expect(reload).toHaveBeenCalledTimes(1);
    });
});

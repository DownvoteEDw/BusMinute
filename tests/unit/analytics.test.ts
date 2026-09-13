import { afterEach, describe, expect, it, vi } from "vitest";
import { trackAnalyticsEvent } from "../../components/analytics.js";

describe("événements analytics", () =>
{
    afterEach(() =>
    {
        vi.unstubAllGlobals();
    });

    it("transmet le nom et les propriétés à Umami", () =>
    {
        const track = vi.fn();
        vi.stubGlobal("window", { umami: { track } });

        trackAnalyticsEvent("search-success", { resultType: "journey", source: "submit" });

        expect(track).toHaveBeenCalledWith("search-success", { resultType: "journey", source: "submit" });
    });

    it("reste sans effet lorsque le tracker est indisponible", () =>
    {
        vi.stubGlobal("window", {});

        expect(() => trackAnalyticsEvent("map-open", { positionType: "live" })).not.toThrow();
    });

    it("ne bloque pas l’action utilisateur lorsque le tracker échoue", () =>
    {
        vi.stubGlobal("window",
        {
            umami:
            {
                track: () =>
                {
                    throw new Error("tracker unavailable");
                }
            }
        });

        expect(() => trackAnalyticsEvent("journey-share", { method: "clipboard" })).not.toThrow();
    });
});

import { describe, expect, it } from "vitest";
import { samePhysicalStation } from "../../src/application/station-identity.js";
import type { GtfsStop } from "../../src/domain/models.js";

describe("identité des gares", () =>
{
    it("réunit les identifiants opérateur de la même gare", () =>
    {
        expect(samePhysicalStation(
            stop("XPB", "Paris - Bercy-Seine Bus Station", 48.835687, 2.380161),
            stop("flixbus-bercy", "Paris (Bercy Seine)", 48.835318, 2.380519)
        )).toBe(true);
    });

    it("ne réunit pas deux gares voisines différentes", () =>
    {
        expect(samePhysicalStation(
            stop("XPB", "Paris - Bercy-Seine Bus Station", 48.835687, 2.380161),
            stop("quai", "Paris - Quai de la Gare", 48.8371, 2.3734)
        )).toBe(false);
    });

    it("ne réunit pas deux gares trop éloignées portant le même nom", () =>
    {
        expect(samePhysicalStation(
            stop("first", "Paris - Bercy-Seine Bus Station", 48.835687, 2.380161),
            stop("second", "Paris (Bercy Seine)", 48.839, 2.380161)
        )).toBe(false);
    });
});

function stop(
    externalId: string,
    name: string,
    latitude: number,
    longitude: number
): GtfsStop
{
    return {
        externalId,
        code: null,
        name,
        description: null,
        latitude,
        longitude,
        timezone: "Europe/Paris",
        wheelchairBoarding: null
    };
}

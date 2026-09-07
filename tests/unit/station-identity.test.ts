import { describe, expect, it } from "vitest";
import { samePhysicalStation } from "../../src/application/station-identity.js";
import type { GtfsStop } from "../../src/domain/models.js";

describe("identité des gares", () =>
{
    it("réunit les identifiants opérateur de la même gare", () =>
    {
        expect(samePhysicalStation(
            stop("XPB", "Paris - Bercy-Seine Bus Station", 48.835687, 2.380161),
            stop("flixbus-bercy", "Paris (Bercy Seine)", 48.835318, 2.380519),
            "blablacar-bus",
            "flixbus"
        )).toBe(true);
    });

    it("ne réunit pas deux gares voisines différentes", () =>
    {
        expect(samePhysicalStation(
            stop("XPB", "Paris - Bercy-Seine Bus Station", 48.835687, 2.380161),
            stop("quai", "Paris - Quai de la Gare", 48.8371, 2.3734),
            "blablacar-bus",
            "flixbus"
        )).toBe(false);
    });

    it("ne réunit pas deux gares trop éloignées portant le même nom", () =>
    {
        expect(samePhysicalStation(
            stop("first", "Paris - Bercy-Seine Bus Station", 48.835687, 2.380161),
            stop("second", "Paris (Bercy Seine)", 48.839, 2.380161),
            "blablacar-bus",
            "flixbus"
        )).toBe(false);
    });

    it("réunit une gare Alsa seulement avec une correspondance vérifiée", () =>
    {
        expect(samePhysicalStation(
            stop("FRPARPGB", "Paris - Gare de Bercy Seine", 48.8356869, 2.3801607),
            stop("XPB", "Paris - Bercy-Seine Bus Station", 48.835687, 2.380161),
            "alsa",
            "blablacar-bus"
        )).toBe(true);
    });

    it("garde une gare Alsa non vérifiée séparée même si son nom et sa position correspondent", () =>
    {
        expect(samePhysicalStation(
            stop("FRPARUNKNOWN", "Paris - Bercy-Seine Bus Station", 48.835687, 2.380161),
            stop("XPB", "Paris - Bercy-Seine Bus Station", 48.835687, 2.380161),
            "alsa",
            "blablacar-bus"
        )).toBe(false);
    });

    it("refuse une correspondance Alsa vérifiée dont les coordonnées ont dérivé", () =>
    {
        expect(samePhysicalStation(
            stop("FRPARPGB", "Paris - Gare de Bercy Seine", 48.839, 2.380161),
            stop("XPB", "Paris - Bercy-Seine Bus Station", 48.835687, 2.380161),
            "alsa",
            "blablacar-bus"
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

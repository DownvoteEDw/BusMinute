import { describe, expect, it } from "vitest";
import { countLabel, localeTag, localize, normalizeLocale } from "../../src/application/i18n.js";

describe("i18n", () =>
{
    it("utilise le français par défaut", () =>
    {
        expect(normalizeLocale(undefined)).toBe("fr");
        expect(normalizeLocale("de")).toBe("fr");
        expect(localeTag("fr")).toBe("fr-FR");
    });

    it("sélectionne les textes et pluriels anglais", () =>
    {
        expect(localize("en", "Gare", "Station", "Estación")).toBe("Station");
        expect(countLabel("en", 1, "gare", "gares", "station", "stations", "estación", "estaciones")).toBe("1 station");
        expect(countLabel("en", 2, "gare", "gares", "station", "stations", "estación", "estaciones")).toBe("2 stations");
    });

    it("sélectionne les textes, la locale et les pluriels espagnols", () =>
    {
        expect(normalizeLocale("es")).toBe("es");
        expect(localeTag("es")).toBe("es-ES");
        expect(localize("es", "Gare", "Station", "Estación")).toBe("Estación");
        expect(countLabel("es", 1, "gare", "gares", "station", "stations", "estación", "estaciones")).toBe("1 estación");
        expect(countLabel("es", 2, "gare", "gares", "station", "stations", "estación", "estaciones")).toBe("2 estaciones");
    });
});

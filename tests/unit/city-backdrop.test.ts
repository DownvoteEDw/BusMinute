import { describe, expect, it } from "vitest";
import { cityBackdropVariant } from "../../components/city-backdrop.js";

describe("cityBackdropVariant", () =>
{
    it("choisit le décor de la ville même avec des accents", () =>
    {
        expect(cityBackdropVariant("Paris")).toBe("paris");
        expect(cityBackdropVariant("Genève")).toBe("geneva");
        expect(cityBackdropVariant("Barcelone - Nord")).toBe("barcelona");
    });

    it("utilise une silhouette urbaine pour une ville non illustrée", () =>
    {
        expect(cityBackdropVariant("Clermont-Ferrand")).toBe("urban");
    });
});

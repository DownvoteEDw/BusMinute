import { describe, expect, it } from "vitest";
import robots from "../../app/robots.js";

describe("robots.txt", () =>
{
    it("bloque les préchargements Next.js sans bloquer les pages", () =>
    {
        const { rules } = robots();

        expect(rules).toMatchObject({ allow: "/", disallow: expect.arrayContaining(["/*_rsc="]) });
    });
});

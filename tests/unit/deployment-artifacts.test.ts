import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("artefacts de déploiement", () =>
{
    it("assemble le serveur autonome avec ses ressources publiques", async () =>
    {
        const dockerfile = await readFile("Dockerfile", "utf8");

        expect(dockerfile).toContain("/app/.next/standalone");
        expect(dockerfile).toContain("/app/.next/static");
        expect(dockerfile).toContain("/app/public");
        expect(dockerfile).toContain("/api/health");
        expect(dockerfile).toContain("USER node");
    });

    it("déclare le site, le worker, la migration et PostgreSQL dans la stack", async () =>
    {
        const compose = await readFile("compose.yaml", "utf8");

        expect(compose).toContain("  postgres:");
        expect(compose).toContain("  migration:");
        expect(compose).toContain("  app:");
        expect(compose).toContain("  worker:");
        expect(compose).toContain("dist/src/cli/sync-worker.js");
        expect(compose).toContain("POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?");
        expect(compose).toContain("condition: service_completed_successfully");
        expect(compose).toContain("busminute-postgres:/var/lib/postgresql/data");
    });

    it("conserve les observations temps réel dans une migration dédiée", async () =>
    {
        const migration = await readFile("migrations/002_realtime_history.sql", "utf8");

        expect(migration).toContain("trip_stop_observations");
        expect(migration).toContain("data_sync_runs");
        expect(migration).toContain("source_updated_at");
    });

    it("réserve les ports publiés au développement local", async () =>
    {
        const productionCompose = await readFile("compose.yaml", "utf8");
        const localCompose = await readFile("compose.local.yaml", "utf8");

        expect(productionCompose).not.toContain("127.0.0.1:");
        expect(localCompose).toContain("127.0.0.1:${APP_PORT:-3000}:3000");
        expect(localCompose).toContain("127.0.0.1:${POSTGRES_PORT:-5432}:5432");
    });
});

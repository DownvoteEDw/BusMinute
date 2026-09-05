import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

process.env.GTFS_PATH = resolve(process.argv[3] ?? "tests/fixtures/gtfs-50819");
process.env.SIRI_PATH = resolve(process.argv[4] ?? "tests/fixtures/siri-50819-2026-08-22.json");
process.env.FLIXBUS_GTFS_ENABLED = "true";
process.env.FLIXBUS_GTFS_PATH = resolve(process.argv[2] ?? "tests/fixtures/gtfs-flixbus");
process.env.FLIXBUS_REALTIME_ENABLED = "false";
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_HOST;

const { TransitDataService } = await import("../dist/src/application/transit-data-service.js");
const service = new TransitDataService();
const operations =
[
    ["Accueil", () => Promise.all([service.getFeaturedCities(6), service.getLiveBoard(7)])],
    ["Ville Paris", () => service.getCityBoard("paris")],
    ["Gare Bercy", () => service.getStopBoard("XPB")],
    ["Recherche Paris", () => service.search("paris")]
];

for (let pass = 1; pass <= 3; pass += 1)
{
    for (const [name, run] of operations)
    {
        const start = performance.now();
        await run();
        console.log(JSON.stringify({ pass, operation: name, milliseconds: Math.round(performance.now() - start) }));
    }
}

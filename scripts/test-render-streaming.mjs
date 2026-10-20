import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const payload = JSON.stringify({ rides: [] });
let releaseTimetable;
let upstreamRequests = 0;
let upstreamResponses = 0;
const timetableGate = new Promise((resolveGate) => { releaseTimetable = resolveGate; });
const upstream = createServer(async (_request, response) =>
{
    upstreamRequests++;
    await timetableGate;
    upstreamResponses++;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(payload);
});
upstream.listen(0, "127.0.0.1");
await once(upstream, "listening");
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((done) => reservation.close(done));
const base = `http://127.0.0.1:${port}`;
let logs = "";
const temporaryDirectory = await mkdtemp(join(tmpdir(), "busminute-render-test-"));
const unavailable = process.argv.includes("--unavailable");
if (unavailable)
{
    const publicationsDirectory = `busminute-links-${createHash("sha256").update(process.cwd()).digest("hex").slice(0, 12)}`;
    await writeFile(join(temporaryDirectory, publicationsDirectory), "unavailable");
}
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)],
{
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
        ...process.env,
        NODE_ENV: "production",
        TMPDIR: temporaryDirectory,
        TMP: temporaryDirectory,
        TEMP: temporaryDirectory,
        DATABASE_URL: "",
        POSTGRES_HOST: "",
        GTFS_PATH: resolve("tests/fixtures/gtfs-50819"),
        SIRI_PATH: resolve("tests/fixtures/siri-50819-2026-08-22.json"),
        SIRI_URL: `http://127.0.0.1:${upstream.address().port}`,
        FLIXBUS_GTFS_ENABLED: "true",
        FLIXBUS_GTFS_PATH: resolve("tests/fixtures/gtfs-flixbus"),
        FLIXBUS_REALTIME_ENABLED: "true",
        FLIXBUS_REALTIME_API_KEY: "test-key",
        FLIXBUS_REALTIME_API_URL: `http://127.0.0.1:${upstream.address().port}`,
        FLIXBUS_REALTIME_BUDGET_MS: "60000",
        FLIXBUS_REALTIME_TIMEOUT_MS: "60000",
        ALSA_ENABLED: "false",
        SITE_URL: base
    }
});
server.stdout.on("data", (chunk) => { logs += chunk; });
server.stderr.on("data", (chunk) => { logs += chunk; });
const exited = once(server, "exit");

try
{
    for (let attempt = 0; ; attempt++)
    {
        assert.ok(attempt < 100 && server.exitCode === null, `Server failed to start: ${logs}`);
        try
        {
            const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) });
            if (health.ok)
            {
                break;
            }
        }
        catch
        {
        }
        await delay(100);
    }

    if (unavailable)
    {
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        for (const agent of ["Mozilla/5.0", "Googlebot", "Twitterbot"])
        {
            for (const path of ["/ville/paris", "/gares/XPB", "/trajets/paris/tours", `/departs/paris/${today}`])
            {
                const response = await fetch(`${base}${path}`, { headers: { "User-Agent": agent }, signal: AbortSignal.timeout(5_000) });
                const html = await response.text();
                assert.doesNotMatch(html, /<meta name="robots" content="[^"]*follow"/, `${agent}: a storage failure must not change indexing: ${path}`);
                if (agent === "Mozilla/5.0")
                {
                    assert.equal(response.status, 200, `${agent}: ${path}`);
                    assert.match(html, /site-header/);
                }
                else
                {
                    assert.equal(response.status, 500, `${agent}: a storage failure must be retried, not deindexed: ${path}`);
                }
            }
            const failedRoute = await fetch(`${base}/bus/flixbus/9901`, { headers: { "User-Agent": agent }, signal: AbortSignal.timeout(5_000) });
            assert.equal(failedRoute.status, 500, `${agent}: a storage failure must not become a 404`);
            assert.match(await failedRoute.text(), /<meta name="robots" content="noindex"/);
            console.log(`${agent}: unavailable data never changes indexing (crawlers get 500 and retry); failed routing returns 500, never 404`);
        }
        assert.equal(upstreamRequests, 0);
    }
    else
    {
        const wwwRedirect = await new Promise((resolveRedirect, rejectRedirect) =>
        {
            const request = httpRequest({
                hostname: "127.0.0.1",
                port,
                path: "/ville/paris?source=www",
                headers: { Host: "www.bus-minute.xyz" }
            }, resolveRedirect);
            request.on("error", rejectRedirect);
            request.end();
        });
        assert.equal(wwwRedirect.statusCode, 308);
        assert.equal(wwwRedirect.headers.location, "https://bus-minute.xyz/ville/paris?source=www");
        wwwRedirect.resume();
        const apiController = new AbortController();
        let apiFinished = false;
        const liveRequest = fetch(`${base}/api/board`, { signal: apiController.signal }).then(async (response) =>
        {
            const data = await response.json();
            apiFinished = true;
            return { response, data };
        });
        for (let attempt = 0; upstreamRequests === 0; attempt++)
        {
            assert.ok(attempt < 400, "No realtime request reached the blocked operator");
            await delay(10);
        }
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        const routes = [
            ["/", /id="station-board-title"/],
            ["/recherche?q=9901", /journey-card/],
            ["/villes", /city-directory-card/],
            ["/ville/paris", /station-card/],
            [`/departs/paris/${today}`, /journey-card/],
            ["/gares/XPB", /station-delay-legend/],
            ["/trajets/paris/tours", /journey-list-section/],
            ["/trajets/XPB/XTO", /journey-list-section/],
            ["/bus/flixbus/9901", /service-date-section/]
        ];
        let journeyPath;
        for (const [path, marker] of routes)
        {
            const started = performance.now();
            const response = await fetch(`${base}${path}`,
            {
                headers: { "User-Agent": "Mozilla/5.0", "Accept-Encoding": "identity" },
                signal: AbortSignal.timeout(5_000)
            });
            assert.equal(response.status, 200, path);
            const html = await response.text();
            assert.match(html, /site-header/);
            assert.match(html, /site-footer/);
            assert.match(html, marker, path);
            assert.doesNotMatch(html, /NEXT_HTTP_ERROR_FALLBACK|"digest":/);
            if (path === "/")
            {
                assert.ok(html.includes(`<link rel="canonical" href="${base}"`), "homepage canonical");
            }
            assert.equal(upstreamResponses, 0, `${path}: rendering waited for the operator`);
            assert.equal(apiFinished, false);
            journeyPath ??= html.match(/href="(\/suivi\/flixbus\/9901\/[^" ]+)"/)?.[1];
            console.log(`${path}: complete HTML and metadata in ${Math.round(performance.now() - started)} ms while the operator is blocked`);
        }
        assert.ok(journeyPath, "Missing a public journey URL");
        const journeyResponse = await fetch(`${base}${journeyPath}`, { signal: AbortSignal.timeout(5_000) });
        const journeyHtml = await journeyResponse.text();
        assert.match(journeyHtml, /tracker-page/);
        assert.match(journeyHtml, /name="description"/);
        const scheduledEnd = new Date(`${today}T15:00:00Z`).getTime();
        if (Date.now() > scheduledEnd && Date.now() < scheduledEnd + 6 * 60 * 60 * 1000)
        {
            assert.match(journeyHtml, /Horaires et suivi du trajet/);
            assert.doesNotMatch(journeyHtml, /Horaires enregistrés/);
        }
        assert.equal(apiFinished, false);
        console.log(`${journeyPath}: journey and SEO rendered before the operator responds`);
        const legacy = await fetch(`${base}/suivi/50819%3A2026-08-22`, { redirect: "manual" });
        assert.equal(legacy.status, 308);
        const archivedPath = legacy.headers.get("location");
        assert.ok(archivedPath);
        for (const agent of ["Mozilla/5.0", "Googlebot", "Twitterbot"])
        {
            const request = (path) => fetch(`${base}${path}`,
            {
                redirect: "manual",
                headers: { "User-Agent": agent },
                signal: AbortSignal.timeout(5_000)
            });
            for (const path of [
                "/ville/inconnue", "/gares/inconnue", "/trajets/paris/inconnue",
                `/departs/inconnue/${today}`, "/departs/paris/2026-02-30",
                "/bus/flixbus/inconnu", "/suivi/inconnu",
                `/suivi/flixbus/9901/${today}-00000000000000000000`
            ])
            {
                const response = await request(path);
                assert.equal(response.status, 404, `${agent}: ${path}`);
                assert.match(await response.text(), /<meta name="robots" content="noindex"/);
            }
            for (const [path, target] of [
                [journeyPath.replace("/9901/", "/incorrect/"), journeyPath],
                ["/bus/flixbus/j~9901", "/bus/flixbus/9901"],
                ["/suivi/50819%3A2026-08-22", archivedPath]
            ])
            {
                const response = await request(path);
                assert.equal(response.status, 308, `${agent}: ${path}`);
                assert.equal(response.headers.get("location"), target);
                await response.text();
            }
            for (const [path, indexable] of [[journeyPath, true], [archivedPath, false], ["/bus/blablacar-bus/50819", true]])
            {
                const response = await request(path);
                assert.equal(response.status, 200, `${agent}: ${path}`);
                const html = await response.text();
                assert.ok(html.includes(`<link rel="canonical" href="${base}${path}"`), `${agent}: canonical ${path}`);
                assert.match(html, /<title>[^<]+<\/title>/);
                assert.match(html, /<script type="application\/ld\+json"/);
                assert.match(html, indexable ? /<meta name="robots" content="index, follow"/ : /<meta name="robots" content="noindex, follow"/);
            }
            assert.equal(apiFinished, false);
            assert.equal(upstreamResponses, 0);
            console.log(`${agent}: HTTP 404/308, canonical URLs, structured data and archive indexing verified`);
        }
        releaseTimetable();
        const live = await liveRequest;
        assert.equal(live.response.status, 200);
        assert.ok(live.data.journeys.length > 0);
        console.log("The realtime API completes independently when the operator is released");
        assert.doesNotMatch(logs, /Error:/);
    }
}
catch (error)
{
    console.error(logs);
    throw error;
}
finally
{
    releaseTimetable();
    server.kill();
    await exited;
    upstream.closeAllConnections();
    await new Promise((done) => upstream.close(done));
    await rm(temporaryDirectory, { recursive: true, force: true });
}

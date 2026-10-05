import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const defaultSiteUrl = "https://bus-minute.xyz";
const defaultSections = ["cities", "stops", "routes", "departures", "services", "journeys"];

function parseArguments(argv)
{
    const options = {
        samplePerSection: 2,
        sections: defaultSections,
        siteUrl: defaultSiteUrl
    };

    for (const argument of argv)
    {
        if (argument === "--help")
        {
            options.help = true;
        }
        else if (argument.startsWith("--sample-per-section="))
        {
            options.samplePerSection = Number.parseInt(argument.split("=", 2)[1], 10);
        }
        else if (argument.startsWith("--sections="))
        {
            options.sections = argument.split("=", 2)[1].split(",").filter(Boolean);
        }
        else if (argument.startsWith("--site-url="))
        {
            options.siteUrl = argument.split("=", 2)[1].replace(/\/$/, "");
        }
        else
        {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }

    if (!Number.isInteger(options.samplePerSection) || options.samplePerSection < 1 || options.samplePerSection > 20)
    {
        throw new Error("--sample-per-section must be an integer between 1 and 20");
    }

    if (options.sections.length === 0)
    {
        throw new Error("--sections must contain at least one sitemap section");
    }

    return options;
}

async function loadEnvironmentFile(filePath)
{
    let content;

    try
    {
        content = await fs.readFile(filePath, "utf8");
    }
    catch (error)
    {
        if (error.code === "ENOENT")
        {
            return;
        }

        throw error;
    }

    for (const line of content.split(/\r?\n/))
    {
        const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);

        if (match && process.env[match[1]] === undefined)
        {
            process.env[match[1]] = match[2].trim();
        }
    }
}

function decodeHtml(value)
{
    return value
        .replaceAll("&amp;", "&")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", "\"")
        .replaceAll("&#x27;", "'")
        .replaceAll("&nbsp;", " ");
}

function textContent(html)
{
    return decodeHtml(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function extractUrls(xml)
{
    return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => decodeHtml(match[1]));
}

function sampleEvenly(values, count)
{
    if (values.length <= count)
    {
        return values;
    }

    if (count === 1)
    {
        return [values[Math.floor(values.length / 2)]];
    }

    return Array.from({ length: count }, (_, index) => values[Math.round(index * (values.length - 1) / (count - 1))]);
}

function extractPage(html, pageUrl, siteUrl)
{
    const title = textContent(html.match(/<title>(.*?)<\/title>/s)?.[1] ?? "");
    const heading = textContent(html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1] ?? "");
    const links = [];

    for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs))
    {
        const destination = new URL(match[1], pageUrl);

        if (destination.origin !== siteUrl || destination.pathname === new URL(pageUrl).pathname)
        {
            continue;
        }

        const anchor = textContent(match[2]).slice(0, 240);

        if (!anchor)
        {
            continue;
        }

        links.push({ anchor, path: destination.pathname });
    }

    return {
        heading,
        links: links.slice(0, 30),
        title,
        url: pageUrl
    };
}

function buildState(page)
{
    const links = page.links.map((link, index) => `${index + 1}. "${link.anchor}" -> ${link.path}`).join("\n");

    return [
        "BusMinute is a public intercity-bus schedule and realtime tracking website.",
        `Page URL: ${page.url}`,
        `Title: ${page.title}`,
        `H1: ${page.heading}`,
        "Internal links:",
        links || "None",
        "Judge links for traveler usefulness, semantic accuracy, crawlable site structure, and natural anchors. Permanent city, station, route, and service pages are more durable than dated departure and journey pages."
    ].join("\n");
}

async function fetchText(url)
{
    const response = await fetch(url, {
        headers: { "User-Agent": "BusMinute-Jev-SEO-Audit/1.0" },
        signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok)
    {
        throw new Error(`${url} returned HTTP ${response.status}`);
    }

    return response.text();
}

async function askJev(apiKey, page)
{
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
        body: JSON.stringify({
            model: "jev-latest",
            questions: {
                anchors_helpful: {
                    instructions: "The internal anchor texts accurately describe their destinations and help a traveler navigate.",
                    type: "noul"
                },
                link_set_sufficient: {
                    instructions: "The page exposes a sufficient set of contextually useful internal links for its purpose.",
                    type: "noul"
                },
                overoptimized: {
                    instructions: "The internal anchors appear repetitive, stuffed with keywords, or unnaturally optimized for search engines.",
                    type: "noul"
                }
            },
            state: buildState(page)
        }),
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        method: "POST",
        signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok)
    {
        throw new Error(`TypeSafe returned HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json();
}

async function main()
{
    const options = parseArguments(process.argv.slice(2));

    if (options.help)
    {
        console.log("npm run seo:jev-audit -- [--sample-per-section=2] [--sections=cities,stops,routes,departures,services,journeys] [--site-url=https://bus-minute.xyz]");
        return;
    }

    await loadEnvironmentFile(path.resolve(".env.local"));

    const apiKey = process.env.JEV_API_KEY;

    if (!apiKey)
    {
        throw new Error("JEV_API_KEY is missing from .env.local or the process environment");
    }

    const pages = [];
    const pageErrors = [];
    const sitemapCounts = {};

    for (const section of options.sections)
    {
        const sitemapUrl = `${options.siteUrl}/sitemaps/${encodeURIComponent(section)}.xml`;
        const urls = extractUrls(await fetchText(sitemapUrl));
        sitemapCounts[section] = urls.length;

        for (const url of sampleEvenly(urls, options.samplePerSection))
        {
            try
            {
                pages.push({ section, ...extractPage(await fetchText(url), url, options.siteUrl) });
            }
            catch (error)
            {
                pageErrors.push({
                    error: error instanceof Error ? error.message : String(error),
                    section,
                    url
                });
            }
        }
    }

    const results = [];

    for (const page of pages)
    {
        const decision = await askJev(apiKey, page);
        results.push({
            answers: decision.answers,
            heading: page.heading,
            internalLinkCount: page.links.length,
            model: decision.model,
            section: page.section,
            title: page.title,
            url: page.url,
            usage: decision.usage
        });
    }

    console.log(JSON.stringify({
        auditedAt: new Date().toISOString(),
        results,
        pageErrors,
        samplePerSection: options.samplePerSection,
        sitemapCounts,
        siteUrl: options.siteUrl
    }, null, 2));
}

main().catch((error) =>
{
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});

import fs from "node:fs/promises";
import process from "node:process";

const siteUrl = (process.argv.find((argument) => argument.startsWith("--site-url="))?.split("=", 2)[1] ?? "https://bus-minute.xyz").replace(/\/+$/, "");
const dryRun = process.argv.includes("--dry-run");
const endpoint = "https://api.indexnow.org/indexnow";
const batchSize = 10_000;

// La clé est le nom du fichier servi à la racine du site : IndexNow le relit pour vérifier que le site nous appartient.
const keyFile = (await fs.readdir("public")).find((name) => /^[a-f0-9]{32}\.txt$/.test(name));

if (!keyFile)
{
    throw new Error("Fichier de clé IndexNow introuvable dans public/");
}

const key = keyFile.slice(0, -4);

async function locations(url)
{
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });

    if (!response.ok)
    {
        throw new Error(`${url} a répondu ${response.status}`);
    }

    return [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    {
        return match[1].replaceAll("&amp;", "&");
    });
}

const urls = [];

for (const sitemap of await locations(`${siteUrl}/sitemap.xml`))
{
    const pages = await locations(sitemap);
    console.log(`${sitemap} : ${pages.length} pages`);
    urls.push(...pages);
}

const uniqueUrls = [...new Set(urls)];
console.log(`${uniqueUrls.length} pages à envoyer pour ${new URL(siteUrl).host}`);

if (dryRun)
{
    console.log("Essai à blanc : rien n'a été envoyé.");
    process.exit(0);
}

const publishedKey = await fetch(`${siteUrl}/${keyFile}`, { signal: AbortSignal.timeout(30_000) });

if (!publishedKey.ok || (await publishedKey.text()).trim() !== key)
{
    throw new Error(`La clé n'est pas en ligne sur ${siteUrl}/${keyFile} : déployez le site avant l'envoi.`);
}

for (let index = 0; index < uniqueUrls.length; index += batchSize)
{
    const response = await fetch(endpoint,
    {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
            host: new URL(siteUrl).host,
            key,
            keyLocation: `${siteUrl}/${keyFile}`,
            urlList: uniqueUrls.slice(index, index + batchSize)
        }),
        signal: AbortSignal.timeout(60_000)
    });
    console.log(`Lot ${index / batchSize + 1} : ${Math.min(batchSize, uniqueUrls.length - index)} pages, réponse ${response.status}`);

    if (!response.ok)
    {
        throw new Error(`IndexNow a refusé l'envoi : ${response.status} ${await response.text()}`);
    }
}

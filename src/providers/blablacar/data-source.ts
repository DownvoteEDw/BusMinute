import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { GtfsFeed, SiriEstimatedTimetable } from "../../domain/models.js";
import { BlaBlaCarGtfsImporter } from "./gtfs/importer.js";
import { BlaBlaCarSiriParser } from "./siri/parser.js";

const defaultGtfsUrl = "https://drive.google.com/uc?export=download&id=1VXd01yQl2Mb67C9bkrx0P8sqNIL532_o";
const defaultSiriUrl = "https://open-data.bus.blablacar.com/api/siri-lite/estimated-timetable";

export class BlaBlaCarDataSource
{
    private readonly gtfsImporter = new BlaBlaCarGtfsImporter();
    private readonly siriParser = new BlaBlaCarSiriParser();

    public async loadGtfs(forceDownload = false): Promise<GtfsFeed>
    {
        const configuredPath = process.env.GTFS_PATH;

        if (configuredPath)
        {
            return this.gtfsImporter.import(configuredPath);
        }

        const cachePath = process.env.GTFS_CACHE_PATH ?? join(tmpdir(), "busminute", "blablacar-gtfs.zip");

        if (forceDownload || !(await exists(cachePath)))
        {
            await this.downloadGtfs(cachePath);
        }

        return this.gtfsImporter.import(cachePath);
    }

    public async loadSiri(): Promise<SiriEstimatedTimetable>
    {
        const configuredPath = process.env.SIRI_PATH;

        if (configuredPath)
        {
            return this.siriParser.parse(JSON.parse(await readFile(configuredPath, "utf8")) as unknown);
        }

        const response = await fetch(process.env.SIRI_URL ?? defaultSiriUrl,
        {
            cache: "no-store",
            headers: {
                Accept: "application/json",
                "User-Agent": "BusMinute/1.0"
            },
            signal: AbortSignal.timeout(readPositiveInteger("SIRI_TIMEOUT_MS", 20_000))
        });

        if (!response.ok)
        {
            throw new Error(`Lecture SIRI impossible : ${response.status}`);
        }

        return this.siriParser.parse(await response.json() as unknown);
    }

    private async downloadGtfs(cachePath: string): Promise<void>
    {
        await mkdir(dirname(cachePath), { recursive: true });
        const response = await fetch(process.env.GTFS_URL ?? defaultGtfsUrl,
        {
            redirect: "follow",
            headers: {
                Accept: "application/zip, application/octet-stream",
                "User-Agent": "BusMinute/1.0"
            },
            signal: AbortSignal.timeout(readPositiveInteger("GTFS_TIMEOUT_MS", 60_000))
        });

        if (!response.ok)
        {
            throw new Error(`Téléchargement GTFS impossible : ${response.status}`);
        }

        await writeFile(cachePath, Buffer.from(await response.arrayBuffer()));
    }
}

function readPositiveInteger(name: string, fallback: number): number
{
    const value = Number.parseInt(process.env[name] ?? "", 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function exists(path: string): Promise<boolean>
{
    try
    {
        await access(path);
        return true;
    }
    catch
    {
        return false;
    }
}

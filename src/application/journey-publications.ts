import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Pool } from "pg";
import { getDatabasePool } from "../db/database.js";
import type { JourneyView } from "./journey-view.js";
import { busServicePath } from "./journey-url.js";

export function withPublicJourneyUrl(journey: JourneyView): JourneyView
{
    const publicId = createHash("sha256").update(journey.journeyRef).digest("hex").slice(0, 20);
    return {
        ...journey,
        publicId,
        publicPath: journey.publicPath ?? `${busServicePath(journey).replace("/bus/", "/suivi/")}/${journey.serviceDate}-${publicId}`
    };
}

export class JourneyPublications
{
    private readonly saved = new Map<string, { at: number; path: string }>();

    public constructor(
        private readonly pool: Pool | null = getDatabasePool(),
        private readonly directory = join(tmpdir(), process.env.NODE_ENV === "test" ? `busminute-links-test-${randomUUID()}` : `busminute-links-${createHash("sha256").update(process.cwd()).digest("hex").slice(0, 12)}`)
    )
    {
    }

    public async publish(journeys: JourneyView[]): Promise<JourneyView[]>
    {
        const published = journeys.map(withPublicJourneyUrl);
        const pending = [...new Map(published.filter((journey) =>
        {
            const saved = this.saved.get(journey.journeyRef);
            if (saved)
            {
                journey.publicPath = saved.path;
            }
            return !saved || Date.now() - saved.at > 300_000;
        }).map((journey) => [journey.journeyRef, journey])).values()]
            .sort((first, second) => first.publicId!.localeCompare(second.publicId!));

        if (pending.length === 0)
        {
            return published;
        }

        if (this.pool)
        {
            for (let offset = 0; offset < pending.length; offset += 500)
            {
                const batch = pending.slice(offset, offset + 500);
                const result = await this.pool.query<{ public_id: string; snapshot: JourneyView }>(
                    `INSERT INTO journey_publications (public_id, journey_ref, operator_slug, service_number, snapshot)
                     SELECT value->>'publicId', value->>'journeyRef', value->>'operatorSlug', value->>'serviceNumber', value
                     FROM jsonb_array_elements($1::jsonb)
                     ON CONFLICT (public_id) DO UPDATE
                     SET snapshot = (CASE
                         WHEN journey_publications.snapshot->>'updatedAt' > EXCLUDED.snapshot->>'updatedAt'
                             THEN journey_publications.snapshot
                         ELSE EXCLUDED.snapshot END)
                         || jsonb_build_object('publicPath', journey_publications.snapshot->>'publicPath'),
                         updated_at = now()
                     WHERE journey_publications.journey_ref = EXCLUDED.journey_ref
                     RETURNING public_id, snapshot`,
                    [JSON.stringify(batch)]
                );
                if (result.rows.length !== batch.length)
                {
                    throw new Error("Collision d’identifiants publics de circulation");
                }
                for (const row of result.rows)
                {
                    this.remember(row.snapshot);
                }
            }
        }
        else
        {
            await mkdir(this.directory, { recursive: true });
            for (const journey of pending)
            {
                const previous = await this.findById(journey.publicId!);
                if (previous && previous.journeyRef !== journey.journeyRef)
                {
                    throw new Error("Collision d’identifiants publics de circulation");
                }
                const snapshot = previous && previous.updatedAt > journey.updatedAt ? previous : journey;
                snapshot.publicPath = previous?.publicPath ?? journey.publicPath;
                const path = join(this.directory, `${journey.publicId}.json`);
                const temporary = `${path}.${randomUUID()}.tmp`;
                await writeFile(temporary, JSON.stringify(snapshot), "utf8");
                await rename(temporary, path);
                this.remember(snapshot);
            }
        }

        return published.map((journey) => ({ ...journey, publicPath: this.saved.get(journey.journeyRef)?.path ?? journey.publicPath }));
    }

    public async findById(id: string): Promise<JourneyView | null>
    {
        if (!/^[a-f0-9]{20}$/.test(id))
        {
            return null;
        }
        if (this.pool)
        {
            const result = await this.pool.query<{ snapshot: JourneyView }>("SELECT snapshot FROM journey_publications WHERE public_id = $1", [id]);
            return result.rows[0]?.snapshot ?? null;
        }
        try
        {
            return JSON.parse(await readFile(join(this.directory, `${id}.json`), "utf8")) as JourneyView;
        }
        catch (error)
        {
            if ((error as NodeJS.ErrnoException).code === "ENOENT")
            {
                return null;
            }
            throw error;
        }
    }

    public async findByReference(reference: string): Promise<JourneyView | null>
    {
        const id = createHash("sha256").update(reference).digest("hex").slice(0, 20);
        const journey = await this.findById(id);
        return journey?.journeyRef === reference ? journey : null;
    }

    public async listServices(): Promise<Array<{ operatorSlug: string; serviceNumber: string }>>
    {
        if (this.pool)
        {
            const result = await this.pool.query<{ operatorSlug: string; serviceNumber: string }>(
                `SELECT DISTINCT operator_slug AS "operatorSlug", service_number AS "serviceNumber" FROM journey_publications`
            );
            return result.rows;
        }
        return this.localSnapshots();
    }

    public async serviceExample(operator: string, service: string): Promise<JourneyView | null>
    {
        if (this.pool)
        {
            const result = await this.pool.query<{ snapshot: JourneyView }>(
                `SELECT snapshot FROM journey_publications WHERE operator_slug = $1 AND service_number = $2
                 ORDER BY updated_at DESC LIMIT 1`, [operator, service]
            );
            return result.rows[0]?.snapshot ?? null;
        }
        return (await this.localSnapshots()).filter((journey) => journey.operatorSlug === operator && journey.serviceNumber === service)
            .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate))[0] ?? null;
    }

    private remember(journey: JourneyView): void
    {
        if (this.saved.size > 50_000)
        {
            this.saved.clear();
        }
        this.saved.set(journey.journeyRef, { at: Date.now(), path: journey.publicPath! });
    }

    private async localSnapshots(): Promise<JourneyView[]>
    {
        let files: string[];
        try
        {
            files = await readdir(this.directory);
        }
        catch (error)
        {
            if ((error as NodeJS.ErrnoException).code === "ENOENT")
            {
                return [];
            }
            throw error;
        }
        const snapshots: JourneyView[] = [];
        for (const file of files.filter((name) => /^[a-f0-9]{20}\.json$/.test(name)))
        {
            const snapshot = await this.findById(file.slice(0, -5));
            if (snapshot)
            {
                snapshots.push(snapshot);
            }
        }
        return snapshots;
    }
}

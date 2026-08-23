import type { Pool } from "pg";
import type { GtfsFeed } from "../domain/models.js";
import
{
    PostgresGtfsRepository,
    type PersistedGtfsCounts
} from "../db/postgres-gtfs-repository.js";
import
{
    PostgresRealtimeRepository,
    type PersistedRealtimeCounts
} from "../db/postgres-realtime-repository.js";
import { BlaBlaCarDataSource } from "../providers/blablacar/data-source.js";

export class TransitSyncService
{
    private readonly dataSource = new BlaBlaCarDataSource();
    private readonly gtfsRepository: PostgresGtfsRepository;
    private readonly realtimeRepository: PostgresRealtimeRepository;
    private feed: GtfsFeed | null = null;

    public constructor(pool: Pool)
    {
        this.gtfsRepository = new PostgresGtfsRepository(pool);
        this.realtimeRepository = new PostgresRealtimeRepository(pool);
    }

    public async syncGtfs(forceDownload = true): Promise<PersistedGtfsCounts>
    {
        const runId = await this.realtimeRepository.startSyncRun("GTFS");

        try
        {
            const feed = await this.dataSource.loadGtfs(forceDownload);
            const counts = await this.gtfsRepository.replaceOperatorSchedule(feed,
            {
                slug: "blablacar-bus",
                name: "BlaBlaCar Bus"
            });
            this.feed = feed;
            await this.realtimeRepository.completeSyncRun(runId, counts.trips, null);
            return counts;
        }
        catch (error)
        {
            await this.realtimeRepository.failSyncRun(runId, error);
            throw error;
        }
    }

    public async syncRealtime(): Promise<PersistedRealtimeCounts>
    {
        const runId = await this.realtimeRepository.startSyncRun("SIRI_ESTIMATED_TIMETABLE");

        try
        {
            this.feed ??= await this.dataSource.loadGtfs(false);
            const timetable = await this.dataSource.loadSiri();
            const counts = await this.realtimeRepository.persistTimetable(
                "blablacar-bus",
                this.feed,
                timetable
            );
            await this.realtimeRepository.completeSyncRun(
                runId,
                counts.journeys,
                timetable.responseTimestamp
            );
            return counts;
        }
        catch (error)
        {
            await this.realtimeRepository.failSyncRun(runId, error);
            throw error;
        }
    }

    public async purgeHistory(retentionDays: number): Promise<number>
    {
        return this.realtimeRepository.purgeOldData(retentionDays);
    }
}

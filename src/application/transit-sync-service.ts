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
import { FlixBusDataSource } from "../providers/flixbus/data-source.js";
import { AlsaDataSource } from "../providers/alsa/data-source.js";
import { alsaOperator, blablacarBusOperator, flixBusOperator } from "./operators.js";

export interface PersistedOperatorGtfsCounts
{
    blablacarBus: PersistedGtfsCounts;
    flixBus: PersistedGtfsCounts | null;
    alsa: PersistedGtfsCounts | null;
}

export class TransitSyncService
{
    private readonly dataSource = new BlaBlaCarDataSource();
    private readonly flixBusDataSource = new FlixBusDataSource();
    private readonly alsaDataSource = new AlsaDataSource();
    private readonly gtfsRepository: PostgresGtfsRepository;
    private readonly realtimeRepository: PostgresRealtimeRepository;
    private feed: GtfsFeed | null = null;

    public constructor(pool: Pool)
    {
        this.gtfsRepository = new PostgresGtfsRepository(pool);
        this.realtimeRepository = new PostgresRealtimeRepository(pool);
    }

    public async syncGtfs(forceDownload = true): Promise<PersistedOperatorGtfsCounts>
    {
        const blablacarBus = await this.syncBlablacarGtfs(forceDownload);
        let flixBus: PersistedGtfsCounts | null = null;
        let alsa: PersistedGtfsCounts | null = null;

        if (process.env.FLIXBUS_GTFS_ENABLED !== "false")
        {
            try
            {
                flixBus = await this.syncFlixBusGtfs(forceDownload);
            }
            catch
            {
            }
        }

        if (process.env.ALSA_ENABLED === "true")
        {
            try
            {
                alsa = await this.syncAlsaGtfs(forceDownload);
            }
            catch
            {
            }
        }

        return { blablacarBus, flixBus, alsa };
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

    private async syncBlablacarGtfs(forceDownload: boolean): Promise<PersistedGtfsCounts>
    {
        const runId = await this.realtimeRepository.startSyncRun("GTFS_BLABLACAR", blablacarBusOperator.slug);

        try
        {
            const feed = await this.dataSource.loadGtfs(forceDownload);
            const counts = await this.gtfsRepository.replaceOperatorSchedule(feed, blablacarBusOperator);
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

    private async syncFlixBusGtfs(forceDownload: boolean): Promise<PersistedGtfsCounts>
    {
        const runId = await this.realtimeRepository.startSyncRun("GTFS_FLIXBUS", flixBusOperator.slug);

        try
        {
            const feed = await this.flixBusDataSource.loadGtfs(forceDownload);
            const counts = await this.gtfsRepository.replaceOperatorSchedule(feed, flixBusOperator);
            await this.realtimeRepository.completeSyncRun(runId, counts.trips, null);
            return counts;
        }
        catch (error)
        {
            await this.realtimeRepository.failSyncRun(runId, error);
            throw error;
        }
    }

    private async syncAlsaGtfs(forceDownload: boolean): Promise<PersistedGtfsCounts>
    {
        const runId = await this.realtimeRepository.startSyncRun("GTFS_ALSA", alsaOperator.slug);

        try
        {
            const feed = await this.alsaDataSource.loadGtfs(forceDownload);
            const counts = await this.gtfsRepository.replaceOperatorSchedule(feed, alsaOperator);
            await this.realtimeRepository.completeSyncRun(runId, counts.trips, null);
            return counts;
        }
        catch (error)
        {
            await this.realtimeRepository.failSyncRun(runId, error);
            throw error;
        }
    }
}

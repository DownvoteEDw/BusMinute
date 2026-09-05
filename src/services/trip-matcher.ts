import { DateTime } from "luxon";
import type
{
    GtfsFeed,
    GtfsScheduledTrip,
    GtfsServiceCalendar,
    GtfsServiceException,
    GtfsStopTime,
    SiriCall,
    SiriJourney,
    TripMatchCandidate,
    TripMatchMethod,
    TripMatchResult,
    TripMatchScore
} from "../domain/models.js";
import { isServiceActive } from "../providers/blablacar/gtfs/service-calendar.js";

export interface TripMatcherOptions
{
    minimumConfidence: number;
    ambiguityMargin: number;
    maximumAverageTimetableDifferenceSeconds: number;
}

const defaultOptions: TripMatcherOptions = {
    minimumConfidence: 0.8,
    ambiguityMargin: 0.01,
    maximumAverageTimetableDifferenceSeconds: 7200
};

export class GtfsSiriTripMatcher
{
    private readonly options: TripMatcherOptions;
    private readonly feedIndexes = new WeakMap<GtfsFeed,
    {
        services: Map<string, GtfsScheduledTrip[]>;
        calendars: Map<string, GtfsServiceCalendar>;
        exceptions: Map<string, GtfsServiceException[]>;
    }>();

    public constructor(options: Partial<TripMatcherOptions> = {})
    {
        this.options = {
            ...defaultOptions,
            ...options
        };
    }

    public match(feed: GtfsFeed, journey: SiriJourney): TripMatchResult
    {
        const timezone = feed.agencies[0]?.timezone;

        if (!timezone)
        {
            return this.unmatched(journey, "Le GTFS ne contient aucun fuseau opérateur");
        }

        const index = this.feedIndex(feed);
        const serviceCandidates = index.services.get(journey.serviceNumber) ?? [];

        if (serviceCandidates.length === 0)
        {
            return this.unmatched(journey, `Aucun trajet GTFS ne porte le numéro ${journey.serviceNumber}`);
        }

        const activeCandidates = serviceCandidates.filter((trip) =>
        {
            const calendar = index.calendars.get(trip.serviceExternalId);

            return calendar
                ? isServiceActive(calendar, index.exceptions.get(trip.serviceExternalId) ?? [], journey.serviceDate)
                : false;
        });

        if (activeCandidates.length === 0)
        {
            return this.unmatched(
                journey,
                `Aucun service ${journey.serviceNumber} n'est actif le ${journey.serviceDate}`
            );
        }

        const candidates = activeCandidates
            .map((trip) => this.scoreCandidate(trip, journey, timezone))
            .sort((left, right) =>
            {
                const scoreDifference = right.score.total - left.score.total;
                return scoreDifference !== 0
                    ? scoreDifference
                    : left.trip.externalId.localeCompare(right.trip.externalId);
            });
        const best = candidates[0] ?? null;

        if (!best || best.score.total < this.options.minimumConfidence)
        {
            return {
                status: "unmatched",
                journeyRef: journey.journeyRef,
                serviceNumber: journey.serviceNumber,
                serviceDate: journey.serviceDate,
                match: null,
                candidates,
                reason: best
                    ? `Meilleure confiance insuffisante : ${best.score.total}`
                    : "Aucun candidat n'a pu être évalué"
            };
        }

        const second = candidates[1];

        if (second && Math.abs(best.score.total - second.score.total) <= this.options.ambiguityMargin)
        {
            return {
                status: "ambiguous",
                journeyRef: journey.journeyRef,
                serviceNumber: journey.serviceNumber,
                serviceDate: journey.serviceDate,
                match: null,
                candidates,
                reason: `Les trajets ${best.trip.externalId} et ${second.trip.externalId} sont indiscernables`
            };
        }

        return {
            status: "matched",
            journeyRef: journey.journeyRef,
            serviceNumber: journey.serviceNumber,
            serviceDate: journey.serviceDate,
            match: best,
            candidates,
            reason: null
        };
    }

    private feedIndex(feed: GtfsFeed)
    {
        const cached = this.feedIndexes.get(feed);

        if (cached)
        {
            return cached;
        }

        const services = new Map<string, GtfsScheduledTrip[]>();
        const exceptions = new Map<string, GtfsServiceException[]>();

        for (const trip of feed.trips)
        {
            const candidates = services.get(trip.serviceNumber) ?? [];
            candidates.push(trip);
            services.set(trip.serviceNumber, candidates);
        }

        for (const exception of feed.calendarExceptions)
        {
            const values = exceptions.get(exception.serviceExternalId) ?? [];
            values.push(exception);
            exceptions.set(exception.serviceExternalId, values);
        }

        const index =
        {
            services,
            calendars: new Map(feed.calendars.map((calendar) => [calendar.externalId, calendar])),
            exceptions
        };
        this.feedIndexes.set(feed, index);
        return index;
    }

    private scoreCandidate(trip: GtfsScheduledTrip, journey: SiriJourney, timezone: string): TripMatchCandidate
    {
        const gtfsStops = trip.stopTimes.map((stopTime) => stopTime.stopExternalId);
        const siriStops = journey.calls.map((call) => call.stopPointRef);
        const stopSequence = sequenceSimilarity(gtfsStops, siriStops);
        const timetable = compareTimetable(trip.stopTimes, journey.calls, journey.serviceDate, timezone);
        const timetableScore = timetable.averageDifferenceSeconds === null
            ? 0
            : clamp(1 - (
                timetable.averageDifferenceSeconds
                / this.options.maximumAverageTimetableDifferenceSeconds
            ));
        const score: TripMatchScore = {
            total: round((0.35) + (0.2) + (0.3 * stopSequence) + (0.15 * timetableScore)),
            serviceNumber: 1,
            serviceDate: 1,
            stopSequence: round(stopSequence),
            timetable: round(timetableScore),
            comparedTimetableValues: timetable.comparedValues,
            averageTimetableDifferenceSeconds: timetable.averageDifferenceSeconds === null
                ? null
                : round(timetable.averageDifferenceSeconds)
        };

        return {
            trip,
            score,
            method: matchMethod(
                stopSequence,
                timetable.comparedValues,
                timetable.averageDifferenceSeconds,
                this.options.maximumAverageTimetableDifferenceSeconds
            )
        };
    }

    private unmatched(journey: SiriJourney, reason: string): TripMatchResult
    {
        return {
            status: "unmatched",
            journeyRef: journey.journeyRef,
            serviceNumber: journey.serviceNumber,
            serviceDate: journey.serviceDate,
            match: null,
            candidates: [],
            reason
        };
    }
}

interface TimetableComparison
{
    comparedValues: number;
    averageDifferenceSeconds: number | null;
}

function compareTimetable(
    stopTimes: GtfsStopTime[],
    calls: SiriCall[],
    serviceDate: string,
    timezone: string
): TimetableComparison
{
    const differences: number[] = [];
    const base = DateTime.fromISO(serviceDate, { zone: timezone });
    const stopTimesBySequence = new Map(stopTimes.map((stopTime) => [stopTime.sequence, stopTime]));

    calls.forEach((call) =>
    {
        const stopTime = stopTimesBySequence.get(call.order);

        if (!stopTime || stopTime.stopExternalId !== call.stopPointRef)
        {
            return;
        }

        addDifference(
            differences,
            call.aimedArrivalTime,
            scheduledInstant(base, stopTime.arrivalSeconds)
        );
        addDifference(
            differences,
            call.aimedDepartureTime,
            scheduledInstant(base, stopTime.departureSeconds)
        );
    });

    if (differences.length === 0)
    {
        return {
            comparedValues: 0,
            averageDifferenceSeconds: null
        };
    }

    return {
        comparedValues: differences.length,
        averageDifferenceSeconds: differences.reduce((sum, difference) => sum + difference, 0) / differences.length
    };
}

function scheduledInstant(base: DateTime, seconds: number): Date
{
    const dayOffset = Math.floor(seconds / 86400);
    const secondsOfDay = seconds % 86400;
    const hour = Math.floor(secondsOfDay / 3600);
    const minute = Math.floor((secondsOfDay % 3600) / 60);
    const second = secondsOfDay % 60;
    const instant = base
        .plus({ days: dayOffset })
        .set({ hour, minute, second, millisecond: 0 });

    if (!instant.isValid)
    {
        throw new Error(`Impossible de convertir ${base.toISODate()} + ${seconds}s dans ${base.zoneName}`);
    }

    return instant.toJSDate();
}

function addDifference(target: number[], observed: Date | null, scheduled: Date): void
{
    if (!observed)
    {
        return;
    }

    target.push(Math.abs(observed.getTime() - scheduled.getTime()) / 1000);
}

function sequenceSimilarity(left: string[], right: string[]): number
{
    if (left.length === 0 || right.length === 0)
    {
        return 0;
    }

    if (left.length === right.length && left.every((value, index) => value === right[index]))
    {
        return 1;
    }

    const matrix: number[][] = Array.from({ length: left.length + 1 }, () =>
    {
        return Array<number>(right.length + 1).fill(0);
    });

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1)
    {
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1)
        {
            const row = matrix[leftIndex];
            const previousRow = matrix[leftIndex - 1];

            if (!row || !previousRow)
            {
                continue;
            }

            row[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
                ? (previousRow[rightIndex - 1] ?? 0) + 1
                : Math.max(previousRow[rightIndex] ?? 0, row[rightIndex - 1] ?? 0);
        }
    }

    const common = matrix[left.length]?.[right.length] ?? 0;
    return (2 * common) / (left.length + right.length);
}

function matchMethod(
    stopSequenceScore: number,
    comparedValues: number,
    averageDifferenceSeconds: number | null,
    maximumDifferenceSeconds: number
): TripMatchMethod
{
    const exactSequence = stopSequenceScore === 1;
    const matchingTimes = comparedValues > 0
        && averageDifferenceSeconds !== null
        && averageDifferenceSeconds <= maximumDifferenceSeconds;

    if (exactSequence && matchingTimes)
    {
        return "SERVICE_NUMBER_DATE_STOP_SEQUENCE_TIMES";
    }

    if (exactSequence)
    {
        return "SERVICE_NUMBER_DATE_STOP_SEQUENCE";
    }

    if (matchingTimes)
    {
        return "SERVICE_NUMBER_DATE_PARTIAL_SEQUENCE_TIMES";
    }

    return "SERVICE_NUMBER_DATE_PARTIAL_SEQUENCE";
}

function clamp(value: number): number
{
    return Math.min(1, Math.max(0, value));
}

function round(value: number): number
{
    return Math.round(value * 10000) / 10000;
}

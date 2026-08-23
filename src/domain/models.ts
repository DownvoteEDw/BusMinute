export interface GtfsAgency
{
    externalId: string;
    name: string;
    url: string;
    timezone: string;
    language: string | null;
}

export interface GtfsStop
{
    externalId: string;
    code: string | null;
    name: string;
    description: string | null;
    latitude: number;
    longitude: number;
    timezone: string | null;
    wheelchairBoarding: number | null;
}

export interface GtfsRoute
{
    externalId: string;
    agencyExternalId: string;
    shortName: string;
    longName: string;
    type: number;
    color: string | null;
    textColor: string | null;
}

export interface GtfsServiceCalendar
{
    externalId: string;
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
    startDate: string;
    endDate: string;
}

export interface GtfsServiceException
{
    serviceExternalId: string;
    date: string;
    type: 1 | 2;
}

export interface GtfsStopTime
{
    stopExternalId: string;
    sequence: number;
    arrivalSeconds: number;
    departureSeconds: number;
    pickupType: number | null;
    dropOffType: number | null;
}

export interface GtfsScheduledTrip
{
    externalId: string;
    routeExternalId: string;
    serviceExternalId: string;
    serviceNumber: string;
    headsign: string | null;
    wheelchairAccessible: number | null;
    bikesAllowed: number | null;
    stopTimes: GtfsStopTime[];
}

export interface GtfsFeed
{
    agencies: GtfsAgency[];
    stops: GtfsStop[];
    routes: GtfsRoute[];
    calendars: GtfsServiceCalendar[];
    calendarExceptions: GtfsServiceException[];
    trips: GtfsScheduledTrip[];
    sourcePath: string;
}

export type SiriCallSource = "estimated" | "recorded" | "combined";

export interface SiriCall
{
    stopPointRef: string;
    order: number;
    stopPointName: string | null;
    aimedArrivalTime: Date | null;
    expectedArrivalTime: Date | null;
    actualArrivalTime: Date | null;
    aimedDepartureTime: Date | null;
    expectedDepartureTime: Date | null;
    actualDepartureTime: Date | null;
    arrivalStatus: string | null;
    departureStatus: string | null;
    cancellation: boolean;
    extraCall: boolean;
    source: SiriCallSource;
}

export interface SiriJourney
{
    journeyRef: string;
    datedVehicleJourneyRef: string | null;
    lineRef: string | null;
    serviceNumber: string;
    serviceDate: string;
    cancellation: boolean;
    completeStopSequence: boolean;
    recordedAtTime: Date;
    calls: SiriCall[];
}

export interface SiriEstimatedTimetable
{
    responseTimestamp: Date;
    validUntil: Date | null;
    version: string | null;
    journeys: SiriJourney[];
}

export type TripMatchMethod =
    | "SERVICE_NUMBER_DATE_STOP_SEQUENCE_TIMES"
    | "SERVICE_NUMBER_DATE_STOP_SEQUENCE"
    | "SERVICE_NUMBER_DATE_PARTIAL_SEQUENCE_TIMES"
    | "SERVICE_NUMBER_DATE_PARTIAL_SEQUENCE";

export interface TripMatchScore
{
    total: number;
    serviceNumber: number;
    serviceDate: number;
    stopSequence: number;
    timetable: number;
    comparedTimetableValues: number;
    averageTimetableDifferenceSeconds: number | null;
}

export interface TripMatchCandidate
{
    trip: GtfsScheduledTrip;
    score: TripMatchScore;
    method: TripMatchMethod;
}

export type TripMatchStatus = "matched" | "ambiguous" | "unmatched";

export interface TripMatchResult
{
    status: TripMatchStatus;
    journeyRef: string;
    serviceNumber: string;
    serviceDate: string;
    match: TripMatchCandidate | null;
    candidates: TripMatchCandidate[];
    reason: string | null;
}

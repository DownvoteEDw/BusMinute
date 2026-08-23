import type
{
    SiriCall,
    SiriEstimatedTimetable,
    SiriJourney
} from "../../../domain/models.js";

type JsonObject = Record<string, unknown>;

export class SiriParseError extends Error
{
    public constructor(message: string)
    {
        super(message);
        this.name = "SiriParseError";
    }
}

export class BlaBlaCarSiriParser
{
    public parse(payload: unknown): SiriEstimatedTimetable
    {
        const root = objectValue(payload, "racine SIRI");
        const responseTimestamp = requiredDate(root.responseTimestamp, "responseTimestamp");
        const validUntil = optionalDate(root.validUntil, "validUntil");
        const version = wrappedText(root.version);
        const journeys: SiriJourney[] = [];

        asArray(root.estimatedJourneyVersionFrame).forEach((frameValue, frameIndex) =>
        {
            const frame = objectValue(frameValue, `estimatedJourneyVersionFrame[${frameIndex}]`);
            const recordedAtTime = optionalDate(frame.recordedAtTime, "recordedAtTime") ?? responseTimestamp;

            asArray(frame.estimatedVehicleJourney).forEach((journeyValue, journeyIndex) =>
            {
                journeys.push(this.parseJourney(
                    journeyValue,
                    recordedAtTime,
                    `estimatedJourneyVersionFrame[${frameIndex}].estimatedVehicleJourney[${journeyIndex}]`
                ));
            });
        });

        return {
            responseTimestamp,
            validUntil,
            version,
            journeys
        };
    }

    private parseJourney(value: unknown, recordedAtTime: Date, path: string): SiriJourney
    {
        const journey = objectValue(value, path);
        const lineRef = wrappedText(journey.lineRef);
        const datedVehicleJourneyRef = wrappedText(journey.datedVehicleJourneyRef);
        const journeyRef = datedVehicleJourneyRef ?? lineRef;

        if (!journeyRef)
        {
            throw new SiriParseError(`${path} ne contient aucune référence de circulation`);
        }

        const estimatedCalls = this.parseCallCollection(journey.estimatedCalls, "estimated", `${path}.estimatedCalls`);
        const recordedCalls = this.parseCallCollection(journey.recordedCalls, "recorded", `${path}.recordedCalls`);
        const calls = mergeCalls(estimatedCalls, recordedCalls);
        const serviceNumber = this.extractServiceNumber(journey, journeyRef);
        const serviceDate = this.extractServiceDate(journeyRef, calls);

        return {
            journeyRef,
            datedVehicleJourneyRef,
            lineRef,
            serviceNumber,
            serviceDate,
            cancellation: booleanValue(journey.cancellation),
            completeStopSequence: booleanValue(journey.isCompleteStopSequence),
            recordedAtTime,
            calls
        };
    }

    private parseCallCollection(value: unknown, source: "estimated" | "recorded", path: string): SiriCall[]
    {
        if (value === null || value === undefined)
        {
            return [];
        }

        const collection = objectValue(value, path);
        const property = source === "estimated" ? collection.estimatedCall : collection.recordedCall;

        return asArray(property).map((call, index) =>
        {
            return this.parseCall(call, source, `${path}[${index}]`);
        });
    }

    private parseCall(value: unknown, source: "estimated" | "recorded", path: string): SiriCall
    {
        const call = objectValue(value, path);
        const stopPointRef = wrappedText(call.stopPointRef);
        const order = numberValue(call.order);

        if (!stopPointRef)
        {
            throw new SiriParseError(`${path}.stopPointRef est absent`);
        }

        if (order === null || !Number.isInteger(order))
        {
            throw new SiriParseError(`${path}.order est invalide`);
        }

        return {
            stopPointRef,
            order,
            stopPointName: wrappedText(call.stopPointName),
            aimedArrivalTime: optionalDate(call.aimedArrivalTime, `${path}.aimedArrivalTime`),
            expectedArrivalTime: optionalDate(call.expectedArrivalTime, `${path}.expectedArrivalTime`),
            actualArrivalTime: optionalDate(call.actualArrivalTime, `${path}.actualArrivalTime`),
            aimedDepartureTime: optionalDate(call.aimedDepartureTime, `${path}.aimedDepartureTime`),
            expectedDepartureTime: optionalDate(call.expectedDepartureTime, `${path}.expectedDepartureTime`),
            actualDepartureTime: optionalDate(call.actualDepartureTime, `${path}.actualDepartureTime`),
            arrivalStatus: wrappedText(call.arrivalStatus),
            departureStatus: wrappedText(call.departureStatus),
            cancellation: booleanValue(call.cancellation),
            extraCall: booleanValue(call.extraCall),
            source
        };
    }

    private extractServiceNumber(journey: JsonObject, journeyRef: string): string
    {
        const serviceNumber = wrappedText(journey.publishedLineName)
            ?? wrappedText(journey.vehicleJourneyName)
            ?? journeyRef.split(":")[0]
            ?? null;

        if (!serviceNumber)
        {
            throw new SiriParseError(`Numéro de service absent pour ${journeyRef}`);
        }

        return serviceNumber;
    }

    private extractServiceDate(journeyRef: string, calls: SiriCall[]): string
    {
        const match = /:(\d{4}-\d{2}-\d{2})$/.exec(journeyRef);

        if (match?.[1])
        {
            return match[1];
        }

        const firstDate = calls
            .flatMap((call) =>
            {
                return [call.aimedDepartureTime, call.aimedArrivalTime];
            })
            .find((date) => date !== null);

        if (!firstDate)
        {
            throw new SiriParseError(`Date de service absente pour ${journeyRef}`);
        }

        return firstDate.toISOString().slice(0, 10);
    }
}

function objectValue(value: unknown, path: string): JsonObject
{
    if (typeof value !== "object" || value === null || Array.isArray(value))
    {
        throw new SiriParseError(`${path} doit être un objet`);
    }

    return value as JsonObject;
}

function asArray(value: unknown): unknown[]
{
    if (value === null || value === undefined)
    {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}

function wrappedText(value: unknown): string | null
{
    if (typeof value === "string" || typeof value === "number")
    {
        return String(value);
    }

    if (Array.isArray(value))
    {
        for (const item of value)
        {
            const text = wrappedText(item);

            if (text !== null)
            {
                return text;
            }
        }

        return null;
    }

    if (typeof value === "object" && value !== null)
    {
        return wrappedText((value as JsonObject).value);
    }

    return null;
}

function numberValue(value: unknown): number | null
{
    if (typeof value === "number" && Number.isFinite(value))
    {
        return value;
    }

    if (typeof value === "string" && value.trim() !== "")
    {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function booleanValue(value: unknown): boolean
{
    if (typeof value === "boolean")
    {
        return value;
    }

    if (typeof value === "string")
    {
        return value.toLowerCase() === "true" || value === "1";
    }

    return value === 1;
}

function requiredDate(value: unknown, path: string): Date
{
    const date = optionalDate(value, path);

    if (!date)
    {
        throw new SiriParseError(`${path} est absent`);
    }

    return date;
}

function optionalDate(value: unknown, path: string): Date | null
{
    const text = wrappedText(value);

    if (text === null)
    {
        return null;
    }

    const normalized = text.replace(/\.(\d{3})\d+(?=Z|[+-]\d{2}:?\d{2}$)/, ".$1");
    const date = new Date(normalized);

    if (Number.isNaN(date.getTime()))
    {
        throw new SiriParseError(`${path} contient une date invalide : ${text}`);
    }

    return date;
}

function mergeCalls(estimated: SiriCall[], recorded: SiriCall[]): SiriCall[]
{
    const merged = new Map<string, SiriCall>();

    estimated.forEach((call) =>
    {
        merged.set(callKey(call), call);
    });

    recorded.forEach((call) =>
    {
        const key = callKey(call);
        const existing = merged.get(key);
        merged.set(key, existing ? mergeCall(existing, call) : call);
    });

    return [...merged.values()].sort((left, right) => left.order - right.order);
}

function callKey(call: SiriCall): string
{
    return `${call.order}:${call.stopPointRef}`;
}

function mergeCall(estimated: SiriCall, recorded: SiriCall): SiriCall
{
    return {
        stopPointRef: recorded.stopPointRef,
        order: recorded.order,
        stopPointName: recorded.stopPointName ?? estimated.stopPointName,
        aimedArrivalTime: recorded.aimedArrivalTime ?? estimated.aimedArrivalTime,
        expectedArrivalTime: recorded.expectedArrivalTime ?? estimated.expectedArrivalTime,
        actualArrivalTime: recorded.actualArrivalTime ?? estimated.actualArrivalTime,
        aimedDepartureTime: recorded.aimedDepartureTime ?? estimated.aimedDepartureTime,
        expectedDepartureTime: recorded.expectedDepartureTime ?? estimated.expectedDepartureTime,
        actualDepartureTime: recorded.actualDepartureTime ?? estimated.actualDepartureTime,
        arrivalStatus: recorded.arrivalStatus ?? estimated.arrivalStatus,
        departureStatus: recorded.departureStatus ?? estimated.departureStatus,
        cancellation: recorded.cancellation || estimated.cancellation,
        extraCall: recorded.extraCall || estimated.extraCall,
        source: "combined"
    };
}

export interface TransitOperator
{
    slug: string;
    name: string;
    realtimeAvailable: boolean;
}

export const blablacarBusOperator: TransitOperator = {
    slug: "blablacar-bus",
    name: "BlaBlaCar Bus",
    realtimeAvailable: true
};

export const flixBusOperator: TransitOperator = {
    slug: "flixbus",
    name: "FlixBus",
    realtimeAvailable: true
};

export const alsaOperator: TransitOperator = {
    slug: "alsa",
    name: "Alsa",
    realtimeAvailable: true
};

export interface StopReference
{
    operatorSlug: string;
    externalId: string;
}

export interface ScheduledJourneyReference
{
    tripId: string;
    serviceDate: string;
}

export function publicStopId(operator: TransitOperator, externalId: string): string
{
    return operator.slug === blablacarBusOperator.slug
        ? externalId
        : `${operator.slug}:${externalId}`;
}

export function parseStopReference(value: string): StopReference
{
    const separator = value.indexOf(":");

    if (separator < 0)
    {
        return {
            operatorSlug: blablacarBusOperator.slug,
            externalId: value
        };
    }

    return {
        operatorSlug: value.slice(0, separator),
        externalId: value.slice(separator + 1)
    };
}

export function scheduledJourneyRef(
    operator: TransitOperator,
    tripId: string,
    serviceDate: string
): string
{
    return `${operator.slug}:${tripId}:${serviceDate}`;
}

export function parseScheduledJourneyRef(
    value: string,
    operator: TransitOperator
): ScheduledJourneyReference | null
{
    const prefix = `${operator.slug}:`;

    if (!value.startsWith(prefix))
    {
        return null;
    }

    const serviceDateSeparator = value.lastIndexOf(":");

    if (serviceDateSeparator <= prefix.length)
    {
        return null;
    }

    const serviceDate = value.slice(serviceDateSeparator + 1);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate))
    {
        return null;
    }

    return {
        tripId: value.slice(prefix.length, serviceDateSeparator),
        serviceDate
    };
}

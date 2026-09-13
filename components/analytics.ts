export type AnalyticsEventData = Record<string, string | number | boolean>;

interface UmamiTracker
{
    track(eventName: string, data?: AnalyticsEventData): void;
}

declare global
{
    interface Window
    {
        umami?: UmamiTracker;
    }
}

export function trackAnalyticsEvent(eventName: string, data?: AnalyticsEventData): void
{
    if (typeof window === "undefined")
    {
        return;
    }

    try
    {
        window.umami?.track(eventName, data);
    }
    catch
    {
    }
}

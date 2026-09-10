"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { JourneyView } from "../src/application/journey-view";
import { shouldRefreshJourney } from "../src/application/journey-refresh";

const UpdatedJourneys = createContext<Record<string, JourneyView>>({});

export function JourneyUpdates({ journeys, children }: { journeys: JourneyView[]; children: ReactNode })
{
    const [updates, setUpdates] = useState<Record<string, JourneyView>>({});
    const references = JSON.stringify(journeys.filter((journey) => shouldRefreshJourney(journey)).map((journey) => journey.journeyRef).sort());

    useEffect(() =>
    {
        const refs = JSON.parse(references) as string[];
        if (refs.length === 0)
        {
            return;
        }
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const stopped = new Set<string>();
        const refresh = async () =>
        {
            try
            {
                for (let offset = 0; offset < refs.length && !controller.signal.aborted; offset += 20)
                {
                    const batch = refs.slice(offset, offset + 20).filter((ref) => !stopped.has(ref));
                    if (batch.length === 0)
                    {
                        continue;
                    }
                    const response = await fetch("/api/journeys/updates",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ references: batch }),
                        cache: "no-store",
                        signal: controller.signal
                    });
                    if (!response.ok)
                    {
                        continue;
                    }
                    const data = await response.json() as { journeys: JourneyView[] };
                    if (controller.signal.aborted)
                    {
                        return;
                    }
                    setUpdates((previous) => ({ ...previous, ...Object.fromEntries(data.journeys.map((journey) => [journey.journeyRef, journey])) }));
                    for (const journey of data.journeys)
                    {
                        if (!shouldRefreshJourney(journey))
                        {
                            stopped.add(journey.journeyRef);
                        }
                    }
                }
            }
            catch
            {
            }
            finally
            {
                if (!controller.signal.aborted && stopped.size < refs.length)
                {
                    timer = setTimeout(() => void refresh(), 30_000);
                }
            }
        };
        void refresh();
        return () =>
        {
            controller.abort();
            clearTimeout(timer);
        };
    }, [references]);

    return <UpdatedJourneys.Provider value={updates}>{children}</UpdatedJourneys.Provider>;
}

export function useUpdatedJourney(journey: JourneyView): JourneyView
{
    return useContext(UpdatedJourneys)[journey.journeyRef] ?? journey;
}

import Link from "next/link";
import { countLabel, type Locale } from "../src/application/i18n";
import type { RouteLinkView, ServiceLinkView } from "../src/application/journey-links";

export function RouteLinkGrid({ routes, locale }: { routes: RouteLinkView[]; locale: Locale })
{
    return (
        <div className="route-suggestion-grid">
            {routes.map((route) =>
            {
                return (
                    <Link href={route.path} key={route.path}>
                        <span>{route.originCity}</span><b>→</b><strong>{route.destinationCity}</strong>
                        <small>{countLabel(locale, route.journeyCount, "bus à venir", "bus à venir", "upcoming bus", "upcoming buses", "autobús próximo", "autobuses próximos")}</small>
                    </Link>
                );
            })}
        </div>
    );
}

export function ServiceLinkList({ services }: { services: ServiceLinkView[] })
{
    return (
        <div className="service-links">
            {services.map((service) =>
            {
                return (
                    <Link href={service.path} key={service.path} title={`${service.originCity} → ${service.destinationCity}`}>
                        {service.operatorName} {service.serviceNumber}
                    </Link>
                );
            })}
        </div>
    );
}

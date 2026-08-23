export interface BreadcrumbItem
{
    name: string;
    path: string;
}

export function absoluteUrl(path: string): string
{
    return new URL(path, process.env.SITE_URL ?? "http://localhost:3000").toString();
}

export function breadcrumbStructuredData(items: BreadcrumbItem[]): object
{
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, index) =>
        {
            return {
                "@type": "ListItem",
                position: index + 1,
                name: item.name,
                item: absoluteUrl(item.path)
            };
        })
    };
}

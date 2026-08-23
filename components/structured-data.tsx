interface StructuredDataProps
{
    value: object | object[];
}

export function StructuredData({ value }: StructuredDataProps)
{
    const content = JSON.stringify(value).replaceAll("<", "\\u003c");

    return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: content }} />;
}

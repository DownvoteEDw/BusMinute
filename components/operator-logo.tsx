interface OperatorLogoProps
{
    operatorSlug: string;
    className?: string;
}

const operators: Record<string, { name: string; logo: string }> = {
    "blablacar-bus": {
        name: "BlaBlaCar Bus",
        logo: "/operators/blablacar-bus.svg"
    },
    flixbus: {
        name: "FlixBus",
        logo: "/operators/flixbus.svg"
    },
    alsa: {
        name: "Alsa",
        logo: "/operators/alsa.svg"
    }
};

export function OperatorLogo({ operatorSlug, className = "" }: OperatorLogoProps)
{
    const operator = operators[operatorSlug];

    if (!operator)
    {
        return null;
    }

    return (
        <img
            alt={operator.name}
            className={`operator-logo ${className}`.trim()}
            height="24"
            loading="lazy"
            src={operator.logo}
            width="120"
        />
    );
}

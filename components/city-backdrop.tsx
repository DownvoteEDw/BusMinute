export type CityBackdropVariant =
    | "barcelona"
    | "bordeaux"
    | "brussels"
    | "geneva"
    | "lille"
    | "london"
    | "lyon"
    | "marseille"
    | "paris"
    | "strasbourg"
    | "toulouse"
    | "urban";

interface CityBackdropProps
{
    city: string;
}

const cityVariants: Record<string, CityBackdropVariant> =
{
    barcelona: "barcelona",
    barcelone: "barcelona",
    bordeaux: "bordeaux",
    brussels: "brussels",
    bruxelles: "brussels",
    geneva: "geneva",
    geneve: "geneva",
    lille: "lille",
    london: "london",
    londres: "london",
    lyon: "lyon",
    marseille: "marseille",
    monaco: "marseille",
    nice: "marseille",
    paris: "paris",
    strasbourg: "strasbourg",
    toulouse: "toulouse"
};

export function CityBackdrop({ city }: CityBackdropProps)
{
    const variant = cityBackdropVariant(city);

    return (
        <div className={`city-backdrop city-backdrop-${variant}`} aria-hidden="true">
            <svg className="city-backdrop-art" focusable="false" viewBox="0 0 760 260" xmlns="http://www.w3.org/2000/svg">
                <circle className="city-backdrop-sun" cx="650" cy="48" r="28" />
                <path className="city-backdrop-cloud" d="M70 75c10-17 36-17 46 0 18-8 37 4 38 22H45c1-15 11-24 25-22Z" />
                <path className="city-backdrop-cloud small" d="M555 92c8-13 27-13 35 0 14-6 29 3 30 17h-82c1-11 7-18 17-17Z" />
                {scene(variant)}
                <path className="city-backdrop-ground" d="M18 232H744" />
            </svg>
        </div>
    );
}

export function cityBackdropVariant(city: string): CityBackdropVariant
{
    return cityVariants[normalizeCity(city)] ?? "urban";
}

function scene(variant: CityBackdropVariant)
{
    switch (variant)
    {
        case "paris":
            return <ParisScene />;
        case "lyon":
            return <LyonScene />;
        case "marseille":
            return <MarseilleScene />;
        case "bordeaux":
            return <BordeauxScene />;
        case "toulouse":
            return <ToulouseScene />;
        case "lille":
            return <LilleScene />;
        case "strasbourg":
            return <StrasbourgScene />;
        case "barcelona":
            return <BarcelonaScene />;
        case "geneva":
            return <GenevaScene />;
        case "brussels":
            return <BrusselsScene />;
        case "london":
            return <LondonScene />;
        default:
            return <UrbanScene />;
    }
}

function ParisScene()
{
    return (
        <g className="city-backdrop-landmarks">
            <path className="city-backdrop-hill" d="M60 218c94-38 178-39 278-3" />
            <path className="city-backdrop-fill" d="M125 210v-38h18v-14h14v14h21v-20h13v20h18v38Z" />
            <path className="city-backdrop-line" d="M134 171v-15m65 15v-15m-43 2c7-28 28-28 35 0m-18-30v20m-7-20h14" />
            <path className="city-backdrop-line landmark-main" d="M350 230 423 58l73 172M388 143h70m-86 49h102M405 102h36m-50 128 32-76 32 76" />
            <path className="city-backdrop-fill" fillRule="evenodd" d="M563 230v-67h104v67h-24v-30c0-17-13-29-28-29s-28 12-28 29v30Zm19-77h66l-10-22h-46Z" />
            <path className="city-backdrop-line" d="M571 179h88m-67-48 4-15m42 15-4-15" />
        </g>
    );
}

function LyonScene()
{
    return (
        <g className="city-backdrop-landmarks">
            <path className="city-backdrop-hill" d="M30 220c128-86 255-91 390-16s222 25 312 13" />
            <path className="city-backdrop-fill" d="M166 192v-62h82v62Zm-13 0v-81h15v81Zm95 0v-81h15v81Z" />
            <path className="city-backdrop-line" d="M154 111 161 91l7 20m80 0 7-20 7 20m-77 19c12-30 33-30 45 0m-22-41v28m-8-28h16" />
            <path className="city-backdrop-fill" d="M458 218v-126h48v126Zm8-139h32l-6-21h-20Z" />
            <path className="city-backdrop-line" d="M466 116h32m-32 31h32m-32 31h32m74 43v-67h76v67m-66-67 28-35 28 35" />
        </g>
    );
}

function MarseilleScene()
{
    return (
        <g className="city-backdrop-landmarks">
            <path className="city-backdrop-hill" d="M35 211c108-8 172-27 236-89 71 78 155 82 239 67" />
            <path className="city-backdrop-fill" d="M239 143v-45h63v45Zm19-45V72h25v26Z" />
            <path className="city-backdrop-line" d="M270 72V43m-8 0h16m-54 100h94m-31-71-16-15-13 15" />
            <path className="city-backdrop-fill" d="M458 215v-51h105v51Zm19-51 34-29 34 29" />
            <path className="city-backdrop-line" d="M42 230c38-12 75-12 113 0s75 12 113 0 75-12 113 0 75 12 113 0 75-12 113 0 75 12 113 0" />
            <path className="city-backdrop-line faint" d="M85 245c31-9 62-9 93 0m232 0c31-9 62-9 93 0" />
        </g>
    );
}

function BordeauxScene()
{
    return (
        <g className="city-backdrop-landmarks">
            <path className="city-backdrop-fill" fillRule="evenodd" d="M52 230v-52h510v52h-34c0-26-16-42-38-42s-38 16-38 42h-37c0-26-16-42-38-42s-38 16-38 42h-37c0-26-16-42-38-42s-38 16-38 42h-37c0-26-16-42-38-42s-38 16-38 42Z" />
            <path className="city-backdrop-line" d="M52 164h510m-480 0v-32m450 32v-32" />
            <path className="city-backdrop-fill" d="M606 230V120h82v110Zm-13-110h108l-22-26h-64Z" />
            <path className="city-backdrop-line" d="M621 141h52m-52 25h52m-52 25h52" />
        </g>
    );
}

function ToulouseScene()
{
    return (
        <g className="city-backdrop-landmarks">
            <path className="city-backdrop-fill" d="M80 230v-70h238v70Zm35-70v-34h52v34m64 0v-46h58v46" />
            <path className="city-backdrop-line" d="M103 179h190m-190 22h190m36 29V115h90v115m-74-115c9-44 50-44 58 0m-30-66v35m-8-35h16" />
            <path className="city-backdrop-fill" fillRule="evenodd" d="M465 230v-45h230v45h-27c0-22-15-35-34-35s-34 13-34 35h-27c0-22-15-35-34-35s-34 13-34 35Z" />
        </g>
    );
}

function LilleScene()
{
    return (
        <g className="city-backdrop-landmarks">
            <path className="city-backdrop-fill" d="M92 230v-76h65v76Zm82 0v-97h73v97Zm90 0v-70h65v70Zm82 0V91h58v139Zm112 0v-82h67v82Zm84 0v-104h74v104Z" />
            <path className="city-backdrop-line" d="m92 154 32-31 33 31m17-21 36-34 37 34m17 27 33-32 32 32m82-69 14-25 15 25m18 57 33-34 34 34m17-22 37-37 37 37M420 66V43m-8 0h16" />
            <path className="city-backdrop-line faint" d="M108 178h31m51-20h40m50 25h32m139-12h43m55-17h42" />
        </g>
    );
}

function StrasbourgScene()
{
    return (
        <g className="city-backdrop-landmarks">
            <path className="city-backdrop-line landmark-main" d="M329 230V113h112v117M329 113l56-57 56 57M368 230V88m34 142V88M385 56V28m-8 0h16m-28 119h40m-40 28h40" />
            <path className="city-backdrop-fill" d="M72 230v-69h83v69Zm103 0v-91h96v91Zm307 0v-77h86v77Zm106 0v-98h99v98Z" />
            <path className="city-backdrop-line" d="m72 161 41-37 42 37m20-22 48-41 48 41m211 14 43-39 43 39m20-21 49-43 50 43" />
            <path className="city-backdrop-line faint" d="m88 180 51 35m0-35-51 35m104-48 62 44m0-44-62 44m308-31 50 35m0-35-50 35" />
        </g>
    );
}

function BarcelonaScene()
{
    return (
        <g className="city-backdrop-landmarks">
            <path className="city-backdrop-fill" d="M80 230v-60h115v60Zm438 0v-72h140v72Z" />
            <path className="city-backdrop-line landmark-main" d="M284 230V96h38v134m36 0V61h40v169m37 0V105h38v125M303 96l-19-30m38 30 18-30m38-5-20-34m40 34 20-34m36 78-18-30m56 30 18-30M322 151h36m40 0h37m-94 79v-51h76v51" />
            <path className="city-backdrop-line" d="M80 170c18-22 38-22 58 0 18-22 38-22 57 0m323-12c23-29 47-29 70 0 23-29 47-29 70 0" />
        </g>
    );
}

function GenevaScene()
{
    return (
        <g className="city-backdrop-landmarks">
            <path className="city-backdrop-hill" d="M44 190 155 92l76 66 92-102 105 124 77-71 121 81" />
            <path className="city-backdrop-line landmark-main" d="M494 226c20-66 29-124 17-180m-17 180c-8-67-7-127 17-180m0 0c11 81 14 134 0 180" />
            <path className="city-backdrop-fill" d="M86 230v-46h166v46Zm474 0v-53h120v53Z" />
            <path className="city-backdrop-line" d="M32 231c47-13 94-13 141 0s94 13 141 0 94-13 141 0 94 13 141 0 94-13 141 0" />
        </g>
    );
}

function BrusselsScene()
{
    return (
        <g className="city-backdrop-landmarks">
            <path className="city-backdrop-fill" d="M70 230v-86h90v86Zm105 0v-105h98v105Zm345 0v-92h88v92Zm103 0v-72h70v72Z" />
            <path className="city-backdrop-line" d="m70 144 45-42 45 42m15-19 49-45 49 45m247 13 44-41 44 41m15 20 35-32 35 32" />
            <path className="city-backdrop-line landmark-main" d="m325 197 37-52 55 23 44-59m-99 36-5-61m60 84 69 30m-129-114 44-38m60 63-60-63" />
            <circle className="city-backdrop-fill" cx="357" cy="84" r="16" />
            <circle className="city-backdrop-fill" cx="401" cy="46" r="16" />
            <circle className="city-backdrop-fill" cx="461" cy="109" r="16" />
            <circle className="city-backdrop-fill" cx="362" cy="145" r="16" />
            <circle className="city-backdrop-fill" cx="417" cy="168" r="16" />
            <circle className="city-backdrop-fill" cx="486" cy="198" r="16" />
        </g>
    );
}

function LondonScene()
{
    return (
        <g className="city-backdrop-landmarks">
            <path className="city-backdrop-fill" d="M68 230v-65h200v65Zm328 0V94h58v136Zm234 0v-81h62v81Z" />
            <path className="city-backdrop-line" d="M88 165v-31h160v31m148-71 29-45 29 45m-29-45V27m-10 94h20m-20 32h20m-20 32h20" />
            <circle className="city-backdrop-line landmark-main no-fill" cx="548" cy="158" r="65" />
            <path className="city-backdrop-line" d="M548 93v130m-65-65h130m-111-46 92 92m0-92-92 92M548 223v7" />
        </g>
    );
}

function UrbanScene()
{
    return (
        <g className="city-backdrop-landmarks">
            <path className="city-backdrop-fill" d="M58 230v-70h96v70Zm118 0v-108h82v108Zm104 0v-82h112v82Zm134 0V96h78v134Zm100 0v-63h86v63Zm108 0v-98h78v98Z" />
            <path className="city-backdrop-line" d="M78 181h56m62-34h42m63 25h70m63-49h38m102 67h46m62-35h38" />
            <path className="city-backdrop-line faint" d="M106 230v-28m112 28v-54m124 54v-33m111 33v-72m104 72v-18m104 18v-51" />
        </g>
    );
}

function normalizeCity(value: string): string
{
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("fr")
        .replace(/[^a-z]+/g, " ")
        .trim()
        .split(" ")[0] ?? "";
}

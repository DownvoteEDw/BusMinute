const verifiedStationGroups = [
    ["alsa:FRAVNABU", "blablacar-bus:XZN", "flixbus:7c9b9a0b-7ab5-4a64-ab85-5bb90bb23515"],
    ["alsa:FRBAYBBU", "blablacar-bus:XBA", "flixbus:dcc1317e-9603-11e6-9066-549f350fcb0c"],
    ["alsa:FRBODBRD", "blablacar-bus:ZFQ"],
    ["alsa:FRCSMCSM", "blablacar-bus:CHP", "flixbus:20fcedfd-e08f-4eef-8430-5d46431f473c"],
    ["alsa:FRLECLEC", "blablacar-bus:XCN", "blablacar-bus:XCC", "flixbus:64f3ab00-d8a7-442f-91f9-ff62cdd55349"],
    ["alsa:FRLILBDT", "blablacar-bus:XDB", "flixbus:dcbf8aeb-9603-11e6-9066-549f350fcb0c"],
    ["alsa:FRLYSLGR", "blablacar-bus:XYL", "blablacar-bus:SRE", "flixbus:9fe81919-2d89-48f4-81a3-322dc4b5614d"],
    ["alsa:FRMONMON", "blablacar-bus:XMW"],
    ["alsa:FRMPLMBD", "blablacar-bus:XMT", "flixbus:dcc0b9bc-9603-11e6-9066-549f350fcb0c"],
    ["alsa:FRMRSMRA", "blablacar-bus:XRF", "flixbus:dcc2e206-9603-11e6-9066-549f350fcb0c"],
    ["alsa:FRPARPGB", "blablacar-bus:XPB", "flixbus:dcc5426b-9603-11e6-9066-549f350fcb0c"],
    ["alsa:FRPARPOL", "blablacar-bus:ORS", "flixbus:bb8595cd-a014-44f8-a636-79c4eee67290"],
    ["alsa:FRPGFBSA", "blablacar-bus:PGF", "flixbus:dcc0cbed-9603-11e6-9066-549f350fcb0c"],
    ["alsa:FRRHERTB", "blablacar-bus:XIZ", "flixbus:dcbfeac0-9603-11e6-9066-549f350fcb0c"],
    ["alsa:FRTLSGAS", "blablacar-bus:XTS", "flixbus:dcc0e74b-9603-11e6-9066-549f350fcb0c"],
    ["alsa:ESALCZOB", "blablacar-bus:ABT", "flixbus:687eb82b-bc6a-45c5-93cc-3c186b7ecc06"],
    ["alsa:ESBCNBFT", "blablacar-bus:ABY"],
    ["alsa:ESBCNEDA", "blablacar-bus:XBC", "flixbus:dcc34bb9-9603-11e6-9066-549f350fcb0c"],
    ["alsa:ESBIOBPG", "blablacar-bus:BLB", "flixbus:3314645f-7903-4bc9-b9ef-74ff161feca2"],
    ["alsa:ESEASCBS", "blablacar-bus:EAS", "flixbus:dcc17134-9603-11e6-9066-549f350fcb0c"],
    ["alsa:ESMADMAD", "blablacar-bus:MDA", "blablacar-bus:MDM"],
    ["alsa:ESMADMBB", "blablacar-bus:ACW", "flixbus:1b8eaa11-e4a2-4a88-a059-403181c2eb8c"],
    ["alsa:ESMADZOB", "blablacar-bus:MDS", "flixbus:765c44fe-f070-4e9c-8238-71c078e8734f"],
    ["alsa:ESRGSBCA", "blablacar-bus:ABU", "flixbus:acbb1926-1e7e-430d-a3cc-0edbd64d2cb5"],
    ["alsa:ESVALZOB", "blablacar-bus:ABS", "flixbus:65bc658e-3c84-4f8a-8879-fc56c2e567c5"],
    ["alsa:ESVGAVIT", "blablacar-bus:VTR", "flixbus:ec29a70c-933d-4056-a35b-0adc69b554aa"],
    ["alsa:ESVLLZOB", "blablacar-bus:AVA", "flixbus:0667ba34-c22c-40a2-a1b0-3b248c37dccf"],
    ["alsa:ESZAZSBA", "blablacar-bus:ACX", "flixbus:07597a10-0f4c-49d5-84c8-abf615bd5956"]
] as const;

const groupsByStop = new Map<string, ReadonlySet<string>>();

for (const group of verifiedStationGroups)
{
    const values = new Set(group.map((value) => value.toLocaleLowerCase("en")));

    for (const value of values)
    {
        groupsByStop.set(value, values);
    }
}

export function areVerifiedEquivalentStops(
    firstOperatorSlug: string,
    firstExternalId: string,
    secondOperatorSlug: string,
    secondExternalId: string
): boolean
{
    const first = `${firstOperatorSlug}:${firstExternalId}`.toLocaleLowerCase("en");
    const second = `${secondOperatorSlug}:${secondExternalId}`.toLocaleLowerCase("en");
    return groupsByStop.get(first)?.has(second) ?? false;
}

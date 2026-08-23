import { DateTime } from "luxon";
import type
{
    GtfsServiceCalendar,
    GtfsServiceException
} from "../../../domain/models.js";

type CalendarDay =
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";

const calendarDays: CalendarDay[] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
];

export function isServiceActive(
    calendar: GtfsServiceCalendar,
    exceptions: GtfsServiceException[],
    serviceDate: string
): boolean
{
    const matchingException = exceptions.find((exception) =>
    {
        return exception.serviceExternalId === calendar.externalId && exception.date === serviceDate;
    });

    if (matchingException)
    {
        return matchingException.type === 1;
    }

    if (serviceDate < calendar.startDate || serviceDate > calendar.endDate)
    {
        return false;
    }

    const date = DateTime.fromISO(serviceDate, { zone: "UTC" });

    if (!date.isValid)
    {
        return false;
    }

    const day = calendarDays[date.weekday - 1];
    return day ? calendar[day] : false;
}

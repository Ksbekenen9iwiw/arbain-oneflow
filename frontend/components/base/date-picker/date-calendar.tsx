"use client";

import { Calendar as AriaCalendar, RangeCalendar as AriaRangeCalendar } from "react-aria-components";
import type {
  CalendarProps as AriaCalendarProps,
  DateValue,
  RangeCalendarProps as AriaRangeCalendarProps,
} from "react-aria-components";
import { MonthPanel } from "@/components/base/date-picker/shared";
import { cx } from "@/utils/cx";

/**
 * Date calendar — a month on the page rather than in a popover: pick a day
 * for a booking, a deadline, a range of nights.
 *
 *   <DateCalendar aria-label="Delivery date" value={date} onChange={setDate} />
 *   <DateRangeCalendar aria-label="Stay" value={range} onChange={setRange} />
 *
 * Date Picker's month panel, as is: the card, the 16px month chevrons, the
 * 32px day cells 12px apart with the selected day's accent pill and the
 * range band that bridges the gaps. Today carries a small accent dot, and
 * days ruled out by `isDateUnavailable` are struck through.
 *
 * Built on React Aria's Calendar and RangeCalendar: arrows move by day,
 * Page Up and Page Down by month (with Shift, by year), Home and End to the
 * month's first and last day, and Enter picks. `minValue` and `maxValue`
 * fade the days outside them. Values are dates from @internationalized/date.
 */

export interface DateCalendarProps<T extends DateValue> extends Omit<AriaCalendarProps<T>, "className" | "children" | "visibleDuration"> {
  /** Mark today with a dot. Default true. */
  showToday?: boolean;
  className?: string;
}

export function DateCalendar<T extends DateValue>({ showToday = true, className, ...props }: DateCalendarProps<T>) {
  return (
    <AriaCalendar {...props} className={cx("inline-flex outline-none", className)}>
      <MonthPanel offset={0} showPrev showNext showToday={showToday} />
    </AriaCalendar>
  );
}

export interface DateRangeCalendarProps<T extends DateValue>
  extends Omit<AriaRangeCalendarProps<T>, "className" | "children" | "visibleDuration"> {
  /** One month, or two side by side (default). They stack when the space is narrow. */
  visibleMonths?: 1 | 2;
  /** Mark today with a dot. Default true. */
  showToday?: boolean;
  className?: string;
}

export function DateRangeCalendar<T extends DateValue>({
  visibleMonths = 2,
  showToday = true,
  className,
  ...props
}: DateRangeCalendarProps<T>) {
  return (
    <AriaRangeCalendar
      {...props}
      visibleDuration={{ months: visibleMonths }}
      className={cx("inline-flex outline-none", className)}
    >
      <div className="flex flex-wrap justify-center gap-2">
        {visibleMonths === 2 ? (
          <>
            <MonthPanel offset={0} showPrev showToday={showToday} />
            <MonthPanel offset={1} showNext showToday={showToday} />
          </>
        ) : (
          <MonthPanel offset={0} showPrev showNext showToday={showToday} />
        )}
      </div>
    </AriaRangeCalendar>
  );
}

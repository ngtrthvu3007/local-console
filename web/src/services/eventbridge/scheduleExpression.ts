import { isWholeNumberIn } from "@shared/schemas.ts";
import { RATE_UNITS, type RateUnit, type ScheduleKind } from "./constants.ts";

// Các ô nhập của form, tách khỏi chuỗi at() / rate() / cron() mà Scheduler lưu
interface ScheduleTiming {
  kind: ScheduleKind;
  atTime: string; // yyyy-mm-ddThh:mm:ss, theo timezone của schedule
  rateValue: string;
  rateUnit: RateUnit;
  cron: string;
}

export const DEFAULT_TIMING: ScheduleTiming = {
  kind: "rate",
  atTime: "",
  rateValue: "5",
  rateUnit: "minutes",
  cron: "",
};

const AT_PATTERN = /^at\((.+)\)$/;
const RATE_PATTERN = /^rate\((\d+) (minute|minutes|hour|hours|day|days)\)$/;
const CRON_PATTERN = /^cron\((.+)\)$/;
const AT_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

const RATE_VALUE = { min: 1 };
const isPlural = (value: number) => value !== 1;

// AWS đòi số ít khi giá trị là 1: rate(1 hour), rate(5 hours)
export function buildExpression(timing: ScheduleTiming): string {
  if (timing.kind === "at") return `at(${timing.atTime.trim()})`;
  if (timing.kind === "cron") return `cron(${timing.cron.trim()})`;
  const value = Number(timing.rateValue);
  return `rate(${value} ${isPlural(value) ? timing.rateUnit : timing.rateUnit.slice(0, -1)})`;
}

// Biểu thức đọc từ Scheduler → các ô của form; không đọc được thì để cron cho dev tự sửa
export function parseExpression(expression: string): ScheduleTiming {
  const at = AT_PATTERN.exec(expression);
  if (at) return { ...DEFAULT_TIMING, kind: "at", atTime: at[1] ?? "" };
  const rate = RATE_PATTERN.exec(expression);

  if (rate) {
    // minute / minutes → minutes
    const unit =
      RATE_UNITS.find((name) => rate[2]?.startsWith(name.slice(0, -1))) ?? DEFAULT_TIMING.rateUnit;
    return { ...DEFAULT_TIMING, kind: "rate", rateValue: rate[1] ?? "", rateUnit: unit };
  }

  const cron = CRON_PATTERN.exec(expression);
  return { ...DEFAULT_TIMING, kind: "cron", cron: cron?.[1] ?? expression };
}

// Lỗi của từng ô theo loại lịch; cú pháp chi tiết (cron 6 trường…) do Scheduler kiểm
export function timingErrors(
  timing: ScheduleTiming,
): Partial<Record<keyof ScheduleTiming, string>> {
  if (timing.kind === "at")
    return AT_TIME_PATTERN.test(timing.atTime.trim())
      ? {}
      : { atTime: "Use the format yyyy-mm-ddThh:mm:ss, for example 2030-01-31T09:00:00." };

  if (timing.kind === "cron")
    return timing.cron.trim() ? {} : { cron: "Enter a cron expression with 6 fields." };

  return isWholeNumberIn(timing.rateValue.trim(), RATE_VALUE)
    ? {}
    : { rateValue: "Enter a whole number, 1 or more." };
}

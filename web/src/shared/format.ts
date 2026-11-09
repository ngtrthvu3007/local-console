import {
  NOT_AVAILABLE,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from "./constants.ts";

const BYTES_PER_UNIT = 1024;
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];
const SIZE_DECIMALS = 1;
// Locale Thụy Điển in ngày giờ đúng dạng YYYY-MM-DD HH:mm:ss
const DATE_TIME_LOCALE = "sv-SE";

export function formatBytes(bytes?: number): string {
  if (bytes === undefined) return NOT_AVAILABLE;
  let amount = bytes;
  let unitIndex = 0;
  while (amount >= BYTES_PER_UNIT && unitIndex < BYTE_UNITS.length - 1) {
    amount /= BYTES_PER_UNIT;
    unitIndex++;
  }
  const value = unitIndex === 0 ? String(amount) : amount.toFixed(SIZE_DECIMALS);
  return `${value} ${BYTE_UNITS[unitIndex]}`;
}

export const formatDate = (date?: Date | string | number) =>
  date ? new Date(date).toLocaleString(DATE_TIME_LOCALE) : NOT_AVAILABLE;

export function formatTime(timestamp: number): string {
  if (!timestamp) return NOT_AVAILABLE;
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const nounFor = (count: number, singular: string, pluralForm = `${singular}s`) =>
  count === 1 ? singular : pluralForm;

export const pluralize = (count: number, singular: string, pluralForm?: string) =>
  `${count} ${nounFor(count, singular, pluralForm)}`;

const DURATION_UNITS = [
  { seconds: SECONDS_PER_DAY, suffix: "d" },
  { seconds: SECONDS_PER_HOUR, suffix: "h" },
  { seconds: SECONDS_PER_MINUTE, suffix: "m" },
  { seconds: 1, suffix: "s" },
];
// Hai đơn vị lớn nhất là đủ đọc: 59m 12s, 6h 0m, 3d 4h
const DURATION_PARTS = 2;

export function formatDuration(totalSeconds: number): string {
  const first = DURATION_UNITS.findIndex((unit) => totalSeconds >= unit.seconds);
  if (first < 0) return `${totalSeconds}s`;
  let remaining = totalSeconds;
  return DURATION_UNITS.slice(first, first + DURATION_PARTS)
    .map((unit) => {
      const amount = Math.floor(remaining / unit.seconds);
      remaining -= amount * unit.seconds;
      return `${amount}${unit.suffix}`;
    })
    .join(" ");
}

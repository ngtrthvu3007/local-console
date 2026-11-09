import { NOT_AVAILABLE } from "./constants.ts";

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

export const formatDate = (date?: Date | string) =>
  date ? new Date(date).toLocaleString(DATE_TIME_LOCALE) : NOT_AVAILABLE;

export function formatTime(timestamp: number): string {
  if (!timestamp) return NOT_AVAILABLE;
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const nounFor = (count: number, singular: string, pluralForm = `${singular}s`) =>
  count === 1 ? singular : pluralForm;

export const pluralize = (count: number, singular: string, pluralForm?: string) =>
  `${count} ${nounFor(count, singular, pluralForm)}`;

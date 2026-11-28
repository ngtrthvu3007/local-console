// Floci nhận credential bất kỳ
export const AWS_TEST_CREDENTIALS = {
  accessKeyId: "test",
  secretAccessKey: "test",
} as const;

export const FLOCI_ACCOUNT_ID = "000000000000";
// DNS công khai trỏ cả subdomain về 127.0.0.1; *.localhost thì Node / Python trên Windows không resolve được
export const FLOCI_HOSTNAME = "localhost.floci.io";
export const FLOCI_SERVICE_RUNNING = "running";

export const MILLISECONDS_PER_SECOND = 1000;
export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

export const KIBIBYTE = 1024;
export const MEBIBYTE = 1024 * KIBIBYTE;

export const NOT_AVAILABLE = "—";

export const DETAIL_SEPARATOR = " · ";
export const LIST_SEPARATOR = ", ";

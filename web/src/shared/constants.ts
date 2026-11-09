export const APP_NAME = "Local Console";
export const LOGO_PATH = "/mark.svg";
export const HOME_PATH = "/";

export const AWS_PROXY_PATH = "/aws";
export const API_PATHS = {
  health: "/api/health",
  config: "/api/config",
} as const;
export const FLOCI_PATHS = {
  info: `${AWS_PROXY_PATH}/_floci/info`,
  health: `${AWS_PROXY_PATH}/_floci/health`,
} as const;
export const FLOCI_SERVICE_RUNNING = "running";
export const FLOCI_START_COMMAND = "docker compose up -d floci";

// Floci nhận credential bất kỳ
export const AWS_TEST_CREDENTIALS = { accessKeyId: "test", secretAccessKey: "test" } as const;
export const FLOCI_ACCOUNT_ID = "000000000000";

// Region hiển thị kèm mã Local Zone
export const REGION_LABELS: Record<string, string> = {
  "ap-southeast-1": "ap-southeast-1-han-1a (Ha Noi)",
};

export const MILLISECONDS_PER_SECOND = 1000;
export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

export const HEALTH_REFRESH_INTERVAL_MS = 10 * MILLISECONDS_PER_SECOND;
export const SUCCESS_MESSAGE_LIFETIME_MS = 5 * MILLISECONDS_PER_SECOND;
export const FLASHBAR_STACK_THRESHOLD = 3;
export const QUERY_RETRY_COUNT = 1;

export const COPY_TEXTS = {
  copy: "Copy",
  copied: "Copied",
  failed: "Couldn't copy",
} as const;

// Khung hẹp hơn mức này thì gom nút vào dropdown và ẩn cột phụ của bảng
export const COMPACT_WIDTH_PX = 900;
export const SERVICE_ICON_SIZE_PX = 20;

// Modal xóa hàng loạt chỉ liệt kê vài mục đầu
export const DELETE_PREVIEW_COUNT = 8;

export const NOT_AVAILABLE = "—";
export const LOADING_PLACEHOLDER = "…";

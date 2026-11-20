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
// Chỉ gặp khi chạy UI bằng npm run dev:web; console trong Docker tự phục vụ trang này
export const DEV_SERVER_START_COMMAND = "npm run dev:server";

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
// Mốc điện thoại của Cloudscape: dưới mức này panel luôn nằm dưới
export const PHONE_MAX_WIDTH_PX = 688;
// Panel bên phải rộng 480px; trên điện thoại panel cao 2/3 màn hình để bảng bên trong có chỗ
export const SPLIT_PANEL_SIDE_WIDTH_PX = 480;
export const SPLIT_PANEL_PHONE_HEIGHT_RATIO = 2 / 3;
// Icon service: glyph trắng (Tabler) trên ô màu của danh mục; cỡ ô ở --service-icon-size (Layout.css)
export const SERVICE_GLYPH_SIZE_PX = 16;

// Nhóm service trên sidebar (theo thứ tự này) và màu ô icon, theo danh mục của AWS console
export const SERVICE_CATEGORIES = {
  compute: { label: "Compute", color: "#ED7100" },
  storage: { label: "Storage", color: "#3F8624" },
  database: { label: "Database", color: "#2E27AD" },
  integration: { label: "Application integration", color: "#E7157B" },
  business: { label: "Business applications", color: "#DD344C" },
} as const;
export type ServiceCategory = keyof typeof SERVICE_CATEGORIES;

// Modal xóa hàng loạt chỉ liệt kê vài mục đầu
export const DELETE_PREVIEW_COUNT = 8;

export const NOT_AVAILABLE = "—";

// Ngăn các phần trong một dòng mô tả: "pk String · sk String · 68 items"
export const DETAIL_SEPARATOR = " · ";
// Dưới độ rộng này bảng thành danh sách hai tầng (điện thoại); tablet vẫn giữ dạng bảng nhiều cột
// Cùng mốc phone với Cloudscape; ResizeObserver dùng phép so sánh <.
export const ITEM_LIST_WIDTH_PX = PHONE_MAX_WIDTH_PX + 1;
export const LOADING_PLACEHOLDER = "…";

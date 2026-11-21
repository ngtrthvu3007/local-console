// Chữ, số, dấu chấm, gạch ngang, gạch dưới: bus, rule, schedule và schedule group
export const NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
// Luật đặt tên: event bus 1–256 ký tự; rule, schedule và schedule group 1–64 ký tự
export const BUS_NAME_MAX_LENGTH = 256;
export const NAME_MAX_LENGTH = 64;
export const nameConstraint = (maxLength: number) =>
  `Up to ${maxLength} characters: letters, numbers, periods, hyphens and underscores.`;
// Bus có sẵn: không tạo trùng, không xóa được
export const DEFAULT_BUS_NAME = "default";

export const EDITOR_HEIGHT_PX = 200;
export const DEFAULT_EVENT_DETAIL = '{\n  "message": "hello"\n}';
export const DEFAULT_EVENT_SOURCE = "my.app";

// EventBridge không báo event đi tới target nào
export const DELIVERY_HINT =
  "To check delivery, peek the target queues or open the function's Monitor tab.";

export const RULE_TYPES = { pattern: "Event pattern", schedule: "Schedule" } as const;
export type RuleType = keyof typeof RULE_TYPES;
export const DEFAULT_EVENT_PATTERN = `{\n  "source": ["${DEFAULT_EVENT_SOURCE}"]\n}`;
export const DEFAULT_SAMPLE_EVENT = `{\n  "source": "${DEFAULT_EVENT_SOURCE}",\n  "detail-type": "OrderCreated",\n  "detail": {}\n}`;
// Rule theo lịch: rate(5 minutes), cron(0 9 * * ? *)
export const SCHEDULE_EXPRESSION_PATTERN = /^(rate|cron)\(.+\)$/;
export const SCHEDULE_PLACEHOLDER = "rate(5 minutes)";

export const RULE_STATES = { enabled: "ENABLED", disabled: "DISABLED" } as const;

export const DEFAULT_SCHEDULE_GROUP = "default";
export const SCHEDULE_KINDS = {
  at: "One-time",
  rate: "Recurring: rate",
  cron: "Recurring: cron",
} as const;
export type ScheduleKind = keyof typeof SCHEDULE_KINDS;
export const RATE_UNITS = ["minutes", "hours", "days"] as const;
export type RateUnit = (typeof RATE_UNITS)[number];
export const SCHEDULE_STATES = { enabled: "ENABLED", disabled: "DISABLED" } as const;
export const FLEXIBLE_MODES = { off: "OFF", flexible: "FLEXIBLE" } as const;
export const DEFAULT_FLEXIBLE_MINUTES = "5";
// Schedule `at` tự xóa sau khi chạy hay giữ lại
export const AFTER_COMPLETION = { delete: "DELETE", keep: "NONE" } as const;

// ID cố định của cache policy managed (AWS và Floci): CDK và AWS console mặc định dùng nó
export const MANAGED_CACHING_OPTIMIZED_ID = "658327ea-f89d-4fab-a63d-7e88639e58f6";
// Floci không áp viewer protocol (spec 7 #8): giữ mặc định ít chặn nhất để URL local http chạy
export const VIEWER_PROTOCOL_POLICY = "allow-all";
export const DEFAULT_ROOT_OBJECT = "index.html";

// SPA: S3 trả 403 / 404 cho route của client, CloudFront trả root object với 200
export const SPA_ERROR_CODES = [403, 404];
export const SPA_RESPONSE_CODE = "200";

export const ORIGIN_TYPES = { s3: "s3", custom: "custom" } as const;
export type OriginType = (typeof ORIGIN_TYPES)[keyof typeof ORIGIN_TYPES];

export const ORIGIN_PROTOCOLS = { http: "http-only", https: "https-only" } as const;
export type OriginProtocol = (typeof ORIGIN_PROTOCOLS)[keyof typeof ORIGIN_PROTOCOLS];
export const ORIGIN_PORTS: Record<OriginProtocol, number> = { "http-only": 80, "https-only": 443 };
export const ORIGIN_PROTOCOL_LABELS: Record<OriginProtocol, string> = {
  "http-only": "HTTP only",
  "https-only": "HTTPS only",
};
export const PORT_RANGE = { min: 1, max: 65535 } as const;

export const DEFAULT_BEHAVIOR_PATH = "*";
export const DEFAULT_BEHAVIOR_LABEL = "Default (*)";

export const DEFAULT_INVALIDATION_PATH = "/*";
export const INVALIDATION_COMPLETED = "Completed";

// URL local: Floci phục vụ distribution ở <id>.cloudfront.localhost (spec 7 #2)
export const LOCAL_HOST_SUFFIX = "cloudfront.localhost";

import type {
  CacheBehavior,
  CustomErrorResponse,
  DefaultCacheBehavior,
  DistributionConfig,
  DistributionSummary,
  Origin,
} from "@aws-sdk/client-cloudfront";
import {
  DEFAULT_BEHAVIOR_LABEL,
  DEFAULT_BEHAVIOR_PATH,
  LOCAL_HOST_SUFFIX,
  MANAGED_CACHING_OPTIMIZED_ID,
  ORIGIN_PORTS,
  ORIGIN_PROTOCOLS,
  ORIGIN_TYPES,
  SPA_ERROR_CODES,
  SPA_RESPONSE_CODE,
  VIEWER_PROTOCOL_POLICY,
  type OriginProtocol,
  type OriginType,
} from "./constants.ts";

// Hàm thuần trên DistributionConfig. CloudFront bắt gửi lại toàn bộ cấu hình, nên mọi hàm giữ nguyên
// field console không hiện (OAC, header, function, ForwardedValues…) và chỉ đổi phần được sửa

// Floci bỏ Items khi danh sách rỗng; AWS bắt Quantity khớp số Items (Floci không kiểm, spec 7 #11)
const listOf = <T>(items: T[]) => ({ Quantity: items.length, Items: items });

const missing = (kind: string, name: string) =>
  new Error(`${kind} ${name} no longer exists. Refresh the page.`);

// <bucket>.s3.amazonaws.com hoặc <bucket>.s3.<region>.amazonaws.com: hai dạng Floci phục vụ từ S3 của nó
const S3_ORIGIN_DOMAIN = /^(.+)\.s3(?:\.[a-z0-9-]+)?\.amazonaws\.com$/;

// Host cố định *.cloudfront.localhost.floci.io; chỉ lấy scheme + port của Floci, vì host của
// FLOCI_PUBLIC_URL có thể là IP
export function localUrl(flociPublicUrl: string, id: string): string {
  const url = new URL(flociPublicUrl);
  url.hostname = `${id.toLowerCase()}.${LOCAL_HOST_SUFFIX}`;
  return `${url.origin}/`;
}

export const s3OriginDomain = (bucket: string, region: string) =>
  `${bucket}.s3.${region}.amazonaws.com`;

export const bucketOfOriginDomain = (domain: string): string | undefined =>
  S3_ORIGIN_DOMAIN.exec(domain)?.[1];

// Trang bucket: distribution có origin là bucket đó (summary của Floci có origin, spec 7 #10)
export const distributionsServing = <
  T extends Pick<DistributionSummary, "Id"> & { Origins?: DistributionSummary["Origins"] },
>(
  summaries: readonly T[],
  bucket: string,
) =>
  summaries.filter((summary) =>
    (summary.Origins?.Items ?? []).some(
      (origin) => bucketOfOriginDomain(origin.DomainName ?? "") === bucket,
    ),
  );

export const originsOf = (config: DistributionConfig): Origin[] => config.Origins?.Items ?? [];

export const errorResponsesOf = (config: DistributionConfig): CustomErrorResponse[] =>
  config.CustomErrorResponses?.Items ?? [];

const extraBehaviorsOf = (config: DistributionConfig): CacheBehavior[] =>
  config.CacheBehaviors?.Items ?? [];

// Behavior theo thứ tự khớp của CloudFront: các behavior phụ rồi tới default (PathPattern "*")
export function behaviorsOf(config: DistributionConfig): CacheBehavior[] {
  const fallback = config.DefaultCacheBehavior;
  const defaults = fallback ? [{ ...fallback, PathPattern: DEFAULT_BEHAVIOR_PATH }] : [];
  return [...extraBehaviorsOf(config), ...defaults];
}

// Nhãn các behavior trỏ vào origin, default đứng đầu: lý do không cho xóa origin
export function behaviorsUsing(config: DistributionConfig, originId: string): string[] {
  const usesDefault = config.DefaultCacheBehavior?.TargetOriginId === originId;
  const extras = extraBehaviorsOf(config)
    .filter((behavior) => behavior.TargetOriginId === originId)
    .map((behavior) => behavior.PathPattern ?? "");
  return usesDefault ? [DEFAULT_BEHAVIOR_LABEL, ...extras] : extras;
}

const isSpaResponse = (response: CustomErrorResponse) =>
  SPA_ERROR_CODES.includes(response.ErrorCode ?? 0) && response.ResponseCode === SPA_RESPONSE_CODE;

export const isSpa = (config: DistributionConfig) =>
  SPA_ERROR_CODES.every((code) =>
    errorResponsesOf(config).some(
      (response) => response.ErrorCode === code && isSpaResponse(response),
    ),
  );

export interface DistributionSettings {
  description: string;
  defaultRootObject: string;
  spa: boolean;
}

// Error page chỉ đổi khi bật / tắt SPA hoặc đổi root object: sửa mô tả không được đụng error page CDK đặt
// (vd chỉ 403, hoặc SPA trỏ /app/index.html). SPA bật: 403 / 404 trỏ về root object, giữ TTL đang có.
// Tắt: chỉ bỏ hai mục kiểu SPA, giữ error page khác (vd 404 → /404.html của site tĩnh)
export function withSettings(
  config: DistributionConfig,
  { description, defaultRootObject, spa }: DistributionSettings,
): DistributionConfig {
  const settings = { ...config, Comment: description, DefaultRootObject: defaultRootObject };
  if (spa === isSpa(config) && defaultRootObject === config.DefaultRootObject) return settings;

  const responses = errorResponsesOf(config);
  const kept = responses.filter((response) =>
    spa ? !SPA_ERROR_CODES.includes(response.ErrorCode ?? 0) : !isSpaResponse(response),
  );
  const spaResponses = spa
    ? SPA_ERROR_CODES.map((code) => ({
        ...responses.find((response) => response.ErrorCode === code),
        ErrorCode: code,
        ResponsePagePath: `/${defaultRootObject}`,
        ResponseCode: SPA_RESPONSE_CODE,
      }))
    : [];

  return { ...settings, CustomErrorResponses: listOf([...kept, ...spaResponses]) };
}

// Thêm origin, hoặc ghép vào origin cùng Id (giữ timeout, header, OAC…). replace: đang sửa origin có sẵn,
// mà cấu hình mới không còn nó thì báo lỗi thay vì lặng lẽ thêm lại
export function withOrigin(
  config: DistributionConfig,
  origin: Origin,
  { replace = false }: { replace?: boolean } = {},
): DistributionConfig {
  const origins = originsOf(config);
  const index = origins.findIndex((current) => current.Id === origin.Id);
  if (replace && index < 0) throw missing("Origin", origin.Id ?? "");

  const current = origins[index];
  const next = current
    ? {
        ...current,
        ...origin,
        CustomOriginConfig: origin.CustomOriginConfig && {
          ...current.CustomOriginConfig,
          ...origin.CustomOriginConfig,
        },
      }
    : origin;

  return {
    ...config,
    Origins: listOf(current ? origins.with(index, next) : [...origins, next]),
  };
}

// Một tiêu chí cho bảng và modal: origin S3 là origin có S3OriginConfig (CDK đặt cả khi dùng OAC)
export const originTypeOf = (origin: Origin): OriginType =>
  origin.S3OriginConfig ? ORIGIN_TYPES.s3 : ORIGIN_TYPES.custom;

// match-viewer và các giá trị khác hiện là HTTP trong form
export const protocolOf = (origin: Origin): OriginProtocol =>
  origin.CustomOriginConfig?.OriginProtocolPolicy === ORIGIN_PROTOCOLS.https
    ? ORIGIN_PROTOCOLS.https
    : ORIGIN_PROTOCOLS.http;

export const portOf = (origin: Origin, protocol: OriginProtocol) =>
  (protocol === ORIGIN_PROTOCOLS.https
    ? origin.CustomOriginConfig?.HTTPSPort
    : origin.CustomOriginConfig?.HTTPPort) ?? ORIGIN_PORTS[protocol];

export interface OriginInput {
  type: OriginType;
  bucket: string;
  domain: string;
  protocol: OriginProtocol;
  port: number;
  path: string;
  id: string;
}

// Origin từ form. Sửa (có current) thì giữ thứ người dùng không đổi: domain S3 dạng toàn cục khi vẫn là
// bucket đó, protocol match-viewer khi vẫn chọn HTTP, port của protocol kia, S3OriginConfig (OAI)
export function originFromForm(input: OriginInput, region: string, current?: Origin): Origin {
  const base = { Id: input.id, OriginPath: input.path };

  if (input.type === ORIGIN_TYPES.s3) {
    const currentDomain = current?.DomainName;
    const sameBucket = currentDomain && bucketOfOriginDomain(currentDomain) === input.bucket;
    return {
      ...base,
      DomainName: sameBucket ? currentDomain : s3OriginDomain(input.bucket, region),
      ...(current ? {} : { S3OriginConfig: { OriginAccessIdentity: "" } }),
    };
  }

  const config = current?.CustomOriginConfig;
  const currentPolicy = config?.OriginProtocolPolicy;
  const keepPolicy = currentPolicy && current && protocolOf(current) === input.protocol;
  const https = input.protocol === ORIGIN_PROTOCOLS.https;

  return {
    ...base,
    DomainName: input.domain,
    CustomOriginConfig: {
      OriginProtocolPolicy: keepPolicy ? currentPolicy : input.protocol,
      HTTPPort: https ? (config?.HTTPPort ?? ORIGIN_PORTS[ORIGIN_PROTOCOLS.http]) : input.port,
      HTTPSPort: https ? input.port : (config?.HTTPSPort ?? ORIGIN_PORTS[ORIGIN_PROTOCOLS.https]),
    },
  };
}

export function withoutOrigin(config: DistributionConfig, id: string): DistributionConfig {
  const origins = originsOf(config);
  if (!origins.some((origin) => origin.Id === id)) throw missing("Origin", id);
  return { ...config, Origins: listOf(origins.filter((origin) => origin.Id !== id)) };
}

export interface BehaviorChange {
  originalPath?: string; // không có = behavior mới
  path: string;
  originId: string;
}

// Behavior mới thêm cuối (trước default) với policy mặc định như AWS console / CDK. Sửa chỉ đổi path và
// origin, giữ policy, function
export function withBehavior(
  config: DistributionConfig,
  { originalPath, path, originId }: BehaviorChange,
): DistributionConfig {
  if (originalPath === DEFAULT_BEHAVIOR_PATH) {
    const fallback: DefaultCacheBehavior = config.DefaultCacheBehavior ?? {
      TargetOriginId: originId,
      ViewerProtocolPolicy: VIEWER_PROTOCOL_POLICY,
    };
    return { ...config, DefaultCacheBehavior: { ...fallback, TargetOriginId: originId } };
  }

  const behaviors = extraBehaviorsOf(config);
  if (!originalPath) {
    const added: CacheBehavior = {
      PathPattern: path,
      TargetOriginId: originId,
      ViewerProtocolPolicy: VIEWER_PROTOCOL_POLICY,
      CachePolicyId: MANAGED_CACHING_OPTIMIZED_ID,
    };
    return { ...config, CacheBehaviors: listOf([...behaviors, added]) };
  }

  const index = behaviors.findIndex((behavior) => behavior.PathPattern === originalPath);
  if (index < 0) throw missing("Behavior", originalPath);
  const edited = { ...behaviors[index], PathPattern: path, TargetOriginId: originId };
  return { ...config, CacheBehaviors: listOf(behaviors.with(index, edited)) };
}

export function withoutBehavior(config: DistributionConfig, path: string): DistributionConfig {
  const behaviors = extraBehaviorsOf(config);
  if (!behaviors.some((behavior) => behavior.PathPattern === path)) throw missing("Behavior", path);
  return {
    ...config,
    CacheBehaviors: listOf(behaviors.filter((behavior) => behavior.PathPattern !== path)),
  };
}

// Floci khớp behavior theo thứ tự như AWS (spec 7 #12); default luôn cuối nên không đổi chỗ
export function moveBehavior(
  config: DistributionConfig,
  path: string,
  offset: -1 | 1,
): DistributionConfig {
  const behaviors = extraBehaviorsOf(config);
  const index = behaviors.findIndex((behavior) => behavior.PathPattern === path);
  if (index < 0) throw missing("Behavior", path);

  const target = index + offset;
  if (target < 0 || target >= behaviors.length) return config;
  const moved = behaviors.with(index, behaviors[target]).with(target, behaviors[index]);
  return { ...config, CacheBehaviors: listOf(moved) };
}

export const withEnabled = (config: DistributionConfig, enabled: boolean): DistributionConfig => ({
  ...config,
  Enabled: enabled,
});

export interface NewDistribution extends DistributionSettings {
  bucket: string;
  region: string;
}

// Origin S3 theo dạng CDK dùng (RegionalDomainName, spec 7 #9), Id = domain như AWS console
export function newDistributionConfig({
  bucket,
  region,
  ...settings
}: NewDistribution): DistributionConfig {
  const domain = s3OriginDomain(bucket, region);
  const base: DistributionConfig = {
    CallerReference: crypto.randomUUID(),
    Comment: settings.description,
    Enabled: true,
    Origins: listOf([
      {
        Id: domain,
        DomainName: domain,
        OriginPath: "",
        S3OriginConfig: { OriginAccessIdentity: "" },
      },
    ]),
    DefaultCacheBehavior: {
      TargetOriginId: domain,
      ViewerProtocolPolicy: VIEWER_PROTOCOL_POLICY,
      CachePolicyId: MANAGED_CACHING_OPTIMIZED_ID,
    },
  };
  return withSettings(base, settings);
}

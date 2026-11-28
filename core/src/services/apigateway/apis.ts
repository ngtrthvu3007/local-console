import { WEBSOCKET_PROTOCOL } from "./constants.ts";
import type { ApiVersion } from "./paths.ts";

export const API_TYPES = { rest: "REST", http: "HTTP", websocket: "WebSocket" } as const;
export type ApiType = (typeof API_TYPES)[keyof typeof API_TYPES];

export interface ApiRow {
  id: string;
  name: string;
  version: ApiVersion;
  type: ApiType;
  created?: Date;
}

export const apiTypeOf = (protocol?: string): ApiType =>
  protocol === WEBSOCKET_PROTOCOL ? API_TYPES.websocket : API_TYPES.http;

// Nhãn họ API để người đọc biết thiếu loại nào
export const API_FAMILIES = {
  rest: API_TYPES.rest,
  v2: `${API_TYPES.http} / ${API_TYPES.websocket}`,
};

export interface ApiFailure {
  family: string;
  error: unknown;
}

export interface ApiListing {
  rows: ApiRow[];
  failures: ApiFailure[]; // nửa không đọc được; nửa còn lại vẫn hiện
}

export interface ApiDetail {
  name: string;
  description?: string;
  type: ApiType;
  created?: Date;
  routeSelection?: string;
}

export interface AuthorizerRow {
  id: string;
  name: string;
  type: string;
  identitySource: string;
  target?: string;
  providerArns?: string[];
  issuer?: string;
  audience?: string[];
}

export interface StageRow {
  name: string;
  deploymentId?: string;
  updated?: Date;
}

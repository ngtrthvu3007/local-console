import { ARN_SEPARATOR } from "@shared/arn.ts";
import { FLOCI_ACCOUNT_ID } from "@shared/constants.ts";
import { secretNameOfArn } from "../secretsmanager/routes.ts";
import { STATUS } from "./constants.ts";
import type { RevisionRow } from "./hooks/useTaskDefinitions.ts";

const PATH_SEPARATOR = "/";
const REVISION_SEPARATOR = ":";
const CLUSTER_MARKER = ":cluster/";
const SERVICE_MARKER = ":service/";
const TASK_DEFINITION_MARKER = ":task-definition/";
const SECRETS_ARN_PREFIX = "arn:aws:secretsmanager:";
// ARN secret có 7 phần "arn:aws:secretsmanager:<region>:<account>:secret:<tên>-<6 ký tự>";
// phần sau (":<json key>:<stage>:<version>") là tùy chọn của ECS, không thuộc tên secret
const SECRET_ARN_PARTS = 7;

const afterMarker = (text: string, marker: string) => {
  const at = text.indexOf(marker);
  return at < 0 ? undefined : text.slice(at + marker.length);
};

// Tham số Cluster nhận cả tên lẫn ARN
export const clusterNameOf = (nameOrArn: string) =>
  afterMarker(nameOrArn, CLUSTER_MARKER) ?? nameOrArn;

// "…:task/<cluster>/<id>" → "<id>"
export const taskIdOf = (arn: string) => arn.split(PATH_SEPARATOR).pop() ?? arn;

// "…:service/<cluster>/<service>"; ARN kiểu cũ không có cluster → undefined
export function serviceRefOf(arn: string) {
  const [cluster, service] = afterMarker(arn, SERVICE_MARKER)?.split(PATH_SEPARATOR) ?? [];
  return cluster && service ? { cluster, service } : undefined;
}

// "…:task-definition/<family>:<revision>"; nhận cả "<family>:<revision>".
// Không có revision (target / CDK trỏ family = revision mới nhất) thì revision là undefined
export function taskDefinitionRefOf(arnOrLabel: string): { family: string; revision?: number } {
  const label = afterMarker(arnOrLabel, TASK_DEFINITION_MARKER) ?? arnOrLabel;
  const at = label.lastIndexOf(REVISION_SEPARATOR);
  if (at < 0) return { family: label, revision: undefined };
  return { family: label.slice(0, at), revision: Number(label.slice(at + 1)) };
}

// Target ECS của EventBridge / Scheduler cần ARN đầy đủ, form chỉ có family + revision
export const taskDefinitionArn = (region: string, family: string, revision: string | number) =>
  `arn:aws:ecs:${region}:${FLOCI_ACCOUNT_ID}${TASK_DEFINITION_MARKER}${family}${REVISION_SEPARATOR}${revision}`;

export const taskDefinitionLabel = (arn: string) => {
  const { family, revision } = taskDefinitionRefOf(arn);
  return revision === undefined ? family : `${family}${REVISION_SEPARATOR}${revision}`;
};

// ListTaskDefinitions lọc theo prefix: "api" cũng khớp "api-worker"
export const revisionsOfFamily = (arns: string[], family: string) =>
  arns
    .map((arn) => ({ arn, ...taskDefinitionRefOf(arn) }))
    .filter((ref) => ref.family === family)
    .sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0))
    .map((ref) => ref.arn);

// Revision nên chọn sẵn, undefined = giữ nguyên. Revision đang dùng mà đã Inactive vẫn giữ
// (mở Update chỉ để đổi desired count không được âm thầm deploy revision khác);
// chỉ chọn mới nhất Active khi ô trống hoặc revision không thuộc family (vừa đổi family)
export function revisionToSelect(rows: readonly RevisionRow[], revision: string) {
  const latestActive = rows.find((row) => row.status === STATUS.active);
  if (!latestActive || rows.some((row) => String(row.revision) === revision)) return undefined;
  return String(latestActive.revision);
}

// valueFrom của secrets: ARN Secrets Manager (có thể kèm JSON key) hoặc tên / ARN parameter SSM
export function secretRefOf(valueFrom: string) {
  if (!valueFrom.startsWith(SECRETS_ARN_PREFIX)) {
    return { kind: "parameter" as const, name: valueFrom };
  }

  const secretArn = valueFrom.split(ARN_SEPARATOR).slice(0, SECRET_ARN_PARTS).join(ARN_SEPARATOR);
  return { kind: "secret" as const, name: secretNameOfArn(secretArn) };
}

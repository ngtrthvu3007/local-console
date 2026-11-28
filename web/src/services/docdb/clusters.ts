import type { DBCluster, DBInstance } from "@aws-sdk/client-rds";
import {
  DOCDB_PORT,
  FLOCI_CONTAINER_PREFIX,
  FORWARD_CONTAINER_PREFIX,
  PASSWORD_PLACEHOLDER,
  SOCAT_IMAGE,
  USER_PLACEHOLDER,
} from "./constants.ts";

export interface ClusterRow {
  id: string;
  status?: string;
  endpoint?: string;
  readerEndpoint?: string;
  port: number;
  username?: string;
  engineVersion?: string;
  instances: DBInstance[];
}

// Floci trả DBClusterMembers rỗng (spec 7 #2): gom instance bằng DBClusterIdentifier của chúng
export function groupClusters(clusters: DBCluster[], instances: DBInstance[]): ClusterRow[] {
  return clusters.map((cluster) => ({
    id: cluster.DBClusterIdentifier ?? "",
    status: cluster.Status,
    endpoint: cluster.Endpoint,
    readerEndpoint: cluster.ReaderEndpoint,
    port: cluster.Port ?? DOCDB_PORT,
    username: cluster.MasterUsername,
    engineVersion: cluster.EngineVersion,
    instances: instances.filter(
      (instance) => instance.DBClusterIdentifier === cluster.DBClusterIdentifier,
    ),
  }));
}

// App trong compose / Lambda: tới thẳng endpoint (IP trong network compose). Floci không TLS
export const appConnectionString = (
  row: Pick<ClusterRow, "endpoint" | "port">,
  user = USER_PLACEHOLDER,
) =>
  `mongodb://${user}:${PASSWORD_PLACEHOLDER}@${row.endpoint}:${row.port}/?directConnection=true&retryWrites=false`;

// GUI trên máy (Compass, mongosh) qua cầu nối socat
export const localConnectionString = (user = USER_PLACEHOLDER) =>
  `mongodb://${user}:${PASSWORD_PLACEHOLDER}@localhost:${DOCDB_PORT}/?directConnection=true`;

// Network lấy từ chính container MongoDB nên không phụ thuộc tên thư mục compose; đích là tên
// container (tạo lại cluster cùng tên vẫn dùng được); chỉ 127.0.0.1 để không lộ ra mạng LAN
export function socatCommand(cluster: string) {
  const container = `${FLOCI_CONTAINER_PREFIX}${cluster}`;
  const network = `"$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' ${container})"`;
  return [
    `docker run --rm -d --name ${FORWARD_CONTAINER_PREFIX}${cluster} \\`,
    `  --network ${network} \\`,
    `  -p 127.0.0.1:${DOCDB_PORT}:${DOCDB_PORT} ${SOCAT_IMAGE} \\`,
    `  tcp-listen:${DOCDB_PORT},fork,reuseaddr tcp-connect:${container}:${DOCDB_PORT}`,
  ].join("\n");
}

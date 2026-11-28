import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import {
  buildResourceIndex,
  createCloudFormationService,
  indexKey,
} from "@localconsole/core/cloudformation";
import { awsClient } from "@localconsole/core/shared";
import { proxyEndpoint } from "@shared/aws.ts";

// Chỉ nạp qua import() động (useResourceIndex): import tên cụ thể để SDK nằm ở chunk riêng
export async function loadStackLookup(region: string) {
  const client = awsClient(CloudFormationClient, { region, endpoint: proxyEndpoint() });
  const index = buildResourceIndex(
    await createCloudFormationService(client).listStacksWithResources(),
  );
  return (type: string, physicalId: string) => index.get(indexKey(type, physicalId));
}

import {
  CreateDistributionCommand,
  DeleteDistributionCommand,
  GetDistributionCommand,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
  paginateListDistributions,
  type CloudFrontClient,
  type DistributionConfig,
} from "@aws-sdk/client-cloudfront";
import { orEmptyWhenNotFound } from "#shared/aws/errors.ts";
import { collectPages } from "#shared/aws/pagination.ts";

const STALE_ETAG_ERROR = "InvalidIfMatchVersion";
const STALE_ETAG_MESSAGE = "The distribution changed while saving. Try again.";

// Summary của Floci có Comment, Enabled, origin (spec 7 #10): một lần gọi, không gọi thêm từng dòng
export const listDistributions = (cloudfront: CloudFrontClient) =>
  collectPages(
    paginateListDistributions({ client: cloudfront }, {}),
    (page) => page.DistributionList?.Items,
  );

// null = không có distribution
export const getDistribution = (cloudfront: CloudFrontClient, id: string) =>
  orEmptyWhenNotFound(
    async () =>
      (await cloudfront.send(new GetDistributionCommand({ Id: id }))).Distribution ?? null,
    null,
  );

async function readConfig(cloudfront: CloudFrontClient, id: string) {
  const { DistributionConfig: config, ETag } = await cloudfront.send(
    new GetDistributionConfigCommand({ Id: id }),
  );
  if (!config) throw new Error(`Distribution ${id} has no configuration.`);
  return { config, etag: ETag };
}

// CloudFront bắt gửi lại toàn bộ cấu hình + ETag: đọc lại ngay lúc lưu rồi áp thay đổi, nên thay đổi nơi
// khác (CDK, app) ở phần khác vẫn giữ (spec 4). Hai lần lưu chen nhau thì Floci từ chối ETag cũ
export async function updateDistribution(
  cloudfront: CloudFrontClient,
  id: string,
  change: (config: DistributionConfig) => DistributionConfig,
) {
  const { config, etag } = await readConfig(cloudfront, id);
  try {
    await cloudfront.send(
      new UpdateDistributionCommand({ Id: id, IfMatch: etag, DistributionConfig: change(config) }),
    );
  } catch (error) {
    if (error instanceof Error && error.name === STALE_ETAG_ERROR) {
      throw new Error(STALE_ETAG_MESSAGE);
    }
    throw error;
  }
}

export async function deleteDistribution(cloudfront: CloudFrontClient, id: string) {
  const { etag } = await readConfig(cloudfront, id);
  await cloudfront.send(new DeleteDistributionCommand({ Id: id, IfMatch: etag }));
}

export async function createDistribution(cloudfront: CloudFrontClient, config: DistributionConfig) {
  const { Distribution } = await cloudfront.send(
    new CreateDistributionCommand({ DistributionConfig: config }),
  );
  return Distribution?.Id ?? "";
}

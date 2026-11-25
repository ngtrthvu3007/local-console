import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CloudFrontClient,
  CreateDistributionCommand,
  DeleteDistributionCommand,
  GetDistributionCommand,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
  paginateListDistributions,
  type DistributionConfig,
  type DistributionSummary,
} from "@aws-sdk/client-cloudfront";
import { isNotFoundError } from "@shared/aws.ts";
import { useCloudFront } from "./useCloudFront.ts";

// Mọi query của CloudFront nằm dưới key gốc này
export const CLOUDFRONT_QUERY_ROOT = "cloudfront";
const distributionsQueryKey = [CLOUDFRONT_QUERY_ROOT, "distributions"];
const distributionQueryKey = (id: string) => [CLOUDFRONT_QUERY_ROOT, "distribution", id];

const STALE_ETAG_ERROR = "InvalidIfMatchVersion";
const STALE_ETAG_MESSAGE = "The distribution changed while saving. Try again.";

// Summary của Floci có Comment, Enabled, origin (spec 7 #10): một lần gọi, không gọi thêm từng dòng
export function useDistributions() {
  const client = useCloudFront();

  return useQuery({
    queryKey: distributionsQueryKey,
    queryFn: async () => {
      const summaries: DistributionSummary[] = [];
      for await (const page of paginateListDistributions({ client }, {})) {
        summaries.push(...(page.DistributionList?.Items ?? []));
      }
      return summaries;
    },
  });
}

// null = không có distribution
export function useDistribution(id: string) {
  const client = useCloudFront();

  return useQuery({
    queryKey: distributionQueryKey(id),
    queryFn: async () => {
      try {
        return (await client.send(new GetDistributionCommand({ Id: id }))).Distribution ?? null;
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw error;
      }
    },
  });
}

const readConfig = async (client: CloudFrontClient, id: string) => {
  const { DistributionConfig: config, ETag } = await client.send(
    new GetDistributionConfigCommand({ Id: id }),
  );
  if (!config) throw new Error(`Distribution ${id} has no configuration.`);
  return { config, etag: ETag };
};

// CloudFront bắt gửi lại toàn bộ cấu hình + ETag: đọc lại ngay lúc lưu rồi áp thay đổi, nên thay đổi nơi
// khác (CDK, app) ở phần khác vẫn giữ (spec 4). Hai lần lưu chen nhau thì Floci từ chối ETag cũ
export function useUpdateDistribution(id: string) {
  const client = useCloudFront();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (change: (config: DistributionConfig) => DistributionConfig) => {
      const { config, etag } = await readConfig(client, id);
      try {
        await client.send(
          new UpdateDistributionCommand({
            Id: id,
            IfMatch: etag,
            DistributionConfig: change(config),
          }),
        );
      } catch (error) {
        if (error instanceof Error && error.name === STALE_ETAG_ERROR) {
          throw new Error(STALE_ETAG_MESSAGE);
        }
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CLOUDFRONT_QUERY_ROOT] }),
  });
}

export function useDeleteDistribution() {
  const client = useCloudFront();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { etag } = await readConfig(client, id);
      await client.send(new DeleteDistributionCommand({ Id: id, IfMatch: etag }));
    },
    // Chỉ làm mới danh sách: tải lại chi tiết của distribution vừa xóa thì Floci trả 404, trình duyệt ghi
    // console.error trước khi trang chi tiết kịp chuyển về danh sách
    onSuccess: () => queryClient.invalidateQueries({ queryKey: distributionsQueryKey }),
  });
}

export function useCreateDistribution() {
  const client = useCloudFront();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: DistributionConfig) => {
      const { Distribution } = await client.send(
        new CreateDistributionCommand({ DistributionConfig: config }),
      );
      return Distribution?.Id ?? "";
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CLOUDFRONT_QUERY_ROOT] }),
  });
}

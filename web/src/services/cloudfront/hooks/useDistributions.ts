import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DistributionConfig } from "@aws-sdk/client-cloudfront";
import { useCloudFrontService } from "./useCloudFrontService.ts";

export const CLOUDFRONT_QUERY_ROOT = "cloudfront";
const distributionsQueryKey = [CLOUDFRONT_QUERY_ROOT, "distributions"];
const distributionQueryKey = (id: string) => [CLOUDFRONT_QUERY_ROOT, "distribution", id];

export function useDistributions() {
  const cloudfront = useCloudFrontService();

  return useQuery({ queryKey: distributionsQueryKey, queryFn: cloudfront.listDistributions });
}

export function useDistribution(id: string) {
  const cloudfront = useCloudFrontService();

  return useQuery({
    queryKey: distributionQueryKey(id),
    queryFn: () => cloudfront.getDistribution(id),
  });
}

export function useUpdateDistribution(id: string) {
  const cloudfront = useCloudFrontService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (change: (config: DistributionConfig) => DistributionConfig) =>
      cloudfront.updateDistribution(id, change),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CLOUDFRONT_QUERY_ROOT] }),
  });
}

export function useDeleteDistribution() {
  const cloudfront = useCloudFrontService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cloudfront.deleteDistribution,
    // Chỉ làm mới danh sách: tải lại chi tiết của distribution vừa xóa thì Floci trả 404, trình duyệt ghi
    // console.error trước khi trang chi tiết kịp chuyển về danh sách
    onSuccess: () => queryClient.invalidateQueries({ queryKey: distributionsQueryKey }),
  });
}

export function useCreateDistribution() {
  const cloudfront = useCloudFrontService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cloudfront.createDistribution,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CLOUDFRONT_QUERY_ROOT] }),
  });
}

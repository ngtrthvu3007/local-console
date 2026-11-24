import { useQuery } from "@tanstack/react-query";
import { DescribeImagesCommand } from "@aws-sdk/client-ec2";
import { useEC2 } from "./useEC2.ts";

// Catalog AMI của Floci (~30 mục): một lần tải, dùng cho ô chọn AMI và tên AMI ở chi tiết
export function useImages() {
  const client = useEC2();

  return useQuery({
    queryKey: ["ec2", "images"],
    queryFn: async () => (await client.send(new DescribeImagesCommand({}))).Images ?? [],
  });
}

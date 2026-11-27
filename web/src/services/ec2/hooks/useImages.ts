import { useQuery } from "@tanstack/react-query";
import { useEc2Service } from "./useEc2Service.ts";

// Dùng cho ô chọn AMI và tên AMI ở chi tiết
export function useImages() {
  const ec2 = useEc2Service();

  return useQuery({ queryKey: ["ec2", "images"], queryFn: ec2.listImages });
}

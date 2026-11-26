import { useQuery } from "@tanstack/react-query";
import { DescribeSecurityGroupsCommand, DescribeSubnetsCommand } from "@aws-sdk/client-ec2";
import { useEC2 } from "../../ec2/hooks/useEC2.ts";
import { ECS_QUERY_ROOT } from "./useEcs.ts";

const DEFAULT_SECURITY_GROUP = "default";

interface Option {
  value: string;
  label: string;
}

// Floci bắt buộc subnet có thật (spec 7 #11); có sẵn subnet mặc định mỗi AZ và group "default"
export function useNetworkOptions() {
  const ec2 = useEC2();

  return useQuery({
    queryKey: [ECS_QUERY_ROOT, "network"],
    queryFn: async () => {
      const [{ Subnets = [] }, { SecurityGroups = [] }] = await Promise.all([
        ec2.send(new DescribeSubnetsCommand({})),
        ec2.send(new DescribeSecurityGroupsCommand({})),
      ]);
      const subnets: Option[] = Subnets.map((subnet) => ({
        value: subnet.SubnetId ?? "",
        label: [subnet.SubnetId, subnet.AvailabilityZone].filter(Boolean).join(" · "),
      }));
      const securityGroups: Option[] = SecurityGroups.map((group) => ({
        value: group.GroupId ?? "",
        label: [group.GroupId, group.GroupName].filter(Boolean).join(" · "),
      }));
      const defaultSubnet = Subnets.find((subnet) => subnet.DefaultForAz)?.SubnetId;
      const defaultGroup = SecurityGroups.find(
        (group) => group.GroupName === DEFAULT_SECURITY_GROUP,
      )?.GroupId;

      return {
        subnets,
        securityGroups,
        defaults: {
          subnets: defaultSubnet ? [defaultSubnet] : [],
          securityGroups: defaultGroup ? [defaultGroup] : [],
        },
      };
    },
  });
}

import {
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  type EC2Client,
} from "@aws-sdk/client-ec2";
import { DETAIL_SEPARATOR } from "#shared/constants.ts";

const DEFAULT_SECURITY_GROUP = "default";

export interface NetworkOption {
  value: string;
  label: string;
}

// Floci bắt buộc subnet có thật (spec ECS 7 #11); có sẵn subnet mặc định mỗi AZ và group "default"
export async function listNetworkOptions(ec2: EC2Client) {
  const [{ Subnets = [] }, { SecurityGroups = [] }] = await Promise.all([
    ec2.send(new DescribeSubnetsCommand({})),
    ec2.send(new DescribeSecurityGroupsCommand({})),
  ]);
  const subnets: NetworkOption[] = Subnets.map((subnet) => ({
    value: subnet.SubnetId ?? "",
    label: [subnet.SubnetId, subnet.AvailabilityZone].filter(Boolean).join(DETAIL_SEPARATOR),
  }));
  const securityGroups: NetworkOption[] = SecurityGroups.map((group) => ({
    value: group.GroupId ?? "",
    label: [group.GroupId, group.GroupName].filter(Boolean).join(DETAIL_SEPARATOR),
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
}

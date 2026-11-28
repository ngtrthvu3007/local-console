import { describe, expect, it } from "vitest";
import {
  IconBrandAmazon,
  IconBrandDebian,
  IconBrandRedhat,
  IconBrandUbuntu,
  IconBrandWindows,
  IconTerminal2,
} from "@tabler/icons-react";
import { osStyleOf } from "../../../src/services/ec2/components/OsIcon.tsx";

describe("osStyleOf", () => {
  const iconFor = (Name: string, Description?: string) => osStyleOf({ Name, Description }).icon;

  it("picks the OS logo from the AMI name or description", () => {
    expect(iconFor("al2023-ami-2023.0.20230315.0-kernel-6.1-x86_64")).toBe(IconBrandAmazon);
    expect(iconFor("amzn2-ami-hvm-2.0.20230404.0-x86_64-gp2")).toBe(IconBrandAmazon);
    expect(iconFor("ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server")).toBe(IconBrandUbuntu);
    expect(iconFor("debian-12-amd64-20230411")).toBe(IconBrandDebian);
    expect(iconFor("Windows_Server-2022-English-Full-Base")).toBe(IconBrandWindows);
    expect(iconFor("RHEL-9.5.0_HVM-20260101", "Provided by Red Hat, Inc.")).toBe(IconBrandRedhat);
  });

  it("gives distros without a logo the generic icon in their own colour", () => {
    const rocky = osStyleOf({ Name: "Rocky-9-EC2-Base-9.6" });
    const suse = osStyleOf({ Name: "suse-sles-15-sp6-v20260101" });
    const unknown = osStyleOf(undefined);

    expect([rocky.icon, suse.icon, unknown.icon]).toEqual([
      IconTerminal2,
      IconTerminal2,
      IconTerminal2,
    ]);
    expect(new Set([rocky.color, suse.color, unknown.color]).size).toBe(3);
  });
});

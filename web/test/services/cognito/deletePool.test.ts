import {
  CognitoIdentityProviderClient,
  DeletionProtectionType,
  DeleteUserPoolCommand,
  DeleteUserPoolDomainCommand,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { describe, expect, it, vi } from "vitest";
import { DELETION_PROTECTION_ERROR } from "../../../src/services/cognito/constants.ts";
import { deleteUserPool } from "../../../src/services/cognito/hooks/usePools.ts";

function clientWith(protection: DeletionProtectionType) {
  const client = new CognitoIdentityProviderClient({ region: "us-east-1" });
  const send = vi.spyOn(client, "send").mockImplementation(async (command: unknown) =>
    command instanceof DescribeUserPoolCommand
      ? { UserPool: { Domain: "hosted", DeletionProtection: protection } }
      : {},
  );
  return { client, sent: () => send.mock.calls.map(([command]) => command.constructor) };
}

describe("deleteUserPool", () => {
  it("rejects a protected pool before touching its domain", async () => {
    const { client, sent } = clientWith(DeletionProtectionType.ACTIVE);
    await expect(deleteUserPool(client, "p1")).rejects.toThrow(DELETION_PROTECTION_ERROR);
    expect(sent()).toEqual([DescribeUserPoolCommand]);
  });

  it("deletes the domain then the pool when unprotected", async () => {
    const { client, sent } = clientWith(DeletionProtectionType.INACTIVE);
    await deleteUserPool(client, "p1");
    expect(sent()).toEqual([
      DescribeUserPoolCommand,
      DeleteUserPoolDomainCommand,
      DeleteUserPoolCommand,
    ]);
  });
});

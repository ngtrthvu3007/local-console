import { describe, expect, it, vi } from "vitest";
import { AddPermissionCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { addPermission } from "#services/lambda/operations/functions.ts";

const INPUT = {
  functionArn: "arn:aws:lambda:us-east-1:000000000000:function:f",
  statementId: "apigateway-a1-GET-items",
  sourceArn: "arn:aws:execute-api:us-east-1:000000000000:a1/*/GET/items",
};

function lambdaSending(send: () => Promise<unknown>) {
  const lambda = new LambdaClient({ region: "us-east-1" });
  const spy = vi.spyOn(lambda, "send").mockImplementation(send as never);
  return { lambda, spy };
}

describe("addPermission", () => {
  it("lets API Gateway invoke the function from the given SourceArn", async () => {
    const { lambda, spy } = lambdaSending(() => Promise.resolve({}));
    await addPermission(lambda, INPUT);

    const command = spy.mock.calls[0][0];
    expect(command).toBeInstanceOf(AddPermissionCommand);
    expect(command.input).toEqual({
      FunctionName: INPUT.functionArn,
      StatementId: INPUT.statementId,
      Action: "lambda:InvokeFunction",
      Principal: "apigateway.amazonaws.com",
      SourceArn: INPUT.sourceArn,
    });
  });

  it("treats an existing statement as granted", async () => {
    const conflict = Object.assign(new Error("exists"), { name: "ResourceConflictException" });
    const { lambda } = lambdaSending(() => Promise.reject(conflict));
    await expect(addPermission(lambda, INPUT)).resolves.toBeUndefined();
  });

  it("rejects other errors", async () => {
    const { lambda } = lambdaSending(() => Promise.reject(new Error("no function")));
    await expect(addPermission(lambda, INPUT)).rejects.toThrow("no function");
  });
});

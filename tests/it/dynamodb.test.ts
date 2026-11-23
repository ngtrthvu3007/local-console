import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateTableCommand,
} from "@aws-sdk/client-dynamodb";
import { consoleConfig, uniqueName, viaConsole, waitFor } from "./helpers.ts";

const table = uniqueName("table");
let dynamodb: DynamoDBClient;

beforeAll(async () => {
  dynamodb = new DynamoDBClient(viaConsole((await consoleConfig()).region));
  await dynamodb.send(
    new CreateTableCommand({
      TableName: table,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "N" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
    }),
  );
  await waitFor("table to be ACTIVE", async () => {
    const { Table } = await dynamodb.send(new DescribeTableCommand({ TableName: table }));
    return Table?.TableStatus === "ACTIVE" ? true : undefined;
  });
});

afterAll(async () => {
  await dynamodb.send(new DeleteTableCommand({ TableName: table })).catch(() => undefined);
});

describe("DynamoDB through the console proxy", () => {
  it("keeps a number beyond JavaScript's safe range exactly", async () => {
    const big = "12345678901234567890";
    await dynamodb.send(
      new PutItemCommand({
        TableName: table,
        Item: { pk: { S: "user#1" }, sk: { N: "1" }, big: { N: big } },
      }),
    );
    const { Item } = await dynamodb.send(
      new GetItemCommand({ TableName: table, Key: { pk: { S: "user#1" }, sk: { N: "1" } } }),
    );
    expect(Item?.big).toEqual({ N: big });
  });

  it("runs a query with a reserved word (status) through placeholders", async () => {
    // Đúng dạng buildSearchInput của web tạo ra: tên và giá trị luôn qua #/: placeholder
    for (const [sk, status] of [
      ["2", "DONE"],
      ["3", "OPEN"],
      ["4", "DONE"],
    ]) {
      await dynamodb.send(
        new PutItemCommand({
          TableName: table,
          Item: { pk: { S: "user#2" }, sk: { N: sk }, status: { S: status } },
        }),
      );
    }
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "#key0 = :key0 AND #key1 BETWEEN :key1 AND :key1end",
        FilterExpression: "#filter0 = :filter0",
        ExpressionAttributeNames: { "#key0": "pk", "#key1": "sk", "#filter0": "status" },
        ExpressionAttributeValues: {
          ":key0": { S: "user#2" },
          ":key1": { N: "2" },
          ":key1end": { N: "4" },
          ":filter0": { S: "DONE" },
        },
        ScanIndexForward: false,
      }),
    );
    expect(result.Items?.map((item) => item.sk.N)).toEqual(["4", "2"]);
    // Filter chạy sau khi đọc: đọc 3 item, trả về 2 (con số resultSummary hiển thị)
    expect(result.ScannedCount).toBe(3);
    expect(result.Count).toBe(2);
  });

  it("turns on a stream, which the Lambda trigger picker needs", async () => {
    await dynamodb.send(
      new UpdateTableCommand({
        TableName: table,
        StreamSpecification: { StreamEnabled: true, StreamViewType: "NEW_AND_OLD_IMAGES" },
      }),
    );
    const { Table } = await dynamodb.send(new DescribeTableCommand({ TableName: table }));
    expect(Table?.StreamSpecification?.StreamEnabled).toBe(true);
    expect(Table?.LatestStreamArn).toMatch(/^arn:aws:dynamodb:/);
  });
});

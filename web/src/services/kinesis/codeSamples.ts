import {
  lines,
  literal,
  NODE_AWS_NOTE,
  PYTHON_AWS_NOTE,
  type CodeSample,
} from "@shared/codeSamples.ts";

const PARTITION_KEY = literal("user-1");

// Gửi một record rồi đọc shard đầu từ record cũ nhất, như Data viewer (Trim horizon)
export function streamSample(stream: string): CodeSample {
  return {
    node: lines(
      NODE_AWS_NOTE,
      "import {",
      "  KinesisClient,",
      "  PutRecordCommand,",
      "  ListShardsCommand,",
      "  GetShardIteratorCommand,",
      "  GetRecordsCommand,",
      '} from "@aws-sdk/client-kinesis";',
      "",
      "const kinesis = new KinesisClient({});",
      `const StreamName = ${literal(stream)};`,
      "",
      "await kinesis.send(new PutRecordCommand({",
      "  StreamName,",
      `  PartitionKey: ${PARTITION_KEY},`,
      '  Data: new TextEncoder().encode(JSON.stringify({ hello: "world" })),',
      "}));",
      "",
      "const { Shards = [] } = await kinesis.send(new ListShardsCommand({ StreamName }));",
      "const { ShardIterator } = await kinesis.send(new GetShardIteratorCommand({",
      "  StreamName,",
      "  ShardId: Shards[0].ShardId,",
      '  ShardIteratorType: "TRIM_HORIZON",',
      "}));",
      "const { Records = [] } = await kinesis.send(new GetRecordsCommand({ ShardIterator }));",
      "for (const record of Records) console.log(new TextDecoder().decode(record.Data));",
    ),
    python: lines(
      PYTHON_AWS_NOTE,
      "import json",
      "import boto3",
      "",
      'kinesis = boto3.client("kinesis")',
      `stream = ${literal(stream)}`,
      "",
      "kinesis.put_record(",
      "    StreamName=stream,",
      `    PartitionKey=${PARTITION_KEY},`,
      '    Data=json.dumps({"hello": "world"}),',
      ")",
      "",
      'shard_id = kinesis.list_shards(StreamName=stream)["Shards"][0]["ShardId"]',
      "iterator = kinesis.get_shard_iterator(",
      '    StreamName=stream, ShardId=shard_id, ShardIteratorType="TRIM_HORIZON"',
      ')["ShardIterator"]',
      'for record in kinesis.get_records(ShardIterator=iterator)["Records"]:',
      '    print(record["Data"].decode())',
    ),
  };
}

import { describe, expect, it } from "vitest";
import {
  clusterNameOf,
  revisionToSelect,
  revisionsOfFamily,
  secretRefOf,
  serviceRefOf,
  taskDefinitionArn,
  taskDefinitionLabel,
  taskDefinitionRefOf,
  taskIdOf,
} from "../../../src/services/ecs/arns.ts";
import { clusterSample } from "../../../src/services/ecs/codeSamples.ts";
import { exitCodeText, runTaskOutcome } from "../../../src/services/ecs/tasks.ts";
import { CLUSTER_TABS, ecsRoutes } from "../../../src/services/ecs/routes.ts";
import {
  parseCommand,
  runTaskSchema,
  serviceSchema,
  taskDefinitionJsonSchema,
  type RunTaskForm,
} from "../../../src/services/ecs/schemas.ts";
import {
  awslogsTarget,
  newTaskDefinitionText,
  revisionText,
} from "../../../src/services/ecs/taskDefinitionJson.ts";

const TD = "arn:aws:ecs:ap-southeast-1:000000000000:task-definition";
const SECRET = "arn:aws:secretsmanager:ap-southeast-1:000000000000:secret:db-AbCdEf";

const runTaskValues = (command: string): RunTaskForm => ({
  cluster: "app",
  family: "api",
  revision: "3",
  count: "1",
  subnets: ["subnet-a"],
  securityGroups: [],
  overrides: [{ container: "main", command, environment: [] }],
});

describe("secretRefOf", () => {
  it("links a secret even with a JSON key suffix", () => {
    expect(secretRefOf(SECRET)).toEqual({ kind: "secret", name: "db" });
    expect(secretRefOf(`${SECRET}:password::`)).toEqual({ kind: "secret", name: "db" });
    expect(secretRefOf("/app/api-key")).toEqual({ kind: "parameter", name: "/app/api-key" });
  });
});

describe("ARNs", () => {
  it("keeps revisions of one family only, newest first", () => {
    const arns = [`${TD}/api:1`, `${TD}/api-worker:5`, `${TD}/api:3`];
    expect(revisionsOfFamily(arns, "api")).toEqual([`${TD}/api:3`, `${TD}/api:1`]);
  });

  // Finding #5: ARN không có revision (CDK có thể trỏ family) không được thành "ap:NaN"
  it("reads a task definition ARN without a revision", () => {
    expect(taskDefinitionRefOf(`${TD}/api`)).toEqual({ family: "api", revision: undefined });
    expect(taskDefinitionLabel(`${TD}/api`)).toBe("api");
  });

  // Finding #3: revision đang dùng mà đã Inactive thì giữ nguyên, chỉ chọn mới nhất khi chưa có / sai family
  it("keeps the chosen revision unless it doesn't belong to the family", () => {
    const rows = [
      { arn: `${TD}/api:3`, family: "api", revision: 3, status: "ACTIVE" as const },
      { arn: `${TD}/api:2`, family: "api", revision: 2, status: "INACTIVE" as const },
    ];
    expect(revisionToSelect(rows, "2")).toBeUndefined();
    expect(revisionToSelect(rows, "3")).toBeUndefined();
    expect(revisionToSelect(rows, "")).toBe("3");
    expect(revisionToSelect(rows, "9")).toBe("3");
    expect(revisionToSelect([], "")).toBeUndefined();
  });

  it("reads names from ARNs", () => {
    expect(clusterNameOf("arn:aws:ecs:r:0:cluster/app")).toBe("app");
    expect(clusterNameOf("app")).toBe("app");
    expect(serviceRefOf("arn:aws:ecs:r:0:service/app/api")).toEqual({
      cluster: "app",
      service: "api",
    });
    expect(taskDefinitionRefOf(`${TD}/migrate:2`)).toEqual({ family: "migrate", revision: 2 });
    expect(taskDefinitionLabel(`${TD}/migrate:2`)).toBe("migrate:2");
    expect(taskIdOf("arn:aws:ecs:r:0:task/app/9f1c")).toBe("9f1c");
    expect(taskDefinitionArn("ap-southeast-1", "migrate", "2")).toBe(
      "arn:aws:ecs:ap-southeast-1:000000000000:task-definition/migrate:2",
    );
  });
});

describe("run task form", () => {
  it("parses a command override", () => {
    expect(parseCommand("")).toBeUndefined();
    expect(parseCommand('["sh","-c","echo hi"]')).toEqual(["sh", "-c", "echo hi"]);
    expect(runTaskSchema.safeParse(runTaskValues('["sh","-c","echo hi"]')).success).toBe(true);
    expect(runTaskSchema.safeParse(runTaskValues("")).success).toBe(true);
    for (const bad of ["sh -c", '{"a":1}', "[1,2]"]) {
      expect(runTaskSchema.safeParse(runTaskValues(bad)).success).toBe(false);
    }
  });

  it("needs a subnet and a task count from 1 to 10", () => {
    expect(runTaskSchema.safeParse({ ...runTaskValues(""), subnets: [] }).success).toBe(false);
    expect(runTaskSchema.safeParse({ ...runTaskValues(""), count: "11" }).success).toBe(false);
  });

  it("lets a service run zero tasks", () => {
    const service = {
      name: "api",
      family: "api",
      revision: "1",
      desiredCount: "0",
      subnets: ["subnet-a"],
      securityGroups: [],
    };
    expect(serviceSchema.safeParse(service).success).toBe(true);
    expect(serviceSchema.safeParse({ ...service, name: "bad name!" }).success).toBe(false);
  });
});

describe("task definition JSON", () => {
  it("builds a new revision without read-only fields", () => {
    const text = revisionText({
      family: "api",
      revision: 3,
      status: "ACTIVE",
      taskDefinitionArn: `${TD}/api:3`,
      containerDefinitions: [{ name: "web" }],
    });
    expect(JSON.parse(text)).toEqual({ family: "api", containerDefinitions: [{ name: "web" }] });
  });

  it("accepts the template and rejects JSON without containers", () => {
    expect(
      taskDefinitionJsonSchema.safeParse(newTaskDefinitionText("ap-southeast-1")).success,
    ).toBe(true);
    expect(taskDefinitionJsonSchema.safeParse('{"family":"api"}').success).toBe(false);
    expect(taskDefinitionJsonSchema.safeParse("{").success).toBe(false);
  });

  it("finds the log stream of a container", () => {
    const container = {
      name: "main",
      logConfiguration: {
        logDriver: "awslogs" as const,
        options: { "awslogs-group": "/ecs/a", "awslogs-stream-prefix": "bb" },
      },
    };
    expect(awslogsTarget(container, "9f1c")).toEqual({ group: "/ecs/a", stream: "bb/main/9f1c" });
    expect(awslogsTarget({ name: "main" }, "9f1c")).toBeUndefined();
  });
});

describe("ecsRoutes", () => {
  it("keeps the default tab off the URL", () => {
    expect(ecsRoutes.cluster("app")).toBe("/ecs/clusters/app");
    expect(ecsRoutes.cluster("app", CLUSTER_TABS.tasks)).toBe("/ecs/clusters/app?tab=tasks");
    expect(ecsRoutes.runTask({ cluster: "app", taskDefinition: "api:3" })).toBe(
      "/ecs/run-task?cluster=app&taskDefinition=api%3A3",
    );
    expect(ecsRoutes.revision("api", 3)).toBe("/ecs/task-definitions/api/3");
  });
});

describe("clusterSample", () => {
  it("runs a task on the cluster with its subnet filled in", () => {
    const sample = clusterSample("app", "subnet-default-ap-southeast-1-a");
    for (const code of [sample.node, sample.python]) {
      expect(code).toContain('"app"');
      expect(code).toContain('"subnet-default-ap-southeast-1-a"');
      expect(code).toContain("FARGATE");
    }
  });
});

describe("run task outcome", () => {
  const task = (id: string) => ({ taskArn: `arn:aws:ecs:r:0:task/app/${id}` });
  const failure = { arn: "arn:aws:ecs:r:0:container-instance/x", reason: "RESOURCE:MEMORY" };

  // Minor #6: mọi failure đều được báo; task đã chạy (lỗi một phần) vẫn được trả về
  it("reports every failure and keeps the tasks that started", () => {
    expect(
      runTaskOutcome({ tasks: [task("a")], failures: [failure, { reason: "MISSING" }] }),
    ).toEqual({
      tasks: [task("a")],
      count: 1,
      failures: [`${failure.arn}: RESOURCE:MEMORY`, "MISSING"],
    });
  });

  it("throws when no task started", () => {
    expect(() => runTaskOutcome({ tasks: [], failures: [failure, { reason: "MISSING" }] })).toThrow(
      `${failure.arn}: RESOURCE:MEMORY; MISSING`,
    );
  });
});

describe("exitCodeText", () => {
  // Minor #8: task nhiều container thì nói rõ mã của từng container, không lấy bừa container đầu
  it("shows one code for one container and every code for several", () => {
    expect(exitCodeText({ containers: [{ name: "main", exitCode: 3 }] })).toBe("3");
    expect(
      exitCodeText({
        containers: [{ name: "main", exitCode: 3 }, { name: "log", exitCode: 0 }, { name: "idle" }],
      }),
    ).toBe("main 3 · log 0");
    expect(exitCodeText({ containers: [{ name: "main" }] })).toBeUndefined();
  });
});

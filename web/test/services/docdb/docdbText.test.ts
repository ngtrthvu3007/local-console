import { describe, expect, it } from "vitest";
import { clusterSample } from "../../../src/services/docdb/codeSamples.ts";
import { TEXT } from "../../../src/services/docdb/constants.ts";

describe("clusterSample", () => {
  it("connects with DOCDB_URI from the environment", () => {
    const sample = clusterSample();
    expect(sample.node).toContain("process.env.DOCDB_URI");
    expect(sample.node).toContain("listDatabases");
    expect(sample.python).toContain('os.environ["DOCDB_URI"]');
  });
});

describe("TEXT", () => {
  // Floci restart không dừng forwarder: chạy lại lệnh sẽ trùng tên container (review #1)
  it("tells devs when to stop the forwarder, not to run it again after a restart", () => {
    const note = TEXT.forwardNote("orders-db");
    expect(note).not.toContain("run it again");
    expect(note).toContain("docker stop docdb-forward-orders-db before docker compose down");
  });

  it("asks to percent-encode the password in the connection string", () => {
    expect(TEXT.encodePassword).toContain("Percent-encode");
  });

  it("shows a missing engine version as not available", () => {
    expect(TEXT.engine(undefined)).toBe("Engine — (Floci runs MongoDB 7.0)");
    expect(TEXT.engine("5.0.0")).toBe("Engine 5.0.0 (Floci runs MongoDB 7.0)");
  });
});

// Id instance là <cluster>-<n> (n tới 16): tên cluster chừa 3 ký tự để id instance không quá 63

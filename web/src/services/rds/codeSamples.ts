import type { DBInstance } from "@aws-sdk/client-rds";
import { lines, literal, type CodeSample } from "@shared/codeSamples.ts";
import { DEFAULT_DATABASES, URL_SCHEMES, type Engine } from "./constants.ts";
import type { Address } from "./databases.ts";

// DB không đi qua AWS SDK: app nối thẳng bằng driver. Địa chỉ mặc định là máy dev;
// trong compose / Lambda thì đặt biến môi trường thành endpoint Floci trả
const PASSWORD_VARIABLE = "DB_PASSWORD";

// Dạng psql / Prisma / biến DATABASE_URL nhận; không chứa password (không API nào trả)
export function connectionUrl(engine: Engine, database: DBInstance, address: Address) {
  const url = new URL(`${URL_SCHEMES[engine]}://${address.host}:${address.port}`);
  url.username = database.MasterUsername ?? "";
  url.pathname = database.DBName ?? "";
  return url.toString();
}

const addressNote = (endpoint: Address) =>
  `Inside docker compose or Lambda, set DB_HOST=${endpoint.host} DB_PORT=${endpoint.port}`;

export function databaseSample(
  engine: Engine,
  database: DBInstance,
  machine: Address,
  endpoint: Address,
): CodeSample {
  const user = literal(database.MasterUsername ?? "");
  const name = database.DBName ?? DEFAULT_DATABASES[engine];
  const host = literal(machine.host);
  const port = literal(String(machine.port));
  const nodeFields = [
    `  host: process.env.DB_HOST ?? ${host},`,
    `  port: Number(process.env.DB_PORT ?? ${port}),`,
    `  user: ${user},`,
    `  password: process.env.${PASSWORD_VARIABLE},`,
    ...(name ? [`  database: ${literal(name)},`] : []),
  ];
  const pythonFields = [
    `    host=os.environ.get("DB_HOST", ${host}),`,
    `    port=int(os.environ.get("DB_PORT", ${port})),`,
    `    user=${user},`,
    `    password=os.environ[${literal(PASSWORD_VARIABLE)}],`,
    ...(name ? [`    ${engine === "postgres" ? "dbname" : "database"}=${literal(name)},`] : []),
  ];
  const note = addressNote(endpoint);

  if (engine === "postgres") {
    return {
      node: lines(
        'import pg from "pg";',
        "",
        `// ${note}`,
        "const client = new pg.Client({",
        ...nodeFields,
        "});",
        "await client.connect();",
        'console.log((await client.query("select version()")).rows[0]);',
        "await client.end();",
      ),
      python: lines(
        "import os",
        "import psycopg",
        "",
        `# ${note}`,
        "with psycopg.connect(",
        ...pythonFields,
        ") as connection:",
        '    print(connection.execute("select version()").fetchone())',
      ),
    };
  }

  return {
    node: lines(
      'import mysql from "mysql2/promise";',
      "",
      `// ${note}`,
      "const connection = await mysql.createConnection({",
      ...nodeFields,
      "});",
      'console.log((await connection.query("select version()"))[0]);',
      "await connection.end();",
    ),
    python: lines(
      "import os",
      "import pymysql",
      "",
      `# ${note}`,
      "connection = pymysql.connect(",
      ...pythonFields,
      ")",
      "with connection.cursor() as cursor:",
      '    cursor.execute("select version()")',
      "    print(cursor.fetchone())",
      "connection.close()",
    ),
  };
}

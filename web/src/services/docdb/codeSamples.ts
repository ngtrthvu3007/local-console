import { lines } from "@localconsole/core/shared";
import { type CodeSample } from "@shared/codeSamples.ts";

// App đọc connection string từ env DOCDB_URI (chuỗi ở tab Connectivity, điền password)
export const clusterSample = (): CodeSample => ({
  node: lines(
    'import { MongoClient } from "mongodb";',
    "",
    "const client = new MongoClient(process.env.DOCDB_URI);",
    "await client.connect();",
    "const { databases } = await client.db().admin().listDatabases();",
    "console.log(databases.map((database) => database.name));",
    "await client.close();",
  ),
  python: lines(
    "import os",
    "from pymongo import MongoClient",
    "",
    'client = MongoClient(os.environ["DOCDB_URI"])',
    "print(client.list_database_names())",
  ),
});

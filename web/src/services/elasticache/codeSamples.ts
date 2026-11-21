import { lines, literal, type CodeSample } from "@shared/codeSamples.ts";

const SAMPLE_KEY = "greeting";
const SAMPLE_VALUE = "hello";
// Cache không đi qua AWS SDK: app nối thẳng bằng client Redis. URL đặt trong
// biến môi trường để đổi được giữa máy dev và docker compose
const URL_VARIABLE = "REDIS_URL";
const URL_NOTE = `${URL_VARIABLE} overrides it (e.g. inside docker compose)`;

export const cacheSample = (url: string): CodeSample => ({
  node: lines(
    'import Redis from "ioredis";',
    "",
    `// ${URL_NOTE}`,
    `const url = process.env.${URL_VARIABLE} ?? ${literal(url)};`,
    "const redis = new Redis(url);",
    `await redis.set(${literal(SAMPLE_KEY)}, ${literal(SAMPLE_VALUE)});`,
    `console.log(await redis.get(${literal(SAMPLE_KEY)}));`,
    "redis.disconnect();",
  ),
  python: lines(
    "import os",
    "import redis",
    "",
    `# ${URL_NOTE}`,
    `url = os.environ.get(${literal(URL_VARIABLE)}, ${literal(url)})`,
    "cache = redis.from_url(url)",
    `cache.set(${literal(SAMPLE_KEY)}, ${literal(SAMPLE_VALUE)})`,
    `print(cache.get(${literal(SAMPLE_KEY)}))`,
  ),
});

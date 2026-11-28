// Đo bundle của web để biết tách code có làm trang tải nặng hơn không
// Dùng: node bundle/measure.mjs <web/dist> [--save <file.json> | --compare <file.json>]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

// Trang đại diện: SQS có trigger nối sang Lambda, Lambda là service bị nhiều nơi dùng
const PAGES = ["QueueList", "QueueDetail", "FunctionList"];
// Chuỗi chỉ có trong code SDK của từng service: thấy trong lần tải đầu là SDK bị kéo khỏi chunk lazy
const SDK_MARKERS = {
  sqs: "AmazonSQS",
  dynamodb: "DynamoDB_20120810",
  ecs: "AmazonEC2ContainerServiceV20141113",
  cognito: "AWSCognitoIdentityProviderService",
  kms: "TrentService",
  lambda: "2015-03-31/functions",
};
// Ngưỡng tăng cho phép so với mốc (spec core mục 7.2)
const MAX_GROWTH = 0.05;
const ASSETS_DIR = "assets";
const INDEX_CHUNK_PREFIX = "index-";
const KIBIBYTE = 1024;

const [dist, mode, file] = process.argv.slice(2);
if (!dist) {
  console.error("usage: measure.mjs <web/dist> [--save <file> | --compare <file>]");
  process.exit(2);
}

const assets = path.join(dist, ASSETS_DIR);
const read = (name) => readFileSync(path.join(assets, name));
const jsFiles = readdirSync(assets).filter((name) => name.endsWith(".js"));

function sizeOf(names) {
  return names.reduce(
    (total, name) => {
      const bytes = read(name);
      return { raw: total.raw + bytes.length, gzip: total.gzip + gzipSync(bytes).length };
    },
    { raw: 0, gzip: 0 },
  );
}

// Lần tải đầu: script và modulepreload trong index.html
const html = readFileSync(path.join(dist, "index.html"), "utf8");
const initialFiles = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
const indexChunk = initialFiles.find((name) => name.startsWith(INDEX_CHUNK_PREFIX));

// Một trang = chunk của nó + mọi import tĩnh (đệ quy); import() động không tính
function pageFiles(page) {
  const start = jsFiles.find((name) => name.startsWith(`${page}-`));
  if (!start) throw new Error(`No chunk for page ${page}`);
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const code = read(name).toString("utf8");
    for (const match of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) visit(match[1]);
  };
  visit(start);
  return [...seen];
}

const initialCode = initialFiles.map((name) => read(name).toString("utf8")).join("\n");
const result = {
  chunks: jsFiles.length,
  index: sizeOf([indexChunk]),
  initialLoad: sizeOf(initialFiles),
  total: sizeOf(jsFiles),
  pages: Object.fromEntries(PAGES.map((page) => [page, sizeOf(pageFiles(page))])),
  sdkInInitialLoad: Object.keys(SDK_MARKERS).filter((id) => initialCode.includes(SDK_MARKERS[id])),
};

const kb = (bytes) => `${Math.round(bytes / KIBIBYTE)} KB`;
const show = ({ raw, gzip }) => `${kb(raw)} (gzip ${kb(gzip)})`;
console.log(`chunks: ${result.chunks}`);
console.log(`index: ${show(result.index)}`);
console.log(`initial load: ${show(result.initialLoad)}`);
console.log(`total: ${show(result.total)}`);
for (const page of PAGES) console.log(`page ${page}: ${show(result.pages[page])}`);
console.log(`SDK in initial load: ${result.sdkInInitialLoad.join(", ") || "none"}`);

if (mode === "--save") writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);

if (mode === "--compare") {
  const baseline = JSON.parse(readFileSync(file, "utf8"));
  const checks = [
    ["index", result.index, baseline.index],
    ["initial load", result.initialLoad, baseline.initialLoad],
    ...PAGES.map((page) => [`page ${page}`, result.pages[page], baseline.pages[page]]),
  ];
  // So bản gzip: gần với byte thật trình duyệt tải
  const failures = checks
    .filter(([, now, before]) => now.gzip > before.gzip * (1 + MAX_GROWTH))
    .map(([name, now, before]) => `${name}: gzip ${kb(before.gzip)} → ${kb(now.gzip)}`);
  if (result.sdkInInitialLoad.length)
    failures.push(`SDK in initial load: ${result.sdkInInitialLoad.join(", ")}`);
  if (failures.length) {
    console.error(`Bundle grew more than ${MAX_GROWTH * 100}%:\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log(`Within ${MAX_GROWTH * 100}% of ${path.basename(file)}`);
}

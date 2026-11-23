import { describe, expect, it } from "vitest";
import {
  cellText,
  exportText,
  isNestedValue,
  itemId,
  keyChanged,
  keyError,
  keyLabel,
  needsDynamoJson,
  parseEditorText,
  parseImportText,
  pickKey,
  toEditorText,
  type Item,
} from "../../../src/services/dynamodb/itemJson.ts";
import type { IndexKeys } from "../../../src/services/dynamodb/hooks/useTables.ts";

const hashOnly: IndexKeys = { partitionKey: { name: "pk", type: "S" } };

const hashAndRange: IndexKeys = {
  partitionKey: { name: "pk", type: "S" },
  sortKey: { name: "sk", type: "N" },
};

const bytes = (text: string) => new TextEncoder().encode(text);

describe("needsDynamoJson", () => {
  it("lets a plain item use plain JSON", () => {
    expect(needsDynamoJson({ pk: { S: "a" }, n: { N: "42" }, ok: { BOOL: true } })).toBeUndefined();
  });

  it.each([
    [{ tags: { SS: ["a"] } }, "a String Set"],
    [{ scores: { NS: ["1"] } }, "a Number Set"],
    [{ blobs: { BS: [bytes("x")] } }, "a Binary Set"],
    [{ blob: { B: bytes("x") } }, "binary data"],
    [{ big: { N: "12345678901234567890" } }, "the number 12345678901234567890"],
  ] as [Item, string][])("asks for DynamoDB JSON when the item has %o", (item, reason) => {
    expect(needsDynamoJson(item)).toBe(
      `Shown as DynamoDB JSON: this item has ${reason}, which plain JSON can't keep exactly.`,
    );
  });

  it("finds the reason inside maps and lists", () => {
    expect(needsDynamoJson({ m: { M: { inner: { SS: ["a"] } } } })).toContain("a String Set");
    expect(needsDynamoJson({ l: { L: [{ S: "x" }, { B: bytes("y") }] } })).toContain("binary data");
  });
});

describe("toEditorText", () => {
  const item: Item = { pk: { S: "user#1" }, age: { N: "30" }, blob: { B: bytes("hello") } };

  it("writes plain JSON with real numbers", () => {
    const text = toEditorText({ pk: { S: "user#1" }, age: { N: "30" } }, "json");
    expect(JSON.parse(text)).toEqual({ pk: "user#1", age: 30 });
  });

  it("writes DynamoDB JSON with binary as base64", () => {
    expect(JSON.parse(toEditorText(item, "dynamodb"))).toEqual({
      pk: { S: "user#1" },
      age: { N: "30" },
      blob: { B: "aGVsbG8=" },
    });
  });
});

describe("parseEditorText (plain JSON)", () => {
  it("turns plain JSON into an item", () => {
    expect(parseEditorText('{"pk": "a", "n": 1.5, "ok": true, "none": null}', "json")).toEqual({
      pk: { S: "a" },
      n: { N: "1.5" },
      ok: { BOOL: true },
      none: { NULL: true },
    });
  });

  it("keeps integers beyond Number.MAX_SAFE_INTEGER exactly", () => {
    const item = parseEditorText('{"pk": "a", "big": 12345678901234567890}', "json");
    expect(item.big).toEqual({ N: "12345678901234567890" });
  });

  it("keeps decimals with more than 15 significant digits exactly", () => {
    const item = parseEditorText('{"pk": "a", "x": 0.12345678901234567891}', "json");
    expect(item.x).toEqual({ N: "0.12345678901234567891" });
  });

  it("explains invalid JSON", () => {
    expect(() => parseEditorText("{pk: 1}", "json")).toThrow(/^Invalid JSON: /);
  });

  it("refuses anything but an object", () => {
    expect(() => parseEditorText("[1, 2]", "json")).toThrow("The item must be a JSON object.");
  });
});

describe("parseEditorText (DynamoDB JSON)", () => {
  it("decodes every attribute type", () => {
    const text = JSON.stringify({
      s: { S: "x" },
      n: { N: "-1.5e3" },
      b: { B: "aGVsbG8=" },
      bool: { BOOL: false },
      nul: { NULL: true },
      m: { M: { a: { S: "1" } } },
      l: { L: [{ N: "1" }] },
      ss: { SS: ["a", "b"] },
      ns: { NS: ["1", "2"] },
      bs: { BS: ["aGVsbG8="] },
    });

    expect(parseEditorText(text, "dynamodb")).toEqual({
      s: { S: "x" },
      n: { N: "-1.5e3" },
      b: { B: bytes("hello") },
      bool: { BOOL: false },
      nul: { NULL: true },
      m: { M: { a: { S: "1" } } },
      l: { L: [{ N: "1" }] },
      ss: { SS: ["a", "b"] },
      ns: { NS: ["1", "2"] },
      bs: { BS: [bytes("hello")] },
    });
  });

  it.each([
    ['{"n": {"N": 42}}', '"n": expected a number as text'],
    ['{"n": {"N": "abc"}}', '"n": expected a number as text'],
    ['{"b": {"B": "not base64!"}}', '"b": expected base64 text'],
    ['{"ss": {"SS": []}}', '"ss": a set can\'t be empty.'],
    ['{"x": {"NULL": false}}', '"x": NULL must be true.'],
    ['{"x": {"S": "a", "N": "1"}}', '"x": expected exactly one of'],
    ['{"x": "plain"}', '"x": expected an object like'],
  ])("rejects %s", (text, message) => {
    expect(() => parseEditorText(text, "dynamodb")).toThrow(message);
  });

  it("points at the nested path of a bad value", () => {
    expect(() => parseEditorText('{"m": {"M": {"inner": {"N": "x"}}}}', "dynamodb")).toThrow(
      '"m.inner": expected a number as text',
    );

    expect(() =>
      parseEditorText('{"l": {"L": [{"S": "ok"}, {"BOOL": "yes"}]}}', "dynamodb"),
    ).toThrow('"l[1]": BOOL must be true or false.');
  });

  it("round-trips through toEditorText", () => {
    const item: Item = { pk: { S: "a" }, big: { N: "12345678901234567890" }, b: { B: bytes("x") } };
    expect(parseEditorText(toEditorText(item, "dynamodb"), "dynamodb")).toEqual(item);
  });
});

describe("keyError", () => {
  it("accepts an item with every key of the right type", () => {
    expect(keyError({ pk: { S: "a" }, sk: { N: "1" } }, hashAndRange)).toBeUndefined();
  });

  it("reports a missing key", () => {
    expect(keyError({ pk: { S: "a" } }, hashAndRange)).toBe('Missing sort key "sk".');
  });

  it("reports a key of the wrong type", () => {
    expect(keyError({ pk: { N: "1" } }, hashOnly)).toBe('The partition key "pk" must be a String.');
  });

  it("refuses an empty string or empty binary key, which DynamoDB rejects", () => {
    expect(keyError({ pk: { S: "" } }, hashOnly)).toBe('The partition key "pk" can\'t be empty.');
    const binaryKey: IndexKeys = { partitionKey: { name: "pk", type: "B" } };

    expect(keyError({ pk: { B: new Uint8Array() } }, binaryKey)).toBe(
      'The partition key "pk" can\'t be empty.',
    );
  });
});

describe("key helpers", () => {
  const item: Item = { pk: { S: "a" }, sk: { N: "1" }, other: { S: "x" } };

  it("pickKey keeps only the key attributes", () => {
    expect(pickKey(item, hashAndRange)).toEqual({ pk: { S: "a" }, sk: { N: "1" } });
  });

  it("itemId depends on the key only", () => {
    expect(itemId(item, hashAndRange)).toBe(
      itemId({ ...item, other: { S: "changed" } }, hashAndRange),
    );
  });

  it("keyChanged notices a key edit but not other edits", () => {
    expect(keyChanged(item, { ...item, other: { S: "y" } }, hashAndRange)).toBe(false);
    expect(keyChanged(item, { ...item, sk: { N: "2" } }, hashAndRange)).toBe(true);
  });

  it("keyLabel names the item by its key", () => {
    expect(keyLabel(item, hashAndRange)).toBe("pk = a · sk = 1");
  });
});

describe("parseImportText", () => {
  it("reads a JSON array of items", () => {
    expect(parseImportText('[{"pk": "a"}, {"pk": "b"}]', "json", hashOnly)).toEqual([
      { pk: { S: "a" } },
      { pk: { S: "b" } },
    ]);
  });

  it("refuses anything but an array", () => {
    expect(() => parseImportText('{"pk": "a"}', "json", hashOnly)).toThrow(
      "The file must contain a JSON array of items.",
    );
  });

  it("names the item that has a bad key", () => {
    expect(() => parseImportText('[{"pk": "a"}, {"other": 1}]', "json", hashOnly)).toThrow(
      'Item 2: Missing partition key "pk".',
    );
  });

  it("refuses two items with the same key", () => {
    expect(() =>
      parseImportText('[{"pk": "a"}, {"pk": "b"}, {"pk": "a"}]', "json", hashOnly),
    ).toThrow("Item 3: Same key as item 1.");
  });

  it("reads what exportText writes", () => {
    const items: Item[] = [
      { pk: { S: "a" }, tags: { SS: ["x"] } },
      { pk: { S: "b" }, blob: { B: bytes("hi") } },
    ];

    expect(parseImportText(exportText(items), "dynamodb", hashOnly)).toEqual(items);
  });
});

describe("cellText", () => {
  it("shows a dash for a missing attribute", () => {
    expect(cellText(undefined)).toBe("—");
  });

  it("shows text and numbers as they are", () => {
    expect(cellText({ S: "hello" })).toBe("hello");
    expect(cellText({ N: "12345678901234567890" })).toBe("12345678901234567890");
  });

  it("cuts long text at 80 characters", () => {
    expect(cellText({ S: "x".repeat(100) })).toBe(`${"x".repeat(80)}…`);
  });

  it("describes binary by its size", () => {
    expect(cellText({ B: bytes("hello") })).toBe("Binary (5 B)");
  });

  it("shows nested values as compact JSON, keeping number text", () => {
    expect(cellText({ M: { a: { N: "1.50" }, b: { L: [{ S: "x" }, { NULL: true }] } } })).toBe(
      '{"a":1.50,"b":["x",null]}',
    );

    expect(cellText({ NS: ["1", "2"] })).toBe("[1,2]");
  });
});

describe("isNestedValue", () => {
  it("is true for maps, lists and sets only", () => {
    expect(isNestedValue({ M: {} })).toBe(true);
    expect(isNestedValue({ L: [] })).toBe(true);
    expect(isNestedValue({ SS: ["a"] })).toBe(true);
    expect(isNestedValue({ S: "a" })).toBe(false);
    expect(isNestedValue(undefined)).toBe(false);
  });
});

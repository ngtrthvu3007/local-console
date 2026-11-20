import { describe, expect, it } from "vitest";
import { errorMessage } from "../../src/shared/hooks/useNotify.ts";

describe("errorMessage", () => {
  it("keeps AWS errors as they are", () => {
    const error = Object.assign(new Error("Queue does not exist"), {
      name: "QueueDoesNotExist",
      $metadata: { httpStatusCode: 400 },
    });
    expect(errorMessage(error)).toBe("QueueDoesNotExist: Queue does not exist");
  });

  it("explains a proxy that can't reach Floci instead of the SDK parsing error", () => {
    const error = Object.assign(
      new Error("DOMParser XML parsing error. Deserialization error: …"),
      {
        $metadata: { httpStatusCode: 502 },
      },
    );
    expect(errorMessage(error)).toBe("Floci didn't answer (HTTP 502). Check that it's running.");
  });

  it("explains a browser that can't reach the console server", () => {
    expect(errorMessage(new TypeError("Failed to fetch"))).toBe("Can't reach the console server.");
  });
});

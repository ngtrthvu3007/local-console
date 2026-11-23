import { describe, expect, it } from "vitest";
import {
  LAMBDA_TRIGGERS,
  functionOptionArns,
  poolTriggerRows,
  toLambdaConfig,
  triggerLabelsOf,
  triggerSelectionOf,
  type TriggerSelection,
} from "../../../src/services/cognito/triggers.ts";

const empty = Object.fromEntries(LAMBDA_TRIGGERS.map(({ key }) => [key, ""])) as TriggerSelection;

describe("triggers", () => {
  it("replaces the 10 triggers, keeps custom senders and KMS", () => {
    const current = { PreSignUp: "arn:a", CustomEmailSender: { LambdaArn: "arn:s", LambdaVersion: "V1_0" }, KMSKeyID: "k" } as const;
    expect(toLambdaConfig(current, { ...empty, PostConfirmation: "arn:b" })).toEqual({
      PostConfirmation: "arn:b", CustomEmailSender: current.CustomEmailSender, KMSKeyID: "k",
    });
  });
  it("keeps PreTokenGenerationConfig in step with PreTokenGeneration", () => {
    const current = { PreTokenGeneration: "arn:a", PreTokenGenerationConfig: { LambdaArn: "arn:a", LambdaVersion: "V2_0" } } as const;
    expect(toLambdaConfig(current, { ...empty, PreTokenGeneration: "arn:b" }).PreTokenGenerationConfig).toEqual({ LambdaArn: "arn:b", LambdaVersion: "V2_0" });
    expect(toLambdaConfig(current, empty)).toEqual({});
  });
  it("keeps a missing or versioned function as an option", () => {
    expect(functionOptionArns(["arn:f"], "arn:gone")).toEqual(["arn:f", "arn:gone"]);
    expect(functionOptionArns(["arn:f"], "arn:f")).toEqual(["arn:f"]);
    expect(functionOptionArns(["arn:f"], undefined)).toEqual(["arn:f"]);
  });
  it("finds the triggers of a function, version and alias included", () => {
    const config = { PreSignUp: "arn:fn", CustomMessage: "arn:fn:prod", PostConfirmation: "arn:fnx" };
    expect(triggerLabelsOf(config, "arn:fn")).toEqual(["Pre sign-up", "Custom message"]);
    expect(poolTriggerRows(undefined)).toHaveLength(10);
  });
  it("shows an existing custom sender as a read-only row", () => {
    const config = { CustomSMSSender: { LambdaArn: "arn:fn", LambdaVersion: "V1_0" } } as const;
    expect(poolTriggerRows(config).at(-1)).toEqual({ key: "CustomSMSSender", label: "Custom SMS sender", arn: "arn:fn", editable: false });
    expect(triggerLabelsOf(config, "arn:fn")).toEqual(["Custom SMS sender"]);
  });
  it("reads a V2-only pre token generation trigger and keeps it on save", () => {
    const current = { PreTokenGenerationConfig: { LambdaArn: "arn:v2", LambdaVersion: "V2_0" } } as const;
    expect(triggerSelectionOf(current).PreTokenGeneration).toBe("arn:v2");
    expect(toLambdaConfig(current, triggerSelectionOf(current))).toEqual({ PreTokenGeneration: "arn:v2", PreTokenGenerationConfig: current.PreTokenGenerationConfig });
    expect(triggerLabelsOf(current, "arn:v2")).toEqual(["Pre token generation"]);
  });
});

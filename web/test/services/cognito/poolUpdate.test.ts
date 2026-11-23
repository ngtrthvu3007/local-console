import type { UserPoolType } from "@aws-sdk/client-cognito-identity-provider";
import { describe, expect, it } from "vitest";
import {
  toEmailConfiguration,
  toUpdateUserPoolClientInput,
  toUpdateUserPoolInput,
} from "../../../src/services/cognito/poolUpdate.ts";

const pool: UserPoolType = {
  Id: "ap-southeast-1_a", Arn: "arn:…", Name: "p", CreationDate: new Date(), EstimatedNumberOfUsers: 3, Domain: "d",
  SchemaAttributes: [], UsernameAttributes: ["email"],
  Policies: { PasswordPolicy: { MinimumLength: 8, TemporaryPasswordValidityDays: 7 } },
  AdminCreateUserConfig: { AllowAdminCreateUserOnly: false, UnusedAccountValidityDays: 7 },
  EmailConfiguration: { EmailSendingAccount: "DEVELOPER", SourceArn: "arn:aws:ses:…:identity/a@b.c" },
  LambdaConfig: { PreSignUp: "arn:old" },
};

describe("toUpdateUserPoolInput", () => {
  it("keeps editable fields, drops read-only ones, applies the change", () => {
    const input = toUpdateUserPoolInput(pool, { LambdaConfig: { PostConfirmation: "arn:new" } });
    expect(input.UserPoolId).toBe("ap-southeast-1_a");
    expect(input.EmailConfiguration).toEqual(pool.EmailConfiguration);
    expect(input.LambdaConfig).toEqual({ PostConfirmation: "arn:new" });
    for (const field of ["Id", "Arn", "Name", "CreationDate", "EstimatedNumberOfUsers", "Domain", "SchemaAttributes", "UsernameAttributes"])
      expect(input).not.toHaveProperty(field);
  });
  it("drops deprecated UnusedAccountValidityDays when the password policy has it", () => {
    expect(toUpdateUserPoolInput(pool, {}).AdminCreateUserConfig).toEqual({ AllowAdminCreateUserOnly: false });
  });
});

describe("toUpdateUserPoolClientInput", () => {
  it("client: keeps token validity, drops secret and dates", () => {
    const input = toUpdateUserPoolClientInput(
      { UserPoolId: "p", ClientId: "c", ClientName: "web", ClientSecret: "x", CreationDate: new Date(), RefreshTokenValidity: 30 },
      { ClientName: "web2" },
    );
    expect(input).toEqual({ UserPoolId: "p", ClientId: "c", ClientName: "web2", RefreshTokenValidity: 30 });
  });
});

describe("toEmailConfiguration", () => {
  const ses = { source: "ses", identity: "noreply@app.local", from: "", replyTo: "" } as const;
  const arn = "arn:aws:ses:ap-southeast-1:000000000000:identity/noreply@app.local";
  it("SES omits empty fields", () => {
    expect(toEmailConfiguration(ses, "ap-southeast-1", "000000000000")).toEqual({ EmailSendingAccount: "DEVELOPER", SourceArn: arn });
  });
  it("SES with From", () => {
    expect(toEmailConfiguration({ ...ses, from: "App <noreply@app.local>" }, "ap-southeast-1", "000000000000")).toEqual({
      EmailSendingAccount: "DEVELOPER", SourceArn: arn, From: "App <noreply@app.local>",
    });
  });
  it("Cognito has no SourceArn", () => {
    expect(toEmailConfiguration({ source: "cognito" }, "ap-southeast-1", "000000000000")).toEqual({ EmailSendingAccount: "COGNITO_DEFAULT" });
  });
  it("SES keeps ConfigurationSet", () => {
    expect(toEmailConfiguration(ses, "ap-southeast-1", "000000000000", { ConfigurationSet: "cs" }).ConfigurationSet).toBe("cs");
  });
  it("Cognito drops ConfigurationSet", () => {
    expect(toEmailConfiguration({ source: "cognito" }, "ap-southeast-1", "000000000000", { ConfigurationSet: "cs" })).toEqual({ EmailSendingAccount: "COGNITO_DEFAULT" });
  });
  it("Cognito keeps Reply-To when the pool was not on SES", () => {
    expect(toEmailConfiguration({ source: "cognito" }, "ap-southeast-1", "000000000000", { EmailSendingAccount: "COGNITO_DEFAULT", ReplyToEmailAddress: "r@app.local" })).toEqual({ EmailSendingAccount: "COGNITO_DEFAULT", ReplyToEmailAddress: "r@app.local" });
  });
  it("Cognito after SES returns only the sending account", () => {
    expect(toEmailConfiguration({ source: "cognito" }, "ap-southeast-1", "000000000000", { EmailSendingAccount: "DEVELOPER", ReplyToEmailAddress: "r@app.local" })).toEqual({ EmailSendingAccount: "COGNITO_DEFAULT" });
  });
});

import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
} from "@aws-sdk/client-cloudformation";
import { DeleteSecretCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { DeleteParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { consoleConfig, viaConsole } from "../it/helpers.ts";
import { expect, test, uniqueName } from "./fixtures.ts";

// Secret / parameter do stack tạo: tab Resources link sang trang của chúng, trang đó link ngược về stack

const stack = uniqueName("cfnsecrets");
const secret = `${uniqueName("stacksecret")}/db`;
const parameter = `/${uniqueName("stackparam")}/db-host`;

test.describe.configure({ mode: "serial" });

let config: ReturnType<typeof viaConsole>;

test.beforeAll(async () => {
  config = viaConsole((await consoleConfig()).region);
  await new CloudFormationClient(config).send(
    new CreateStackCommand({
      StackName: stack,
      TemplateBody: JSON.stringify({
        Resources: {
          Secret: {
            Type: "AWS::SecretsManager::Secret",
            Properties: { Name: secret, GenerateSecretString: {} },
          },
          Parameter: {
            Type: "AWS::SSM::Parameter",
            Properties: { Name: parameter, Type: "String", Value: "localhost" },
          },
        },
      }),
    }),
  );
});

test.afterAll(async () => {
  const ignore = () => undefined;
  await new CloudFormationClient(config)
    .send(new DeleteStackCommand({ StackName: stack }))
    .catch(ignore);
  await new SecretsManagerClient(config)
    .send(new DeleteSecretCommand({ SecretId: secret, ForceDeleteWithoutRecovery: true }))
    .catch(ignore);
  await new SSMClient(config).send(new DeleteParameterCommand({ Name: parameter })).catch(ignore);
});

for (const { logicalId, name } of [
  { logicalId: "Secret", name: secret },
  { logicalId: "Parameter", name: parameter },
]) {
  test(`the stack's ${logicalId.toLowerCase()} links both ways`, async ({ page }) => {
    await page.goto(`/cloudformation/stacks/${stack}?tab=resources`);
    await page.getByRole("row").filter({ hasText: logicalId }).getByRole("link").click();

    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await page.getByRole("link", { name: stack }).click();
    await expect(page).toHaveURL(new RegExp(`/cloudformation/stacks/${stack}`));
  });
}

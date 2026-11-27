import {
  CreateAliasCommand,
  DeleteAliasCommand,
  UpdateAliasCommand,
  type KMSClient,
} from "@aws-sdk/client-kms";

export interface AliasInput {
  name: string;
  keyId: string;
  replace: boolean;
}

export const saveAlias = (kms: KMSClient, { name, keyId, replace }: AliasInput) =>
  kms.send(
    replace
      ? new UpdateAliasCommand({ AliasName: name, TargetKeyId: keyId })
      : new CreateAliasCommand({ AliasName: name, TargetKeyId: keyId }),
  );

export const deleteAlias = (kms: KMSClient, name: string) =>
  kms.send(new DeleteAliasCommand({ AliasName: name }));

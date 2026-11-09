import SpaceBetween from "@cloudscape-design/components/space-between";
import type { CORSRule } from "@aws-sdk/client-s3";
import { JsonSettingEditor } from "@shared/components/JsonSettingEditor.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { prettyJson, reformatJson } from "@shared/json.ts";
import { EXAMPLE_CORS_RULES, examplePublicReadPolicy } from "../constants.ts";
import { bucketPolicySchema } from "../schemas.ts";
import {
  useBucketCors,
  useBucketPolicy,
  useSaveBucketCors,
  useSaveBucketPolicy,
} from "../hooks/useBucketSettings.ts";

function PolicyEditor({ bucket }: { bucket: string }) {
  const policy = useBucketPolicy(bucket);
  const savePolicy = useSaveBucketPolicy(bucket);
  const savedText = policy.data ? reformatJson(policy.data) : null;

  const save = (text: string) =>
    savePolicy.mutate(
      text,
      notifyOutcome({ success: "Saved bucket policy", errorHeader: "Couldn't save the policy" }),
    );

  const remove = (then: () => void) =>
    savePolicy.mutate(
      null,
      notifyOutcome({
        success: "Deleted bucket policy",
        errorHeader: "Couldn't delete the policy",
        then,
      }),
    );

  return (
    <JsonSettingEditor
      title='Bucket policy'
      description='JSON policy that grants or denies access to this bucket and its objects.'
      savedText={savedText}
      query={policy}
      validate={(value) => bucketPolicySchema.safeParse(value).error?.issues[0]?.message}
      saving={savePolicy.isPending}
      exampleText={prettyJson(examplePublicReadPolicy(bucket))}
      onSave={save}
      onDelete={remove}
    />
  );
}

function CorsEditor({ bucket }: { bucket: string }) {
  const cors = useBucketCors(bucket);
  const saveCors = useSaveBucketCors(bucket);
  const savedText = cors.data ? prettyJson(cors.data) : null;

  const save = (text: string) =>
    saveCors.mutate(
      JSON.parse(text) as CORSRule[],
      notifyOutcome({ success: "Saved CORS rules", errorHeader: "Couldn't save CORS" }),
    );

  const remove = (then: () => void) =>
    saveCors.mutate(
      null,
      notifyOutcome({ success: "Deleted CORS rules", errorHeader: "Couldn't delete CORS", then }),
    );

  return (
    <JsonSettingEditor
      title='Cross-origin resource sharing (CORS)'
      description='A JSON array of rules. Needed when a web page uploads to or reads from this bucket directly.'
      savedText={savedText}
      query={cors}
      saving={saveCors.isPending}
      exampleText={prettyJson(EXAMPLE_CORS_RULES)}
      onSave={save}
      onDelete={remove}
    />
  );
}

export function PermissionsTab({ bucket }: { bucket: string }) {
  return (
    <SpaceBetween size='l'>
      <PolicyEditor bucket={bucket} />
      <CorsEditor bucket={bucket} />
    </SpaceBetween>
  );
}

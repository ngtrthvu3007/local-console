import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs, {
  type KeyValuePairsProps,
} from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { DETAIL_SEPARATOR, LOADING_PLACEHOLDER } from "@shared/constants.ts";
import { formatBytes, formatDate, formatTime, pluralize } from "@shared/format.ts";
import { notifyError } from "@shared/hooks/useNotify.ts";
import { bucketArn, s3Uri } from "../../helpers.ts";
import { useBuckets } from "../../hooks/useBuckets.ts";
import { KeyLink } from "../../../kms/components/KeyLink.tsx";
import { defaultKeyLabel } from "../../../kms/keys.ts";
import { S3_KEY_SERVICE, SSE_KMS_ALGORITHM, SSE_LABELS } from "../../constants.ts";
import {
  useBucketEncryption,
  useBucketRegion,
  useBucketTotalSize,
} from "../../hooks/useBucketSettings.ts";

const OVERVIEW_COLUMNS = 4;

function TotalSize({ bucket }: { bucket: string }) {
  const totals = useBucketTotalSize(bucket);
  const calculate = () =>
    totals.refetch().then((result) => {
      if (result.error) notifyError(result.error, "Couldn't calculate the total size");
    });

  const button = (
    <Button variant='inline-link' loading={totals.isFetching} onClick={calculate}>
      {totals.data ? "Recalculate" : "Calculate"}
    </Button>
  );
  if (!totals.data) return button;

  const { objectCount, totalBytes } = totals.data;
  return (
    <SpaceBetween size='xxxs'>
      <Box>
        {formatBytes(totalBytes)} · {pluralize(objectCount, "object")}
      </Box>
      <Box variant='small' color='text-body-secondary'>
        Calculated at {formatTime(totals.dataUpdatedAt)} · {button}
      </Box>
    </SpaceBetween>
  );
}

// "SSE-S3", hoặc "SSE-KMS" kèm link key (trống = aws/s3)
function DefaultEncryption({ bucket }: { bucket: string }) {
  const encryption = useBucketEncryption(bucket).data;
  if (!encryption) return <>{LOADING_PLACEHOLDER}</>;

  const label = SSE_LABELS[encryption.algorithm] ?? encryption.algorithm;
  if (encryption.algorithm !== SSE_KMS_ALGORITHM) return <>{label}</>;
  return (
    <>
      {label}
      {DETAIL_SEPARATOR}
      {encryption.keyId ? <KeyLink value={encryption.keyId} /> : defaultKeyLabel(S3_KEY_SERVICE)}
    </>
  );
}

export function OverviewSection({ bucket }: { bucket: string }) {
  const region = useBucketRegion(bucket);
  const created = useBuckets().data?.find((item) => item.Name === bucket)?.CreationDate;
  const arn = bucketArn(bucket);
  const uri = s3Uri(bucket);

  const items: KeyValuePairsProps.Item[] = [
    { label: "Region", value: region.data ?? LOADING_PLACEHOLDER },
    { label: "Creation date", value: formatDate(created) },
    { label: "ARN", value: <CopyButton variant='inline' text={arn} label={arn} /> },
    { label: "S3 URI", value: <CopyButton variant='inline' text={uri} label={uri} /> },
    { label: "Total size", value: <TotalSize bucket={bucket} /> },
    { label: "Default encryption", value: <DefaultEncryption bucket={bucket} /> },
  ];

  return (
    <Container header={<Header variant='h2'>Bucket overview</Header>}>
      <KeyValuePairs columns={OVERVIEW_COLUMNS} items={items} />
    </Container>
  );
}

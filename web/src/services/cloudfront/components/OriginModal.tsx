import { useEffect } from "react";
import { useWatch } from "react-hook-form";
import type { DistributionConfig, Origin } from "@aws-sdk/client-cloudfront";
import Box from "@cloudscape-design/components/box";
import FormField from "@cloudscape-design/components/form-field";
import SpaceBetween from "@cloudscape-design/components/space-between";
import {
  FormInput,
  FormRadioGroup,
  FormSelect,
  FormTiles,
} from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useBuckets } from "../../s3/hooks/useBuckets.ts";
import {
  ORIGIN_PORTS,
  ORIGIN_PROTOCOL_LABELS,
  ORIGIN_PROTOCOLS,
  ORIGIN_TYPES,
  type OriginProtocol,
} from "../constants.ts";
import {
  bucketOfOriginDomain,
  originFromForm,
  originTypeOf,
  originsOf,
  portOf,
  protocolOf,
  s3OriginDomain,
  withOrigin,
} from "../distributions.ts";
import { useUpdateDistribution } from "../hooks/useDistributions.ts";
import { originSchema, type OriginForm } from "../schemas.ts";

const TYPE_ITEMS = [
  { value: ORIGIN_TYPES.s3, label: "S3 bucket", description: "A bucket in Floci." },
  {
    value: ORIGIN_TYPES.custom,
    label: "Custom origin",
    description: "An HTTP server, like your API.",
  },
];
const PROTOCOL_ITEMS = Object.entries(ORIGIN_PROTOCOL_LABELS).map(([value, label]) => ({
  value,
  label,
}));

// Floci chặn host private trừ khi được cho phép (spec 7 #6); website endpoint S3 đi ra AWS thật
const DOMAIN_DESCRIPTION =
  "An app on your machine: use host.docker.internal, and start Floci with FLOCI_SERVICES_CLOUDFRONT_ALLOWED_PRIVATE_ORIGIN_HOSTS=host.docker.internal. For buckets in Floci, choose S3 bucket: a custom origin is fetched as is.";

const isOriginProtocol = (value: string): value is OriginProtocol => value in ORIGIN_PORTS;

function initialValues(origin?: Origin): OriginForm {
  if (!origin) {
    return {
      type: ORIGIN_TYPES.s3,
      bucket: "",
      domain: "",
      protocol: ORIGIN_PROTOCOLS.http,
      port: String(ORIGIN_PORTS[ORIGIN_PROTOCOLS.http]),
      path: "",
      id: "",
    };
  }

  const protocol = protocolOf(origin);
  return {
    type: originTypeOf(origin),
    bucket: bucketOfOriginDomain(origin.DomainName ?? "") ?? "",
    domain: origin.DomainName ?? "",
    protocol,
    port: String(portOf(origin, protocol)),
    path: origin.OriginPath ?? "",
    id: origin.Id ?? "",
  };
}

interface Props {
  distributionId: string;
  config: DistributionConfig;
  origin?: Origin; // có = sửa
  onDismiss: () => void;
}

// Chỉ mount khi mở. Sửa chỉ gửi field trong form, withOrigin giữ OAC, timeout, header (spec 3.4)
export function OriginModal({ distributionId, config, origin, onDismiss }: Props) {
  const { region } = useLoadedConfig();
  const buckets = useBuckets();
  const update = useUpdateDistribution(distributionId);
  const editing = Boolean(origin);
  const otherIds = originsOf(config).flatMap(({ Id }) => (Id && Id !== origin?.Id ? [Id] : []));
  const form = useZodForm(originSchema(otherIds), initialValues(origin));
  const [type, bucket, domain] = useWatch({
    control: form.control,
    name: ["type", "bucket", "domain"],
  });
  const originDomain =
    type === ORIGIN_TYPES.s3 ? (bucket ? s3OriginDomain(bucket, region) : "") : domain;

  // Origin ID mặc định là domain (như AWS console), tới khi người dùng tự sửa
  useEffect(() => {
    if (!editing && !form.getFieldState("id").isDirty) form.setValue("id", originDomain);
  }, [editing, form, originDomain]);

  const submit = form.handleSubmit((values) => {
    const next = originFromForm({ ...values, port: Number(values.port) }, region, origin);
    update.mutate(
      (latest) => withOrigin(latest, next, { replace: editing }),
      notifyOutcome({
        success: `Saved origin ${values.id}`,
        errorHeader: "Couldn't save origin",
        then: onDismiss,
      }),
    );
  });

  return (
    <FormModal
      header={editing ? `Edit origin ${origin?.Id}` : "Create origin"}
      actionText={editing ? "Save" : "Create origin"}
      loading={update.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <SpaceBetween size='m'>
        {editing ? (
          <FormField label='Origin type'>
            <Box>{type === ORIGIN_TYPES.s3 ? "S3 bucket" : "Custom origin"}</Box>
          </FormField>
        ) : (
          <FormTiles control={form.control} name='type' label='Origin type' items={TYPE_ITEMS} />
        )}
        {type === ORIGIN_TYPES.s3 ? (
          <FormSelect
            control={form.control}
            name='bucket'
            label='Bucket'
            placeholder='Choose a bucket'
            options={(buckets.data ?? []).map(({ Name = "" }) => ({ value: Name, label: Name }))}
          />
        ) : (
          <>
            <FormInput
              control={form.control}
              name='domain'
              label='Origin domain'
              placeholder='api.example.com'
              description={DOMAIN_DESCRIPTION}
            />
            <FormRadioGroup
              control={form.control}
              name='protocol'
              label='Protocol'
              items={PROTOCOL_ITEMS}
              onChange={(value) => {
                // Port theo protocol, tới khi người dùng tự sửa
                if (!form.getFieldState("port").isDirty && isOriginProtocol(value)) {
                  form.setValue("port", String(ORIGIN_PORTS[value]));
                }
              }}
            />
            <FormInput control={form.control} name='port' label='Port' />
          </>
        )}
        <FormInput
          control={form.control}
          name='path'
          label='Origin path - optional'
          placeholder='/v1'
          constraintText="Starts with / and doesn't end with /."
        />
        {editing ? (
          <FormField label='Origin ID' description='Behaviors point to the origin by its ID.'>
            <Box>{origin?.Id}</Box>
          </FormField>
        ) : (
          <FormInput control={form.control} name='id' label='Origin ID' />
        )}
      </SpaceBetween>
    </FormModal>
  );
}

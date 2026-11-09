import { useEffect, useState } from "react";
import { useWatch } from "react-hook-form";
import Box from "@cloudscape-design/components/box";
import FormField from "@cloudscape-design/components/form-field";
import type { SegmentedControlProps } from "@cloudscape-design/components/segmented-control";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { FormSegmentedControl, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { MILLISECONDS_PER_SECOND } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { notifyError } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  DEFAULT_PRESIGN_EXPIRY,
  PRESIGN_EXPIRY_OPTIONS,
  PRESIGN_METHOD_LABELS,
  PRESIGN_METHODS,
} from "../constants.ts";
import { fileNameOf, s3Uri } from "../helpers.ts";
import { useS3 } from "../hooks/useS3.ts";
import { presign } from "../presign.ts";
import { presignSchema } from "../schemas.ts";

const METHOD_OPTIONS: SegmentedControlProps.Option[] = PRESIGN_METHODS.map((method) => ({
  id: method,
  text: PRESIGN_METHOD_LABELS[method],
}));

const [DEFAULT_METHOD] = PRESIGN_METHODS;
const INITIAL_VALUES = { method: DEFAULT_METHOD, expiresIn: DEFAULT_PRESIGN_EXPIRY.value };

const curlUploadCommand = (fileName: string, url: string) =>
  `curl -X PUT -T ./${fileName} "${url}"`;

interface Props {
  bucket: string;
  objectKey: string;
  onDismiss: () => void;
}

interface SignedUrl {
  url: string;
  expiresAt: Date;
}

// Chỉ mount khi mở
export function PresignModal({ bucket, objectKey, onDismiss }: Props) {
  const { signer } = useS3();
  const [signed, setSigned] = useState<SignedUrl>();
  const [creating, setCreating] = useState(false);
  const form = useZodForm(presignSchema, INITIAL_VALUES);
  const [method, expiresIn] = useWatch({ control: form.control, name: ["method", "expiresIn"] });

  // Đổi lựa chọn thì URL cũ không còn đúng
  useEffect(() => setSigned(undefined), [method, expiresIn]);

  const submit = form.handleSubmit(async (values) => {
    setCreating(true);
    const seconds = Number(values.expiresIn);
    try {
      const url = await presign(signer, {
        bucket,
        key: objectKey,
        method: values.method,
        expiresIn: seconds,
      });
      setSigned({ url, expiresAt: new Date(Date.now() + seconds * MILLISECONDS_PER_SECOND) });
    } catch (error) {
      notifyError(error, "Couldn't create the URL");
    } finally {
      setCreating(false);
    }
  });

  return (
    <FormModal
      size='large'
      header='Share with a pre-signed URL'
      actionText='Create URL'
      cancelText='Close'
      loading={creating}
      // URL đã khớp lựa chọn hiện tại thì không cần tạo lại; đổi lựa chọn để tạo URL mới
      disabled={Boolean(signed)}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <Box color='text-body-secondary'>{s3Uri(bucket, objectKey)}</Box>
      <FormSegmentedControl
        control={form.control}
        name='method'
        label='Allow'
        options={METHOD_OPTIONS}
      />
      <FormSelect
        control={form.control}
        name='expiresIn'
        label='Expires in'
        options={PRESIGN_EXPIRY_OPTIONS}
      />
      {signed && (
        <FormField label='URL' description={`Valid until ${formatDate(signed.expiresAt)}`}>
          <CodeSnippet code={signed.url} />
        </FormField>
      )}
      {signed && method === "PUT" && (
        <FormField label='Upload with curl'>
          <CodeSnippet code={curlUploadCommand(fileNameOf(objectKey), signed.url)} />
        </FormField>
      )}
    </FormModal>
  );
}

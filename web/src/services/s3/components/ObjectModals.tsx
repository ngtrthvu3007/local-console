import { Controller, useFieldArray } from "react-hook-form";
import Alert from "@cloudscape-design/components/alert";
import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import Box from "@cloudscape-design/components/box";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import {
  CONFIRM_DELETE,
  CONFIRM_PERMANENT_DELETE,
  ConfirmModal,
} from "@shared/components/ConfirmModal.tsx";
import { FormInput, FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { TagsModal } from "@shared/components/TagsModal.tsx";
import { DELETE_PREVIEW_COUNT } from "@shared/constants.ts";
import { pluralize } from "@shared/format.ts";
import { notifyBulkOutcome, notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { asFolderKey, fileNameOf, s3Uri, withoutTrailingDelimiter } from "../helpers.ts";
import { useBuckets } from "../hooks/useBuckets.ts";
import {
  useEditMetadata,
  useHeadObject,
  useObjectTags,
  usePutObjectTags,
} from "../hooks/useObject.ts";
import {
  useCreateFolder,
  useDeleteObjects,
  useTransfer,
  type ObjectRow,
} from "../hooks/useObjects.ts";
import { createFolderSchema, metadataSchema, renameSchema, transferSchema } from "../schemas.ts";

// Các modal ở đây chỉ mount khi mở, nên không nhận `visible`
interface ModalProps {
  bucket: string;
  onDismiss: () => void;
}

interface BulkModalProps extends ModalProps {
  onDone: () => void; // gọi khi thành công, thay cho onDismiss (vd: đóng modal và bỏ chọn)
}

export function CreateFolderModal({ bucket, prefix, onDismiss }: ModalProps & { prefix: string }) {
  const createFolder = useCreateFolder(bucket);
  const form = useZodForm(createFolderSchema, { name: "" });

  const submit = form.handleSubmit(({ name }) =>
    createFolder.mutate(
      prefix + name,
      notifyOutcome({
        success: `Created folder ${asFolderKey(name)}`,
        errorHeader: "Couldn't create folder",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Create folder'
      actionText='Create folder'
      loading={createFolder.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='name'
        label='Folder name'
        description={`Created in ${s3Uri(bucket, prefix)}`}
        autoFocus
      />
    </FormModal>
  );
}

export function DeleteObjectsModal({
  bucket,
  rows,
  versioned,
  onDismiss,
  onDone,
}: BulkModalProps & { rows: ObjectRow[]; versioned: boolean }) {
  const deleteRows = useDeleteObjects(bucket);
  // Xóa version cụ thể, hoặc bucket không có versioning, thì không khôi phục được
  const permanent = rows.some((row) => row.versionId) || !versioned;
  const hiddenCount = rows.length - DELETE_PREVIEW_COUNT;

  const submit = () =>
    deleteRows.mutate(
      rows,
      notifyBulkOutcome({
        success: (result) => `Deleted ${pluralize(result.count, "object")}`,
        errorHeader: "Couldn't delete",
        then: onDone,
      }),
    );

  const preview = (
    <Box>
      {rows.slice(0, DELETE_PREVIEW_COUNT).map((row) => (
        <div key={row.key + (row.versionId ?? "")}>
          {row.key}
          {row.versionId && <Box variant='small'> version {row.versionId}</Box>}
        </div>
      ))}
      {hiddenCount > 0 && <Box color='text-body-secondary'>…and {hiddenCount} more</Box>}
    </Box>
  );

  const consequence = permanent ? (
    <Alert type='warning'>This can't be undone.</Alert>
  ) : (
    <Alert>
      Versioning is on: S3 adds a delete marker, and you can restore the objects from "Show
      versions".
    </Alert>
  );

  return (
    <ConfirmModal
      visible
      header={`Delete ${pluralize(rows.length, "item")}?`}
      confirmText={permanent ? CONFIRM_PERMANENT_DELETE : CONFIRM_DELETE}
      actionText='Delete'
      loading={deleteRows.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      {preview}
      {rows.some((row) => row.isFolder) && (
        <Alert>Folders are deleted together with everything inside them.</Alert>
      )}
      {consequence}
    </ConfirmModal>
  );
}

export function TransferModal({
  bucket,
  prefix,
  rows,
  move,
  onDismiss,
  onDone,
}: BulkModalProps & { prefix: string; rows: ObjectRow[]; move: boolean }) {
  const buckets = useBuckets();
  const transfer = useTransfer(bucket);
  const form = useZodForm(transferSchema(bucket, prefix), {
    destinationBucket: bucket,
    destinationFolder: prefix,
  });

  const verb = move ? "Move" : "Copy";
  const pastTense = move ? "Moved" : "Copied";
  const bucketOptions = (buckets.data ?? []).map((item) => ({
    value: item.Name!,
    label: item.Name!,
  }));

  const submit = form.handleSubmit(({ destinationBucket, destinationFolder }) => {
    const destinationPrefix = destinationFolder ? asFolderKey(destinationFolder) : "";
    const destination = s3Uri(destinationBucket, destinationPrefix);
    transfer.mutate(
      { rows, sourcePrefix: prefix, destinationBucket, destinationPrefix, move },
      notifyBulkOutcome({
        success: (result) => `${pastTense} ${pluralize(result.count, "object")} to ${destination}`,
        errorHeader: `Couldn't ${verb.toLowerCase()}`,
        then: onDone,
      }),
    );
  });

  return (
    <FormModal
      header={`${verb} ${pluralize(rows.length, "item")}`}
      actionText={verb}
      loading={transfer.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormSelect
        control={form.control}
        name='destinationBucket'
        label='Destination bucket'
        options={bucketOptions}
      />
      <FormInput
        control={form.control}
        name='destinationFolder'
        label='Destination folder'
        description='Leave empty for the bucket root.'
        placeholder='images/2026/'
      />
      {rows.some((row) => row.isFolder) && (
        <Alert>Folders are {pastTense.toLowerCase()} with everything inside them.</Alert>
      )}
    </FormModal>
  );
}

export function RenameModal({
  bucket,
  prefix,
  row,
  onDismiss,
  onDone,
}: BulkModalProps & { prefix: string; row: ObjectRow }) {
  const currentName = withoutTrailingDelimiter(row.name);
  const transfer = useTransfer(bucket);
  const form = useZodForm(renameSchema(currentName), { newName: currentName });

  const submit = form.handleSubmit(({ newName }) =>
    transfer.mutate(
      {
        rows: [row],
        sourcePrefix: prefix,
        destinationBucket: bucket,
        destinationPrefix: prefix,
        move: true,
        newName,
      },
      notifyBulkOutcome({
        success: () => `Renamed ${currentName} to ${newName}`,
        errorHeader: "Couldn't rename",
        then: onDone,
      }),
    ),
  );

  return (
    <FormModal
      header={`Rename ${row.isFolder ? "folder" : "object"}`}
      actionText='Rename'
      loading={transfer.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput control={form.control} name='newName' label='New name' autoFocus />
      {row.isFolder && (
        <Alert>
          S3 has no rename: every object in the folder is copied to the new name, then deleted.
        </Alert>
      )}
    </FormModal>
  );
}

const EMPTY_METADATA_ENTRY = { key: "", value: "" };

type MetadataModalProps = ModalProps & { objectKey: string };

// Chờ đọc xong metadata hiện tại rồi mới mở form, để giá trị ban đầu đúng
export function EditMetadataModal(props: MetadataModalProps) {
  const head = useHeadObject(props.bucket, props.objectKey);
  if (!head.data) return null;
  return (
    <MetadataForm
      {...props}
      contentType={head.data.ContentType ?? ""}
      metadata={head.data.Metadata ?? {}}
    />
  );
}

function MetadataForm({
  bucket,
  objectKey,
  contentType: currentContentType,
  metadata: currentMetadata,
  onDismiss,
}: MetadataModalProps & { contentType: string; metadata: Record<string, string> }) {
  const editMetadata = useEditMetadata(bucket);
  const form = useZodForm(metadataSchema, {
    contentType: currentContentType,
    entries: Object.entries(currentMetadata).map(([key, value]) => ({ key, value })),
  });
  const entries = useFieldArray({ control: form.control, name: "entries" });

  const submit = form.handleSubmit(({ contentType, entries: values }) => {
    // S3 lưu key metadata dạng chữ thường
    const metadata = Object.fromEntries(
      values.filter((entry) => entry.key).map((entry) => [entry.key.toLowerCase(), entry.value]),
    );
    editMetadata.mutate(
      { key: objectKey, contentType, metadata },
      notifyOutcome({
        success: `Updated metadata of ${fileNameOf(objectKey)}`,
        errorHeader: "Couldn't update metadata",
        then: onDismiss,
      }),
    );
  });

  const entryInput = (part: "key" | "value") => (_entry: unknown, index: number) => (
    <Controller
      control={form.control}
      name={`entries.${index}.${part}`}
      render={({ field }) => (
        <Input value={field.value} onChange={({ detail }) => field.onChange(detail.value)} />
      )}
    />
  );

  const definition = [
    { label: "Key", control: entryInput("key") },
    { label: "Value", control: entryInput("value") },
  ];

  return (
    <FormModal
      size='large'
      header='Edit metadata'
      actionText='Save changes'
      loading={editMetadata.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='contentType'
        label='Content-Type'
        placeholder='application/octet-stream'
      />
      <FormField
        label='User-defined metadata'
        description='Stored as x-amz-meta-<key>. Keys are lowercased.'
      >
        <AttributeEditor
          items={entries.fields}
          definition={definition}
          addButtonText='Add metadata'
          removeButtonText='Remove'
          empty='No user-defined metadata.'
          onAddButtonClick={() => entries.append(EMPTY_METADATA_ENTRY)}
          onRemoveButtonClick={({ detail }) => entries.remove(detail.itemIndex)}
        />
      </FormField>
    </FormModal>
  );
}

export function ObjectTagsModal({
  bucket,
  objectKey,
  onDismiss,
}: ModalProps & { objectKey: string }) {
  const tags = useObjectTags(bucket, objectKey);
  const saveTags = usePutObjectTags(bucket);
  if (!tags.data) return null;
  return (
    <TagsModal
      header={`Edit tags: ${fileNameOf(objectKey)}`}
      tags={tags.data}
      saving={saveTags.isPending}
      onDismiss={onDismiss}
      onSave={(next) =>
        saveTags.mutate(
          { key: objectKey, tags: next },
          notifyOutcome({
            success: "Saved tags",
            errorHeader: "Couldn't save tags",
            then: onDismiss,
          }),
        )
      }
    />
  );
}

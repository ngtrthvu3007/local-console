import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import { CONFIRM_PERMANENT_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useBucketHasObjects, useDeleteBucket, useEmptyBucket } from "../hooks/useBuckets.ts";

interface Props {
  bucket: string;
  visible: boolean;
  onDismiss: () => void;
  onDone?: () => void; // gọi khi thành công, thay cho onDismiss; mặc định chỉ đóng modal
}

export function DeleteBucketModal({ bucket, visible, onDismiss, onDone }: Props) {
  const hasObjects = useBucketHasObjects(bucket, visible);
  const deleteBucket = useDeleteBucket();
  const emptyFirst = hasObjects.data === true;

  const submit = () =>
    deleteBucket.mutate(
      { bucket, emptyFirst },
      notifyOutcome({
        success: `Deleted bucket ${bucket}`,
        errorHeader: `Couldn't delete ${bucket}`,
        then: onDone ?? onDismiss,
      }),
    );

  const notEmptyWarning = (
    <Alert type='warning' header='This bucket is not empty'>
      Every object and every version in it will be permanently deleted first. This can't be undone.
    </Alert>
  );
  const emptyNotice = <Box>The bucket is empty. Deleting it can't be undone.</Box>;
  const body = hasObjects.isLoading ? <Spinner /> : emptyFirst ? notEmptyWarning : emptyNotice;

  return (
    <ConfirmModal
      visible={visible}
      header={`Delete bucket ${bucket}?`}
      confirmText={bucket}
      actionText={emptyFirst ? "Empty and delete" : "Delete bucket"}
      loading={deleteBucket.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      {body}
    </ConfirmModal>
  );
}

export function EmptyBucketModal({ bucket, visible, onDismiss, onDone }: Props) {
  const emptyBucket = useEmptyBucket();

  const submit = () =>
    emptyBucket.mutate(
      bucket,
      notifyOutcome({
        success: (deleted: number) => `Emptied ${bucket}: deleted ${deleted} objects and versions`,
        errorHeader: `Couldn't empty ${bucket}`,
        then: onDone ?? onDismiss,
      }),
    );

  return (
    <ConfirmModal
      visible={visible}
      header={`Empty bucket ${bucket}?`}
      confirmText={CONFIRM_PERMANENT_DELETE}
      actionText='Empty'
      loading={emptyBucket.isPending}
      onConfirm={submit}
      onDismiss={onDismiss}
    >
      <Alert type='warning'>
        Every object in the bucket is deleted, including all versions and delete markers. This can't
        be undone.
      </Alert>
    </ConfirmModal>
  );
}

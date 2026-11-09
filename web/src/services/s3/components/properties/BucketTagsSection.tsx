import { useState } from "react";
import { TagsModal, type Tag } from "@shared/components/TagsModal.tsx";
import { TagsTable } from "@shared/components/TagsTable.tsx";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useBucketTags, useSaveBucketTags } from "../../hooks/useBucketSettings.ts";

export function BucketTagsSection({ bucket }: { bucket: string }) {
  const tags = useBucketTags(bucket);
  const saveTags = useSaveBucketTags(bucket);
  const [editing, setEditing] = useState(false);
  const close = () => setEditing(false);

  const save = (next: Tag[]) =>
    saveTags.mutate(
      next,
      notifyOutcome({ success: "Saved tags", errorHeader: "Couldn't save tags", then: close }),
    );

  return (
    <>
      <TagsTable tags={tags.data ?? []} loading={tags.isLoading} onEdit={() => setEditing(true)} />
      {editing && tags.data && (
        <TagsModal
          header='Edit bucket tags'
          tags={tags.data}
          saving={saveTags.isPending}
          onDismiss={close}
          onSave={save}
        />
      )}
    </>
  );
}

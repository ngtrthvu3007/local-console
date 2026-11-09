import { useState } from "react";
import Modal from "@cloudscape-design/components/modal";
import TagEditor, { type TagEditorProps } from "@cloudscape-design/components/tag-editor";
import { ModalFooter } from "./ModalFooter.tsx";

export interface Tag {
  key: string;
  value: string;
}

// TagEditor chỉ đánh dấu tag bị xóa, không bỏ hẳn
export const activeTags = (tags: readonly TagEditorProps.Tag[]): Tag[] =>
  tags.filter((tag) => !tag.markedForRemoval).map(({ key, value }) => ({ key, value }));

interface Props {
  header: string;
  tags: Tag[]; // tag đang lưu, phải tải xong trước khi mount
  saving?: boolean;
  onSave: (tags: Tag[]) => void;
  onDismiss: () => void;
}

// Chỉ mount khi mở: bản nháp lấy từ tags lúc mở
export function TagsModal({ header, tags, saving, onSave, onDismiss }: Props) {
  const [draft, setDraft] = useState<TagEditorProps.Tag[]>(() =>
    tags.map((tag) => ({ ...tag, existing: true })),
  );
  const [valid, setValid] = useState(true);

  return (
    <Modal
      visible
      onDismiss={onDismiss}
      size='large'
      header={header}
      footer={
        <ModalFooter
          actionText='Save changes'
          disabled={!valid}
          loading={saving}
          onAction={() => onSave(activeTags(draft))}
          onCancel={onDismiss}
        />
      }
    >
      <TagEditor
        tags={draft}
        onChange={({ detail }) => {
          setDraft([...detail.tags]);
          setValid(detail.valid);
        }}
      />
    </Modal>
  );
}

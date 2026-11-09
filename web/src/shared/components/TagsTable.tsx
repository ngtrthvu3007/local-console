import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Table from "@cloudscape-design/components/table";
import { EmptyState } from "./TableStates.tsx";
import type { Tag } from "./TagsModal.tsx";

interface Props {
  tags: Tag[];
  loading?: boolean;
  description?: string;
  onEdit: () => void;
}

export function TagsTable({ tags, loading, description, onEdit }: Props) {
  return (
    <Table
      variant='container'
      items={tags}
      loading={loading}
      loadingText='Loading tags'
      trackBy='key'
      columnDefinitions={[
        { id: "key", header: "Key", cell: (tag) => tag.key, isRowHeader: true },
        { id: "value", header: "Value", cell: (tag) => tag.value },
      ]}
      empty={<EmptyState title='No tags' />}
      header={
        <Header
          counter={`(${tags.length})`}
          description={description}
          actions={<Button onClick={onEdit}>Edit</Button>}
        >
          Tags
        </Header>
      }
    />
  );
}

import { useEffect } from "react";
import {
  useController,
  useWatch,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import { FormSelect } from "@shared/components/form/FormFields.tsx";
import { revisionToSelect, STATUS } from "@localconsole/core/ecs";
import { REVISION_STATUS_STYLES } from "../constants.ts";
import { useFamilies, useRevisions } from "../hooks/useTaskDefinitions.ts";

interface Props<TValues extends FieldValues> {
  control: Control<TValues, unknown, FieldValues>;
  names: { family: Path<TValues>; revision: Path<TValues> };
}

// Family + revision Active; đổi family thì chọn sẵn revision mới nhất (như AWS Console).
// Revision đang dùng mà đã Inactive vẫn giữ và hiện trong danh sách (sửa service / schedule có sẵn)
export function TaskDefinitionFields<TValues extends FieldValues>({
  control,
  names,
}: Props<TValues>) {
  const families = useFamilies(STATUS.active);
  const family: string = useWatch({ control, name: names.family }) ?? "";
  const revisions = useRevisions(family);
  const { field: revisionField } = useController({ control, name: names.revision });
  const rows = revisions.data ?? [];
  const revision = String(revisionField.value ?? "");
  const setRevision = revisionField.onChange;
  const toSelect = revisionToSelect(rows, revision);
  const [latest] = rows.filter((row) => row.status === STATUS.active);
  const choices = rows.filter(
    (row) => row.status === STATUS.active || String(row.revision) === revision,
  );

  useEffect(() => {
    if (toSelect !== undefined) setRevision(toSelect);
  }, [toSelect, setRevision]);

  return (
    <>
      <FormSelect
        control={control}
        name={names.family}
        label='Task definition'
        placeholder='Choose a task definition'
        empty='No active task definitions'
        options={(families.data ?? []).map((name) => ({ value: name, label: name }))}
      />
      <FormSelect
        control={control}
        name={names.revision}
        label='Revision'
        placeholder='Choose a revision'
        options={choices.map((row) => ({
          value: String(row.revision),
          label:
            row === latest
              ? `${row.revision} (latest)`
              : row.status === STATUS.active
                ? String(row.revision)
                : `${row.revision} (${REVISION_STATUS_STYLES[row.status].label.toLowerCase()})`,
        }))}
      />
    </>
  );
}

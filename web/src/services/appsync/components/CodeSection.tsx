import { useEffect, useRef } from "react";
import type { Control, FieldValues, Path } from "react-hook-form";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { FormValueEditor } from "@shared/components/ValueEditor.tsx";
import { RUNTIMES, isUntouched, type ResolverCode } from "@localconsole/core/appsync";
import { SHORT_EDITOR_HEIGHT_PX } from "@shared/constants.ts";

const EDITOR_HEIGHT_PX = 320;

interface Props<TValues extends FieldValues> {
  control: Control<TValues, unknown, FieldValues>;
  runtime: string;
  names: { code: Path<TValues>; request: Path<TValues>; response: Path<TValues> };
}

// Khối Code của trang resolver / function: JS một editor, VTL hai template
export function CodeSection<TValues extends FieldValues>({
  control,
  runtime,
  names,
}: Props<TValues>) {
  return (
    <Container
      header={
        <Header
          variant='h2'
          description='Floci checks the code only when a query runs: run one in Queries after saving.'
        >
          Code
        </Header>
      }
    >
      {runtime === RUNTIMES.js ? (
        <FormValueEditor
          control={control}
          name={names.code}
          label='Resolver code'
          language='javascript'
          height={EDITOR_HEIGHT_PX}
        />
      ) : (
        <SpaceBetween size='l'>
          <FormValueEditor
            control={control}
            name={names.request}
            label='Request mapping template'
            language='velocity'
            height={SHORT_EDITOR_HEIGHT_PX}
          />
          <FormValueEditor
            control={control}
            name={names.response}
            label='Response mapping template - optional'
            language='velocity'
            height={SHORT_EDITOR_HEIGHT_PX}
          />
        </SpaceBetween>
      )}
    </Container>
  );
}

// Đổi data source / runtime / loại resolver: code còn là mẫu cũ hoặc trống thì thay bằng mẫu mới
export function useCodeTemplate(
  template: ResolverCode,
  read: () => ResolverCode,
  set: (name: keyof ResolverCode, value: string) => void,
) {
  const last = useRef(template);
  const handlers = useRef({ read, set });
  handlers.current = { read, set };

  useEffect(() => {
    if (last.current === template) return;
    if (isUntouched(handlers.current.read(), last.current)) {
      handlers.current.set("code", template.code ?? "");
      handlers.current.set("request", template.request ?? "");
      handlers.current.set("response", template.response ?? "");
    }
    last.current = template;
  }, [template]);
}

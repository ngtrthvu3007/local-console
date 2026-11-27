import { useMutation, useQueries } from "@tanstack/react-query";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import type { EventSourceMappingConfiguration } from "@aws-sdk/client-lambda";
import { pluralize } from "@localconsole/core/shared";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { functionNameOfArn } from "@localconsole/core/lambda";
import { functionExistsQuery } from "../hooks/useFunctions.ts";
import { useLambdaService } from "../hooks/useLambdaService.ts";

interface Props {
  mappings: readonly EventSourceMappingConfiguration[];
  onRemoved: () => unknown;
}

// Floci không dọn trigger của function đã xóa, tạo lại cùng tên là trigger sống lại: dọn từ phía nguồn
export function BrokenTriggersAlert({ mappings, onRemoved }: Props) {
  const lambda = useLambdaService();
  const nameOf = (mapping: EventSourceMappingConfiguration) =>
    functionNameOfArn(mapping.FunctionArn ?? "");
  // Nhiều trigger cùng function chỉ hỏi một lần: useQueries cảnh báo khi key trùng
  const names = [...new Set(mappings.map(nameOf))];
  const exists = useQueries({ queries: names.map((name) => functionExistsQuery(lambda, name)) });
  const missing = new Set(names.filter((_name, index) => exists[index].data === false));
  const broken = mappings.filter((mapping) => missing.has(nameOf(mapping)));

  const remove = useMutation({
    mutationFn: () => Promise.all(broken.map((mapping) => lambda.deleteMapping(mapping.UUID))),
    onSuccess: onRemoved,
  });

  if (!broken.length) return null;

  return (
    <Alert
      type='warning'
      header='Some functions no longer exist'
      action={
        <Button
          loading={remove.isPending}
          onClick={() =>
            remove.mutate(
              undefined,
              notifyOutcome({
                success: `Removed ${pluralize(broken.length, "broken trigger")}`,
                errorHeader: "Couldn't remove triggers",
              }),
            )
          }
        >
          Remove broken triggers
        </Button>
      }
    >
      These triggers point at deleted functions and come back to life if a function with the same
      name is created again.
    </Alert>
  );
}

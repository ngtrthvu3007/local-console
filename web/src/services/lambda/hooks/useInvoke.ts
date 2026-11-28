import { useMutation } from "@tanstack/react-query";
import type { InvokeInput } from "@localconsole/core/lambda";
import { useLambdaService } from "./useLambdaService.ts";

export function useInvoke(functionName: string, logGroupName: string) {
  const lambda = useLambdaService();

  return useMutation({
    mutationFn: (input: Omit<InvokeInput, "functionName" | "logGroupName">) =>
      lambda.invoke({ ...input, functionName, logGroupName }),
  });
}

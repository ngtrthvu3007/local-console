import { useQuery } from "@tanstack/react-query";
import { functionQueryKey } from "./useFunctions.ts";
import { useLambdaService } from "./useLambdaService.ts";

// Tải và giải nén gói code đang chạy. Key theo CodeSha256: code đổi thì tải lại, không thì dùng cache
export function useCodePackage(name: string, location?: string, codeSha256?: string) {
  const lambda = useLambdaService();

  return useQuery({
    queryKey: [...functionQueryKey(name, "code"), codeSha256],
    enabled: Boolean(location),
    staleTime: Infinity,
    queryFn: () => lambda.getCodePackage(location!),
  });
}

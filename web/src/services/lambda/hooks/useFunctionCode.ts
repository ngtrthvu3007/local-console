import { useQuery } from "@tanstack/react-query";
import { codeDownloadUrl } from "../helpers.ts";
import { unzipPackage } from "../zipArchive.ts";
import { functionQueryKey } from "./useFunctions.ts";

// Tải và giải nén gói code đang chạy. Key theo CodeSha256: code đổi thì tải lại, không thì dùng cache
export function useCodePackage(name: string, location?: string, codeSha256?: string) {
  return useQuery({
    queryKey: [...functionQueryKey(name, "code"), codeSha256],
    enabled: Boolean(location),
    staleTime: Infinity,
    queryFn: async () => {
      const response = await fetch(codeDownloadUrl(location!));
      if (!response.ok) throw new Error(`Couldn't download the code (HTTP ${response.status})`);
      return unzipPackage(new Uint8Array(await response.arrayBuffer()));
    },
  });
}

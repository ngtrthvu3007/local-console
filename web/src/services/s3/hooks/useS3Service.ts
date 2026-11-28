import { useMemo } from "react";
import { createS3Service } from "@localconsole/core/s3";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useS3 } from "./useS3.ts";

export function useS3Service() {
  const { s3, signer } = useS3();
  const { region } = useLoadedConfig();

  return useMemo(() => createS3Service(s3, { signer, region }), [s3, signer, region]);
}

import { useMemo } from "react";
import { createIntegrationsService } from "@localconsole/core/integrations";
import { useLambdaService } from "../../lambda/hooks/useLambdaService.ts";
import { useS3Service } from "../../s3/hooks/useS3Service.ts";
import { useSesService } from "../../ses/hooks/useSesService.ts";

export function useIntegrationsService() {
  const lambda = useLambdaService();
  const s3 = useS3Service();
  const ses = useSesService();

  return useMemo(() => createIntegrationsService({ lambda, s3, ses }), [lambda, s3, ses]);
}

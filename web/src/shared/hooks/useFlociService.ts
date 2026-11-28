import { useMemo } from "react";
import { createFlociService } from "@localconsole/core/shared";
import { proxyEndpoint } from "../aws.ts";

export const useFlociService = () => useMemo(() => createFlociService(proxyEndpoint()), []);

import { useMemo } from "react";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { cloudFormationClient } from "../stacks.ts";

export function useCloudFormation() {
  const { region } = useLoadedConfig();
  return useMemo(() => cloudFormationClient(region), [region]);
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSesService } from "./useSesService.ts";

const templatesQueryKey = ["ses", "templates"];

export function useTemplates() {
  const ses = useSesService();

  return useQuery({ queryKey: templatesQueryKey, queryFn: ses.listTemplates });
}

export function useTemplate(name?: string) {
  const ses = useSesService();

  return useQuery({
    queryKey: [...templatesQueryKey, name],
    queryFn: () => ses.getTemplate(name!),
    enabled: !!name,
    retry: false,
  });
}

export function useDeleteTemplates() {
  const ses = useSesService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (names: string[]) => ses.deleteTemplates(names),
    // exact: không đọc lại chi tiết template vừa xóa (404)
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templatesQueryKey, exact: true }),
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DeleteEmailTemplateCommand,
  GetEmailTemplateCommand,
  paginateListEmailTemplates,
  type EmailTemplateMetadata,
} from "@aws-sdk/client-sesv2";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import { useSES } from "./useSES.ts";

const templatesQueryKey = ["ses", "templates"];

export function useTemplates() {
  const client = useSES();

  return useQuery({
    queryKey: templatesQueryKey,
    queryFn: async () => {
      const templates: EmailTemplateMetadata[] = [];

      for await (const page of paginateListEmailTemplates({ client }, {})) {
        templates.push(...(page.TemplatesMetadata ?? []));
      }

      return templates;
    },
  });
}

export function useTemplate(name?: string) {
  const client = useSES();

  return useQuery({
    queryKey: [...templatesQueryKey, name],
    queryFn: async () => {
      const response = await client.send(new GetEmailTemplateCommand({ TemplateName: name }));
      return response.TemplateContent ?? {};
    },
    enabled: !!name,
    retry: false,
  });
}

export function useDeleteTemplates() {
  const client = useSES();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (names: string[]) => {
      const failures: string[] = [];

      for (const name of names) {
        try {
          await client.send(new DeleteEmailTemplateCommand({ TemplateName: name }));
        } catch (error) {
          failures.push(`${name}: ${errorMessage(error)}`);
        }
      }

      return { count: names.length - failures.length, failures };
    },
    // exact: chỉ đọc lại danh sách, không đọc lại chi tiết template vừa xóa (404)
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templatesQueryKey, exact: true }),
  });
}

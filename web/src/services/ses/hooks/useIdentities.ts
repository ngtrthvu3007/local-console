import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetEmailIdentityCommand,
  paginateListEmailIdentities,
  PutEmailIdentityConfigurationSetAttributesCommand,
  type IdentityInfo,
} from "@aws-sdk/client-sesv2";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import { useSES } from "./useSES.ts";

export const identitiesQueryKey = ["ses", "identities"];

export function useIdentities() {
  const client = useSES();
  return useQuery({
    queryKey: identitiesQueryKey,
    queryFn: async () => {
      const identities: IdentityInfo[] = [];
      for await (const page of paginateListEmailIdentities({ client }, {})) {
        identities.push(...(page.EmailIdentities ?? []));
      }
      return identities;
    },
  });
}

export function useCreateEmailIdentity() {
  const client = useSES();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      await client.send(new CreateEmailIdentityCommand({ EmailIdentity: email }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: identitiesQueryKey }),
  });
}

export function useDeleteIdentities() {
  const client = useSES();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (names: string[]) => {
      const failures: string[] = [];
      for (const name of names) {
        try {
          await client.send(new DeleteEmailIdentityCommand({ EmailIdentity: name }));
        } catch (error) {
          failures.push(`${name}: ${errorMessage(error)}`);
        }
      }
      return { count: names.length - failures.length, failures };
    },
    // exact: chỉ đọc lại danh sách, không đọc lại GetEmailIdentity của identity vừa xóa (404)
    onSuccess: () => queryClient.invalidateQueries({ queryKey: identitiesQueryKey, exact: true }),
  });
}

const identityKey = (name: string) => [...identitiesQueryKey, name];

// Configuration set mặc định của từng identity (GetEmailIdentity), dùng chung cho cột ở Identities
// và cột "Used by" ở Configuration sets
export function useIdentityConfigurationSets() {
  const client = useSES();
  const identities = useIdentities();
  const names = (identities.data ?? []).flatMap((identity) => identity.IdentityName ?? []);
  const results = useQueries({
    queries: names.map((name) => ({
      queryKey: identityKey(name),
      // Chuỗi rỗng = chưa có set mặc định (react-query không nhận kết quả undefined)
      queryFn: async () =>
        (await client.send(new GetEmailIdentityCommand({ EmailIdentity: name })))
          .ConfigurationSetName ?? "",
      retry: false,
    })),
  });
  return new Map<string, string | undefined>(
    names.map((name, index) => [name, results[index].data]),
  );
}

export function useSetIdentityConfigurationSet() {
  const client = useSES();
  const queryClient = useQueryClient();
  return useMutation({
    // Không có ConfigurationSetName = gỡ configuration set mặc định
    mutationFn: ({ identity, configurationSet }: { identity: string; configurationSet?: string }) =>
      client.send(
        new PutEmailIdentityConfigurationSetAttributesCommand({
          EmailIdentity: identity,
          ConfigurationSetName: configurationSet,
        }),
      ),
    onSuccess: (_result, { identity }) =>
      queryClient.invalidateQueries({ queryKey: identityKey(identity) }),
  });
}

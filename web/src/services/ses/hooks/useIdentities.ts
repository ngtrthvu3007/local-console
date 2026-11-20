import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  paginateListEmailIdentities,
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: identitiesQueryKey }),
  });
}

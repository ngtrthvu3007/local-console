import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSesService } from "./useSesService.ts";

const identitiesQueryKey = ["ses", "identities"];

export function useIdentities() {
  const ses = useSesService();

  return useQuery({ queryKey: identitiesQueryKey, queryFn: ses.listIdentities });
}

export function useCreateEmailIdentity() {
  const ses = useSesService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (email: string) => ses.createIdentity(email),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: identitiesQueryKey }),
  });
}

export function useDeleteIdentities() {
  const ses = useSesService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (names: string[]) => ses.deleteIdentities(names),
    // exact: không đọc lại GetEmailIdentity của identity vừa xóa (404)
    onSuccess: () => queryClient.invalidateQueries({ queryKey: identitiesQueryKey, exact: true }),
  });
}

const identityKey = (name: string) => [...identitiesQueryKey, name];

// Dùng chung cho cột ở Identities và cột "Used by" ở Configuration sets
export function useIdentityConfigurationSets() {
  const ses = useSesService();
  const identities = useIdentities();
  const names = (identities.data ?? []).flatMap((identity) => identity.IdentityName ?? []);

  const results = useQueries({
    queries: names.map((name) => ({
      queryKey: identityKey(name),
      queryFn: () => ses.getIdentityConfigurationSet(name),
      retry: false,
    })),
  });

  return new Map<string, string | undefined>(
    names.map((name, index) => [name, results[index].data]),
  );
}

export function useSetIdentityConfigurationSet() {
  const ses = useSesService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ses.setIdentityConfigurationSet,
    onSuccess: (_result, { identity }) =>
      queryClient.invalidateQueries({ queryKey: identityKey(identity) }),
  });
}

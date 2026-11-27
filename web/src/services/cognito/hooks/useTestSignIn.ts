import { useMutation, useQueryClient } from "@tanstack/react-query";
import { COGNITO_QUERY_ROOT, useCognitoService } from "./useCognitoService.ts";

export function useSignIn() {
  const cognito = useCognitoService();

  return useMutation({ mutationFn: cognito.signIn });
}

export function useRespondNewPassword() {
  const cognito = useCognitoService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cognito.respondNewPassword,
    // User vừa đổi từ FORCE_CHANGE_PASSWORD sang CONFIRMED: làm mới danh sách / chi tiết user đang mở
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [COGNITO_QUERY_ROOT] }),
  });
}

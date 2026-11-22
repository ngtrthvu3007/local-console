import { useForm } from "react-hook-form";
import type { UserPoolClientType } from "@aws-sdk/client-cognito-identity-provider";
import Box from "@cloudscape-design/components/box";
import { FormSelect } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { hostedUiUrl } from "../auth.ts";
import { COGNITO_PROVIDER, HOSTED_UI_PATHS } from "../constants.ts";

const NEW_TAB_TARGET = "_blank";
const NEW_TAB_FEATURES = "noopener";

const toOption = (value: string) => ({ value, label: value });

// Chỉ mount khi mở; ClientDetail đã khóa nút khi thiếu domain / callback / code flow
export function OpenHostedUiModal({ client, onDismiss }: { client: UserPoolClientType; onDismiss: () => void }) {
  const { flociPublicUrl } = useLoadedConfig();
  const providers = client.SupportedIdentityProviders ?? [];
  const callbackUrls = client.CallbackURLs ?? [];
  // Select luôn có giá trị hợp lệ nên không cần schema
  const form = useForm({ defaultValues: { provider: providers[0] ?? "", callbackUrl: callbackUrls[0] ?? "" } });

  const open = form.handleSubmit(({ provider, callbackUrl }) => {
    window.open(
      hostedUiUrl({
        baseUrl: flociPublicUrl,
        clientId: client.ClientId ?? "",
        redirectUri: callbackUrl,
        scopes: client.AllowedOAuthScopes ?? [],
        state: crypto.randomUUID(),
        // Cognito form: không gửi identity_provider, Floci hiện form đăng nhập của pool
        identityProvider: provider === COGNITO_PROVIDER ? undefined : provider,
      }),
      NEW_TAB_TARGET,
      NEW_TAB_FEATURES,
    );
    onDismiss();
  });

  return (
    <FormModal header='Open hosted UI' actionText='Open hosted UI' onSubmit={open} onDismiss={onDismiss}>
      <Box>
        After sign-in, Floci redirects to your callback with <code>?code=</code>. Exchange it at{" "}
        <code>{HOSTED_UI_PATHS.token}</code>.
      </Box>
      <FormSelect
        control={form.control}
        name='provider'
        label='Identity provider'
        options={providers.map((value) => (value === COGNITO_PROVIDER ? { value, label: "Cognito form" } : toOption(value)))}
      />
      <FormSelect control={form.control} name='callbackUrl' label='Callback URL' options={callbackUrls.map(toOption)} />
    </FormModal>
  );
}

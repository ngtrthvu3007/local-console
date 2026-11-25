import { useWatch } from "react-hook-form";
import type { GraphqlApi } from "@aws-sdk/client-appsync";
import SpaceBetween from "@cloudscape-design/components/space-between";
import {
  FormMultiselect,
  FormRadioGroup,
  FormSelect,
} from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useUserPools } from "../../cognito/hooks/usePools.ts";
import { authTypesOf, managedPoolOf, withAuthorization } from "../apis.ts";
import { AUTH_LABELS, AUTH_TYPES } from "../constants.ts";
import { useUpdateApi } from "../hooks/useApis.ts";
import { authorizationSchema } from "../schemas.ts";

const AUTH_OPTIONS = Object.values(AUTH_TYPES).map((value) => ({
  value,
  label: AUTH_LABELS[value],
}));

// Chỉ mount khi mở; chỉ mở được khi auth mặc định là một trong ba kiểu console sửa được
export function AuthorizationModal({ api, onDismiss }: { api: GraphqlApi; onDismiss: () => void }) {
  const { region } = useLoadedConfig();
  const update = useUpdateApi();
  const pools = useUserPools();
  // Modal chỉ mở khi auth mặc định sửa được, nên phần tử đầu luôn là auth mặc định
  const [defaultType = AUTH_TYPES.apiKey, ...enabled] = authTypesOf(api);
  const form = useZodForm(authorizationSchema, {
    defaultType,
    additional: enabled,
    userPoolId: managedPoolOf(api) ?? "",
  });
  const [chosenDefault, additional] = useWatch({
    control: form.control,
    name: ["defaultType", "additional"],
  });
  const usesCognito = [chosenDefault, ...additional].includes(AUTH_TYPES.cognito);

  const submit = form.handleSubmit((values) =>
    update.mutate(
      withAuthorization(api, {
        ...values,
        additional: values.additional.filter((type) => type !== values.defaultType),
        region,
      }),
      notifyOutcome({
        success: `Saved authorization of ${api.name}`,
        errorHeader: "Couldn't save authorization",
        then: onDismiss,
      }),
    ),
  );

  return (
    <FormModal
      header='Edit authorization'
      actionText='Save'
      loading={update.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <SpaceBetween size='m'>
        <FormRadioGroup
          control={form.control}
          name='defaultType'
          label='Default authorization'
          items={AUTH_OPTIONS}
        />
        <FormMultiselect
          control={form.control}
          name='additional'
          label='Additional authorization - optional'
          placeholder='Choose types'
          options={AUTH_OPTIONS.filter(({ value }) => value !== chosenDefault)}
        />
        {usesCognito && (
          <FormSelect
            control={form.control}
            name='userPoolId'
            label='User pool'
            placeholder='Choose a user pool'
            options={(pools.data ?? []).flatMap(({ Id, Name }) =>
              Id ? [{ value: Id, label: Name ?? Id, description: Id }] : [],
            )}
          />
        )}
      </SpaceBetween>
    </FormModal>
  );
}

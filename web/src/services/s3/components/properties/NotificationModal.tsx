import { useWatch } from "react-hook-form";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import type { RadioGroupProps } from "@cloudscape-design/components/radio-group";
import {
  FormAutosuggest,
  FormInput,
  FormMultiselect,
  FormRadioGroup,
} from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { FLOCI_ACCOUNT_ID } from "@shared/constants.ts";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { useFunctions } from "../../../lambda/hooks/useFunctions.ts";
import {
  DEFAULT_NOTIFICATION_EVENTS,
  NOTIFICATION_DESTINATIONS,
  NOTIFICATION_EVENT_TYPES,
  type NotificationDestination,
} from "../../constants.ts";
import type { NotificationRule } from "../../notificationRules.ts";
import { notificationSchema } from "../../schemas.ts";

const EVENT_OPTIONS = NOTIFICATION_EVENT_TYPES.map((event) => ({ value: event, label: event }));

const DESTINATION_ITEMS: RadioGroupProps.RadioButtonDefinition[] = Object.entries(
  NOTIFICATION_DESTINATIONS,
).map(([value, destination]) => ({ value, label: destination.label }));

const INITIAL_VALUES = {
  id: "",
  events: DEFAULT_NOTIFICATION_EVENTS,
  prefix: "",
  suffix: "",
  destination: "lambda" as NotificationDestination,
  arn: "",
};

const exampleArn = (destination: NotificationDestination, region: string) =>
  `arn:aws:${destination}:${region}:${FLOCI_ACCOUNT_ID}:${NOTIFICATION_DESTINATIONS[destination].arnExample}`;

interface Props {
  existingIds: string[];
  saving: boolean;
  onSave: (rule: NotificationRule) => void;
  onDismiss: () => void;
}

// Chỉ mount khi mở
export function NotificationModal({ existingIds, saving, onSave, onDismiss }: Props) {
  const { region } = useLoadedConfig();
  const form = useZodForm(notificationSchema(existingIds), INITIAL_VALUES);
  const destination = useWatch({ control: form.control, name: "destination" });
  const functions = useFunctions();
  const functionOptions = (functions.data ?? []).map((item) => ({
    value: item.FunctionArn!,
    label: item.FunctionName,
    description: item.FunctionArn,
  }));

  const submit = form.handleSubmit((values) => onSave(values));
  const destinationLabel = NOTIFICATION_DESTINATIONS[destination].label;

  return (
    <FormModal
      size='large'
      header='Create event notification'
      actionText='Save'
      loading={saving}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      <FormInput
        control={form.control}
        name='id'
        label='Name'
        description='Optional.'
        placeholder='on-image-upload'
      />
      <FormMultiselect
        control={form.control}
        name='events'
        label='Event types'
        options={EVENT_OPTIONS}
      />
      <ColumnLayout columns={2}>
        <FormInput
          control={form.control}
          name='prefix'
          label='Prefix'
          description='Optional, e.g. uploads/'
        />
        <FormInput
          control={form.control}
          name='suffix'
          label='Suffix'
          description='Optional, e.g. .png'
        />
      </ColumnLayout>
      <FormRadioGroup
        control={form.control}
        name='destination'
        label='Destination'
        items={DESTINATION_ITEMS}
      />
      {/* Lambda có gợi ý chọn function, vẫn gõ ARN tay được; SQS/SNS chưa có service nên nhập ARN */}
      {destination === "lambda" ? (
        <FormAutosuggest
          control={form.control}
          name='arn'
          label={`${destinationLabel} ARN`}
          placeholder={exampleArn(destination, region)}
          options={functionOptions}
          enteredTextLabel={(value) => `Use: ${value}`}
        />
      ) : (
        <FormInput
          control={form.control}
          name='arn'
          label={`${destinationLabel} ARN`}
          placeholder={exampleArn(destination, region)}
        />
      )}
    </FormModal>
  );
}

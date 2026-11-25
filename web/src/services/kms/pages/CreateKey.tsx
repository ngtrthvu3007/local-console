import { useEffect, useMemo, useRef } from "react";
import { useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import {
  FormInput,
  FormRadioGroup,
  FormSelect,
  FormTiles,
} from "@shared/components/form/FormFields.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import {
  KEY_TYPES,
  KEY_USAGE_LABELS,
  KEY_USAGES,
  SYMMETRIC_SPEC,
  type KeyType,
  type KeyUsage,
} from "../constants.ts";
import { useAllAliases } from "../hooks/useAliases.ts";
import { useCreateKey } from "../hooks/useKeys.ts";
import { kmsBaseCrumbs, kmsRoutes } from "../routes.ts";
import { createKeySchema, specsFor, type CreateKeyForm } from "../schemas.ts";

const TYPE_ITEMS = Object.entries(KEY_TYPES).map(([value, { label, description }]) => ({
  value,
  label,
  description,
}));

// Key bất đối xứng: chọn ký hoặc mã hóa
const ASYMMETRIC_USAGE_ITEMS = [KEY_USAGES.sign, KEY_USAGES.encrypt].map((value) => ({
  value,
  label: KEY_USAGE_LABELS[value],
}));

// Cách dùng cố định theo loại key (bất đối xứng mặc định là ký)
const USAGE_OF_TYPE: Record<KeyType, KeyUsage> = {
  symmetric: KEY_USAGES.encrypt,
  asymmetric: KEY_USAGES.sign,
  hmac: KEY_USAGES.mac,
};

const INITIAL_VALUES: CreateKeyForm = {
  type: "symmetric",
  usage: KEY_USAGES.encrypt,
  spec: SYMMETRIC_SPEC,
  alias: "",
  description: "",
};

export function CreateKey() {
  useBreadcrumbs([...kmsBaseCrumbs, { text: "Create key", href: kmsRoutes.createKey }]);
  const follow = useFollow();
  const navigate = useNavigate();
  const createKey = useCreateKey();
  // Alias của mọi key để chặn trùng
  const allAliases = useAllAliases().data;
  const existing = useMemo(
    () => (allAliases ?? []).flatMap(({ AliasName }) => (AliasName ? [AliasName] : [])),
    [allAliases],
  );
  const form = useZodForm(createKeySchema(existing), INITIAL_VALUES);
  const type = useWatch({ control: form.control, name: "type" });
  const usage = useWatch({ control: form.control, name: "usage" });
  const spec = useWatch({ control: form.control, name: "spec" });
  const specs = specsFor(type, usage);
  // form kiểm tra bất đồng bộ nên isPending bật chậm: ref chặn bấm đúp (như Launch instance của EC2)
  const submitting = useRef(false);

  // Đổi loại key thì đặt lại cách dùng mặc định của loại đó
  useEffect(() => {
    form.setValue("usage", USAGE_OF_TYPE[type]);
  }, [type, form]);

  // KeySpec cũ không hợp với loại / cách dùng mới thì chọn cái đầu tiên
  useEffect(() => {
    if (!specs.includes(spec)) form.setValue("spec", specs[0]);
  }, [specs, spec, form]);

  const submit = form.handleSubmit((values) =>
    createKey.mutate(
      values,
      notifyOutcome({
        success: ({ keyId, aliasError }) =>
          aliasError
            ? `Created key ${keyId}, but couldn't set ${values.alias}: ${aliasError}`
            : `Created key ${values.alias || keyId}`,
        errorHeader: "Couldn't create key",
        then: ({ keyId }) => navigate(kmsRoutes.key(keyId)),
      }),
    ),
  );

  const submitOnce = async () => {
    if (submitting.current) return;
    submitting.current = true;

    try {
      await submit();
    } finally {
      submitting.current = false;
    }
  };

  const actions = (
    <ResponsiveActions footer>
      <Button variant='link' href={kmsRoutes.keys} onFollow={follow}>
        Cancel
      </Button>
      <Button variant='primary' formAction='submit' loading={createKey.isPending}>
        Create key
      </Button>
    </ResponsiveActions>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitOnce();
      }}
    >
      <Form header={<Header variant='h1'>Create key</Header>} actions={actions}>
        <Container header={<Header variant='h2'>Key configuration</Header>}>
          <SpaceBetween size='l'>
            <FormTiles control={form.control} name='type' label='Key type' items={TYPE_ITEMS} />
            {type === "asymmetric" && (
              <FormRadioGroup
                control={form.control}
                name='usage'
                label='Key usage'
                items={ASYMMETRIC_USAGE_ITEMS}
              />
            )}
            <FormSelect
              control={form.control}
              name='spec'
              label='Key spec'
              options={specs.map((value) => ({ value, label: value }))}
            />
            <FormInput
              control={form.control}
              name='alias'
              label='Alias - optional'
              placeholder='alias/orders'
              constraintText='alias/ is added when missing.'
            />
            <FormInput control={form.control} name='description' label='Description - optional' />
          </SpaceBetween>
        </Container>
      </Form>
    </form>
  );
}

import { useState } from "react";
import type { UserPoolType } from "@aws-sdk/client-cognito-identity-provider";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import { CONFIRM_DELETE, ConfirmModal } from "@shared/components/ConfirmModal.tsx";
import { FormInput } from "@shared/components/form/FormFields.tsx";
import { FormModal } from "@shared/components/form/FormModal.tsx";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { errorMessage, notifyOutcome, notifySuccess } from "@shared/hooks/useNotify.ts";
import { useZodForm } from "@shared/hooks/useZodForm.ts";
import { HOSTED_UI_PATHS } from "../constants.ts";
import { useCreateDomain, useDeleteDomain } from "../hooks/usePools.ts";
import { domainSchema, type DomainForm } from "../schemas.ts";

const INITIAL_VALUES: DomainForm = { prefix: "" };

// Chỉ mount khi mở
function CreateDomainModal({ poolId, onDismiss }: { poolId: string; onDismiss: () => void }) {
  const createDomain = useCreateDomain(poolId);
  const form = useZodForm(domainSchema, INITIAL_VALUES);

  const submit = form.handleSubmit(({ prefix }) =>
    createDomain.mutate(prefix, {
      onSuccess: () => {
        notifySuccess(`Created domain ${prefix}`);
        onDismiss();
      },
    }),
  );

  return (
    <FormModal
      header='Create domain'
      actionText='Create'
      loading={createDomain.isPending}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      {createDomain.isError && <Alert type='error'>{errorMessage(createDomain.error)}</Alert>}
      <FormInput control={form.control} name='prefix' label='Domain prefix' autoFocus />
    </FormModal>
  );
}

export function DomainBlock({ pool, poolId }: { pool: UserPoolType; poolId: string }) {
  const { flociPublicUrl } = useLoadedConfig();
  const deleteDomain = useDeleteDomain(poolId);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const domain = pool.Domain;

  return (
    <Container
      header={
        <Header
          variant='h2'
          description={`Floci serves the hosted UI at ${flociPublicUrl}${HOSTED_UI_PATHS.all}; the domain name only needs to exist.`}
          actions={
            domain ? (
              <Button onClick={() => setDeleting(true)}>Delete domain</Button>
            ) : (
              <Button onClick={() => setCreating(true)}>Create domain</Button>
            )
          }
        >
          Domain
        </Header>
      }
    >
      {domain ?? <Box color='text-body-secondary'>No domain</Box>}
      {creating && <CreateDomainModal poolId={poolId} onDismiss={() => setCreating(false)} />}
      {domain && deleting && (
        <ConfirmModal
          visible
          header='Delete domain?'
          confirmText={CONFIRM_DELETE}
          actionText='Delete'
          loading={deleteDomain.isPending}
          onDismiss={() => setDeleting(false)}
          onConfirm={() =>
            deleteDomain.mutate(
              domain,
              notifyOutcome({
                success: `Deleted domain ${domain}`,
                errorHeader: `Couldn't delete domain ${domain}`,
                then: () => setDeleting(false),
              }),
            )
          }
        >
          {domain}
        </ConfirmModal>
      )}
    </Container>
  );
}

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { DescribeSecretResponse } from "@aws-sdk/client-secrets-manager";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { ActionBar, refreshAction } from "@shared/components/ActionBar.tsx";
import { ConnectCard } from "@shared/components/CodeSamples.tsx";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { isNotFoundError } from "@shared/aws.ts";
import { pageState } from "@shared/components/PageState.tsx";
import { NOT_AVAILABLE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { secretSample } from "../codeSamples.ts";
import { DeleteSecretModal } from "../components/DeleteSecretModal.tsx";
import { EditDescriptionModal } from "../components/EditDescriptionModal.tsx";
import { RotationSection } from "../components/RotationSection.tsx";
import { SecretValue } from "../components/SecretValue.tsx";
import { useSecret } from "../hooks/useSecrets.ts";
import { KeyLink } from "../../kms/components/KeyLink.tsx";
import { defaultKeyLabel } from "../../kms/keys.ts";
import { SCHEDULED_FOR_DELETION, SECRETS_KEY_SERVICE } from "../constants.ts";
import { SEARCH_PARAMS, secretCrumbs, secretsRoutes } from "../routes.ts";

const MODALS = { description: "description", delete: "delete" } as const;
type ModalId = (typeof MODALS)[keyof typeof MODALS];

interface ViewProps {
  name: string;
  secret: DescribeSecretResponse;
  query: ReturnType<typeof useSecret>;
}

function SecretView({ name, secret, query }: ViewProps) {
  const { ref, compact } = useIsCompact();
  const navigate = useNavigate();
  const [modal, setModal] = useState<ModalId | null>(null);
  const closeModal = () => setModal(null);
  const arn = secret.ARN ?? "";

  const header = (
    <Header
      variant='h1'
      description={<StackLink type='AWS::SecretsManager::Secret' physicalId={arn} />}
      actions={
        <ActionBar
          compact={compact}
          actions={[
            refreshAction(query),
            { id: MODALS.delete, text: "Delete", onClick: () => setModal(MODALS.delete) },
          ]}
        />
      }
    >
      {name}
    </Header>
  );

  const detailsHeader = (
    <Header
      variant='h2'
      actions={<Button onClick={() => setModal(MODALS.description)}>Edit description</Button>}
    >
      Secret details
    </Header>
  );

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <SpaceBetween size='l'>
          <Container header={detailsHeader}>
            <KeyValuePairs
              columns={3}
              items={[
                { label: "ARN", value: <CopyButton variant='inline' text={arn} label={arn} /> },
                { label: "Description", value: secret.Description || NOT_AVAILABLE },
                { label: "Last changed", value: formatDate(secret.LastChangedDate) },
                {
                  label: "KMS key",
                  value: secret.KmsKeyId ? (
                    <KeyLink value={secret.KmsKeyId} />
                  ) : (
                    defaultKeyLabel(SECRETS_KEY_SERVICE)
                  ),
                },
              ]}
            />
          </Container>
          <SecretValue name={name} />
          <RotationSection name={name} secret={secret} />
          <ConnectCard sample={secretSample(name)} />
        </SpaceBetween>
        {modal === MODALS.description && (
          <EditDescriptionModal
            name={name}
            description={secret.Description ?? ""}
            onDismiss={closeModal}
          />
        )}
        {modal === MODALS.delete && (
          <DeleteSecretModal
            name={name}
            onDismiss={closeModal}
            onDone={() => navigate(secretsRoutes.secrets)}
          />
        )}
      </ContentLayout>
    </div>
  );
}

export function SecretDetail() {
  const [searchParams] = useSearchParams();
  const name = searchParams.get(SEARCH_PARAMS.name) ?? "";
  const details = useSecret(name);

  useBreadcrumbs(secretCrumbs(name));

  const state = pageState(details, {
    ready: Boolean(details.data),
    // Secret chờ xóa vẫn trả về nhưng không đọc / sửa được nữa: coi như không có
    notFound: isNotFoundError(details.error) || Boolean(details.data?.DeletedDate),
    description: details.data?.DeletedDate ? SCHEDULED_FOR_DELETION : undefined,
    title: `Secret ${name} not found`,
    backHref: secretsRoutes.secrets,
    backText: "View secrets",
  });
  if (state || !details.data) return state;

  return <SecretView name={name} secret={details.data} query={details} />;
}

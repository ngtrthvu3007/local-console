import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Parameter } from "@aws-sdk/client-ssm";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { ActionBar, refreshAction, type BarAction } from "@shared/components/ActionBar.tsx";
import { ConnectCard } from "@shared/components/CodeSamples.tsx";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { DETAIL_SEPARATOR, NOT_AVAILABLE } from "@shared/constants.ts";
import { formatDate } from "@shared/format.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { useIsCompact } from "@shared/hooks/useIsCompact.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { parameterSample } from "../codeSamples.ts";
import { KeyLink } from "../../kms/components/KeyLink.tsx";
import { defaultKeyLabel } from "../../kms/keys.ts";
import { SECURE_STRING, SSM_KEY_SERVICE } from "../constants.ts";
import { DeleteParametersModal } from "../components/DeleteParametersModal.tsx";
import { ParameterValue } from "../components/ParameterValue.tsx";
import { isParameterMissing, useParameter } from "../hooks/useParameters.ts";
import { SEARCH_PARAMS, parameterCrumbs, ssmRoutes } from "../routes.ts";

interface ViewProps {
  name: string;
  parameter: Parameter;
  description: string;
  keyId: string;
  query: ReturnType<typeof useParameter>;
}

function ParameterView({ name, parameter, description, keyId, query }: ViewProps) {
  const navigate = useNavigate();
  const { ref, compact } = useIsCompact();
  const [deleting, setDeleting] = useState(false);
  const arn = parameter.ARN ?? "";

  const barActions: BarAction[] = [
    refreshAction(query),
    { id: "delete", text: "Delete", onClick: () => setDeleting(true) },
    { id: "edit", text: "Edit", primary: true, href: ssmRoutes.editParameter(name) },
  ];

  const header = (
    <Header
      variant='h1'
      description={<StackLink type='AWS::SSM::Parameter' physicalId={name} />}
      actions={<ActionBar compact={compact} actions={barActions} />}
    >
      {name}
    </Header>
  );

  return (
    <div ref={ref}>
      <ContentLayout header={header}>
        <SpaceBetween size='l'>
          <Container header={<Header variant='h2'>Parameter details</Header>}>
            <KeyValuePairs
              columns={2}
              items={[
                { label: "Type", value: parameter.Type },
                {
                  label: "Version",
                  value: [parameter.Version, formatDate(parameter.LastModifiedDate)].join(
                    DETAIL_SEPARATOR,
                  ),
                },
                {
                  label: "Value",
                  value: <ParameterValue type={parameter.Type} value={parameter.Value ?? ""} />,
                },
                { label: "Description", value: description || NOT_AVAILABLE },
                { label: "ARN", value: <CopyButton variant='inline' text={arn} label={arn} /> },
                ...(parameter.Type === SECURE_STRING
                  ? [
                      {
                        label: "KMS key",
                        value: keyId ? <KeyLink value={keyId} /> : defaultKeyLabel(SSM_KEY_SERVICE),
                      },
                    ]
                  : []),
              ]}
            />
          </Container>
          <ConnectCard sample={parameterSample(name, parameter.Type)} />
        </SpaceBetween>
      </ContentLayout>
      {deleting && (
        <DeleteParametersModal
          names={[name]}
          onDismiss={() => setDeleting(false)}
          onDone={() => navigate(ssmRoutes.parameters)}
        />
      )}
    </div>
  );
}

export function ParameterDetail() {
  const [searchParams] = useSearchParams();
  const name = searchParams.get(SEARCH_PARAMS.name) ?? "";
  const details = useParameter(name);

  useBreadcrumbs(parameterCrumbs(name));

  const state = pageState(details, {
    ready: Boolean(details.data),
    notFound: details.isError && isParameterMissing(details.error),
    title: `Parameter ${name} not found`,
    backHref: ssmRoutes.parameters,
    backText: "View parameters",
  });
  if (state || !details.data) return state;

  return <ParameterView name={name} {...details.data} query={details} />;
}

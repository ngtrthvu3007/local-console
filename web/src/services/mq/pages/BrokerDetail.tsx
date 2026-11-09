import { useCallback, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { isNotFoundError } from "@shared/aws.ts";
import { NotFound } from "@shared/components/NotFound.tsx";
import { ErrorState } from "@shared/components/TableStates.tsx";
import { DETAIL_SEPARATOR } from "@shared/constants.ts";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { notifyOutcome } from "@shared/hooks/useNotify.ts";
import { DeleteBrokersModal } from "../components/DeleteBrokersModal.tsx";
import { DetailsTab } from "../components/DetailsTab.tsx";
import { ExchangesTab } from "../components/ExchangesTab.tsx";
import { QueuesTab } from "../components/QueuesTab.tsx";
import { SignIn } from "../components/SignIn.tsx";
import { BROKER_RUNNING, ENGINE_LABEL } from "../constants.ts";
import { useBrokerAuthorization } from "../credentials.ts";
import { useBroker, useRebootBroker } from "../hooks/useBrokers.ts";
import { BROKER_TABS, SEARCH_PARAMS, brokerCrumbs, mqRoutes, type BrokerTab } from "../routes.ts";

const isBrokerTab = (value: string | null): value is BrokerTab =>
  Object.values<string | null>(BROKER_TABS).includes(value);

const WRONG_CREDENTIALS = "Wrong username or password.";

export function BrokerDetail() {
  const { broker: brokerId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get(SEARCH_PARAMS.tab);
  const tab = isBrokerTab(requestedTab) ? requestedTab : BROKER_TABS.queues;
  const details = useBroker(brokerId);
  const reboot = useRebootBroker(brokerId);
  const [authorization, setAuthorization] = useBrokerAuthorization(brokerId);
  const [signInError, setSignInError] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const broker = details.data;
  const name = broker?.BrokerName ?? brokerId;

  useBreadcrumbs(brokerCrumbs(brokerId, name));

  // Sai user/pass: bỏ thông tin đã lưu, quay lại form đăng nhập kèm lỗi
  const signOutWithError = useCallback(() => {
    setAuthorization(undefined);
    setSignInError(WRONG_CREDENTIALS);
  }, [setAuthorization]);

  const selectTab = (nextTab: string) =>
    setSearchParams(nextTab === BROKER_TABS.queues ? {} : { [SEARCH_PARAMS.tab]: nextTab });

  if (details.isLoading) return <Spinner size='large' />;
  if (details.isError && isNotFoundError(details.error)) {
    return (
      <NotFound
        title={`Broker ${brokerId} not found`}
        description='It may have been deleted, or the ID is wrong.'
        backHref={mqRoutes.brokers}
        backText='View brokers'
      />
    );
  }
  if (!broker) {
    return (
      <Container>
        <ErrorState error={details.error} onRetry={() => details.refetch()} />
      </Container>
    );
  }

  const running = broker.BrokerState === BROKER_RUNNING;
  const signIn = (
    <SignIn
      brokerName={name}
      error={signInError}
      onSignIn={(value) => {
        setSignInError(undefined);
        setAuthorization(value);
      }}
    />
  );
  // Queue và exchange chỉ xem được khi broker chạy và đã đăng nhập
  const rabbitContent = (content: (authorization: string) => ReactNode) => {
    if (!running) {
      return (
        <Container>
          <Box textAlign='center' padding={{ vertical: "s" }}>
            <StatusIndicator type='in-progress'>Broker is {broker.BrokerState}</StatusIndicator>
          </Box>
        </Container>
      );
    }
    return authorization ? content(authorization) : signIn;
  };

  const tabs: TabsProps.Tab[] = [
    {
      id: BROKER_TABS.queues,
      label: "Queues",
      content: rabbitContent((value) => (
        <QueuesTab broker={brokerId} authorization={value} onUnauthorized={signOutWithError} />
      )),
    },
    {
      id: BROKER_TABS.exchanges,
      label: "Exchanges",
      content: rabbitContent((value) => (
        <ExchangesTab broker={brokerId} authorization={value} onUnauthorized={signOutWithError} />
      )),
    },
    { id: BROKER_TABS.details, label: "Details", content: <DetailsTab broker={broker} /> },
  ];

  const rebootBroker = () =>
    reboot.mutate(
      undefined,
      notifyOutcome({ success: `Rebooting ${name}`, errorHeader: `Couldn't reboot ${name}` }),
    );

  const headerActions = (
    <SpaceBetween direction='horizontal' size='xs'>
      {authorization && <Button onClick={() => setAuthorization(undefined)}>Sign out</Button>}
      <Button loading={reboot.isPending} disabled={!running} onClick={rebootBroker}>
        Reboot
      </Button>
      <Button onClick={() => setDeleting(true)}>Delete</Button>
    </SpaceBetween>
  );

  // Trạng thái chỉ hiện khi khác RUNNING
  const description = [
    `${ENGINE_LABEL} ${broker.EngineVersion ?? ""}`.trim(),
    running ? undefined : broker.BrokerState,
  ]
    .filter(Boolean)
    .join(DETAIL_SEPARATOR);

  return (
    <ContentLayout
      header={
        <Header variant='h1' description={description} actions={headerActions}>
          {name}
        </Header>
      }
    >
      <Tabs
        activeTabId={tab}
        tabs={tabs}
        onChange={({ detail }) => selectTab(detail.activeTabId)}
      />
      {deleting && (
        <DeleteBrokersModal
          brokers={[{ id: brokerId, name }]}
          onDismiss={() => setDeleting(false)}
          onDone={() => navigate(mqRoutes.brokers)}
        />
      )}
    </ContentLayout>
  );
}

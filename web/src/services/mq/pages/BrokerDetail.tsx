import { pageState } from "@shared/components/PageState.tsx";
import { ResponsiveActions } from "@shared/components/ResponsiveActions.tsx";
import { useCallback, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { ConfirmModal } from "@shared/components/ConfirmModal.tsx";
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
  const [username, setUsername] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const [rebooting, setRebooting] = useState(false);
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

  const state = pageState(details, {
    ready: Boolean(broker),
    title: `Broker ${brokerId} not found`,
    description: "It may have been deleted, or the ID is wrong.",
    backHref: mqRoutes.brokers,
    backText: "View brokers",
  });
  if (state || !broker) return state;

  const running = broker.BrokerState === BROKER_RUNNING;
  const signIn = (
    <SignIn
      brokerName={name}
      error={signInError}
      username={username}
      onSignIn={(value, user) => {
        setSignInError(undefined);
        setUsername(user);
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
      notifyOutcome({
        success: `Rebooting ${name}`,
        errorHeader: `Couldn't reboot ${name}`,
        then: () => setRebooting(false),
      }),
    );

  const headerActions = (
    <ResponsiveActions>
      {authorization && <Button onClick={() => setAuthorization(undefined)}>Sign out</Button>}
      <Button disabled={!running} onClick={() => setRebooting(true)}>
        Reboot
      </Button>
      <Button onClick={() => setDeleting(true)}>Delete</Button>
    </ResponsiveActions>
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
      <ConfirmModal
        visible={rebooting}
        header={`Reboot ${name}?`}
        actionText='Reboot'
        loading={reboot.isPending}
        onConfirm={rebootBroker}
        onDismiss={() => setRebooting(false)}
      >
        Apps connected to the broker are disconnected while it restarts.
      </ConfirmModal>
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

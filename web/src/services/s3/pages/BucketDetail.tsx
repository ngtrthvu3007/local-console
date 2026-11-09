import { useParams, useSearchParams } from "react-router";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Spinner from "@cloudscape-design/components/spinner";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { NotFound } from "@shared/components/NotFound.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { ObjectsTab } from "../components/ObjectsTab.tsx";
import { PermissionsTab } from "../components/PermissionsTab.tsx";
import { PropertiesTab } from "../components/PropertiesTab.tsx";
import { s3Uri } from "../helpers.ts";
import { useBucketExists } from "../hooks/useBuckets.ts";
import { BUCKET_TABS, SEARCH_PARAMS, bucketCrumbs, s3Routes, type BucketTab } from "../routes.ts";

const isBucketTab = (value: string | null): value is BucketTab =>
  Object.values<string | null>(BUCKET_TABS).includes(value);

export function BucketDetail() {
  const { bucket = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get(SEARCH_PARAMS.tab);
  const tab = isBucketTab(requestedTab) ? requestedTab : BUCKET_TABS.objects;
  const prefix = searchParams.get(SEARCH_PARAMS.prefix) ?? "";
  const exists = useBucketExists(bucket);

  useBreadcrumbs(bucketCrumbs(bucket, prefix));

  const openFolder = (nextPrefix: string) =>
    setSearchParams(nextPrefix ? { [SEARCH_PARAMS.prefix]: nextPrefix } : {});
  const selectTab = (nextTab: string) =>
    setSearchParams(nextTab === BUCKET_TABS.objects ? {} : { [SEARCH_PARAMS.tab]: nextTab });

  if (exists.isLoading) return <Spinner size='large' />;
  if (exists.data === false) {
    return (
      <NotFound
        title={`Bucket ${bucket} not found`}
        description='It may have been deleted, or the name is wrong.'
        backHref={s3Routes.buckets}
        backText='View buckets'
      />
    );
  }

  const uri = s3Uri(bucket, prefix);

  const tabs: TabsProps.Tab[] = [
    {
      id: BUCKET_TABS.objects,
      label: "Objects",
      content: <ObjectsTab bucket={bucket} prefix={prefix} onOpenFolder={openFolder} />,
    },
    { id: BUCKET_TABS.properties, label: "Properties", content: <PropertiesTab bucket={bucket} /> },
    {
      id: BUCKET_TABS.permissions,
      label: "Permissions",
      content: <PermissionsTab bucket={bucket} />,
    },
  ];

  const header = (
    <Header variant='h1' description={uri} actions={<CopyButton label='Copy S3 URI' text={uri} />}>
      {bucket}
    </Header>
  );

  return (
    <ContentLayout header={header}>
      <Tabs
        activeTabId={tab}
        tabs={tabs}
        onChange={({ detail }) => selectTab(detail.activeTabId)}
      />
    </ContentLayout>
  );
}

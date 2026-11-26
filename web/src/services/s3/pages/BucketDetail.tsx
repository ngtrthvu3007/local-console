import { useParams, useSearchParams } from "react-router";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { useTabParam } from "@shared/hooks/useTabParam.ts";
import { CopyButton } from "@shared/components/CopyButton.tsx";
import { pageState } from "@shared/components/PageState.tsx";
import { useBreadcrumbs } from "@shared/hooks/useBreadcrumbs.ts";
import { StackLink } from "@shared/StackLink.tsx";
import { ObjectsTab } from "../components/ObjectsTab.tsx";
import { PermissionsTab } from "../components/PermissionsTab.tsx";
import { PropertiesTab } from "../components/PropertiesTab.tsx";
import { s3Uri } from "../helpers.ts";
import { useBucketExists } from "../hooks/useBuckets.ts";
import { BUCKET_TABS, SEARCH_PARAMS, bucketCrumbs, s3Routes } from "../routes.ts";

export function BucketDetail() {
  const { bucket = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useTabParam(BUCKET_TABS, BUCKET_TABS.objects);
  const prefix = searchParams.get(SEARCH_PARAMS.prefix) ?? "";
  const exists = useBucketExists(bucket);

  useBreadcrumbs(bucketCrumbs(bucket, prefix));

  const openFolder = (nextPrefix: string) =>
    setSearchParams(nextPrefix ? { [SEARCH_PARAMS.prefix]: nextPrefix } : {});
  const state = pageState(exists, {
    ready: exists.data === true,
    notFound: exists.data === false,
    title: `Bucket ${bucket} not found`,
    backHref: s3Routes.buckets,
    backText: "View buckets",
  });
  if (state) return state;

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
    <Header
      variant='h1'
      description={
        <>
          {uri}
          <StackLink separated type='AWS::S3::Bucket' physicalId={bucket} />
        </>
      }
      actions={<CopyButton label='Copy S3 URI' text={uri} />}
    >
      {bucket}
    </Header>
  );

  return (
    <ContentLayout header={header}>
      <Tabs activeTabId={tab} tabs={tabs} onChange={({ detail }) => setTab(detail.activeTabId)} />
    </ContentLayout>
  );
}

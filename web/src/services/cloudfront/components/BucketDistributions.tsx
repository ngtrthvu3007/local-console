import type { DistributionSummary } from "@aws-sdk/client-cloudfront";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Table from "@shared/components/ResponsiveTable.tsx";
import { EmptyState, emptyOrError } from "@shared/components/TableStates.tsx";
import { useFollow } from "@shared/hooks/useFollow.ts";
import { distributionsServing, cloudfrontRoutes } from "@localconsole/core/cloudfront";
import { useDistributions } from "../hooks/useDistributions.ts";
import { DistributionStatus } from "./DistributionStatus.tsx";
import { LocalUrlLink } from "./LocalUrlLink.tsx";

// Khối ở tab Properties của bucket: distribution nào phục vụ bucket này (spec 3.7)
export function BucketDistributions({ bucket }: { bucket: string }) {
  const follow = useFollow();
  const distributions = useDistributions();
  const serving = distributionsServing(distributions.data ?? [], bucket);

  return (
    <Table
      variant='container'
      items={serving}
      trackBy='Id'
      loading={distributions.isLoading}
      loadingText='Loading distributions'
      wrapLines
      header={
        <Header
          counter={`(${serving.length})`}
          description='Distributions that serve this bucket at a local URL.'
          actions={
            <Button href={cloudfrontRoutes.createDistribution(bucket)} onFollow={follow}>
              Create distribution
            </Button>
          }
        >
          CloudFront distributions
        </Header>
      }
      columnDefinitions={[
        {
          id: "id",
          header: "ID",
          isRowHeader: true,
          cell: (summary: DistributionSummary) => (
            <Link href={cloudfrontRoutes.distribution(summary.Id ?? "")} onFollow={follow}>
              {summary.Id}
            </Link>
          ),
        },
        {
          id: "url",
          header: "Local URL",
          cell: (summary) => <LocalUrlLink id={summary.Id ?? ""} />,
        },
        {
          id: "status",
          header: "Status",
          cell: (summary) => <DistributionStatus enabled={summary.Enabled} />,
        },
      ]}
      empty={emptyOrError(distributions, <EmptyState title='No distributions serve this bucket' />)}
    />
  );
}

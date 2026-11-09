import SpaceBetween from "@cloudscape-design/components/space-between";
import { BucketTagsSection } from "./properties/BucketTagsSection.tsx";
import { LifecycleSection } from "./properties/LifecycleSection.tsx";
import { MultipartUploadsSection } from "./properties/MultipartUploadsSection.tsx";
import { NotificationsSection } from "./properties/NotificationsSection.tsx";
import { OverviewSection } from "./properties/OverviewSection.tsx";
import { VersioningSection } from "./properties/VersioningSection.tsx";

export function PropertiesTab({ bucket }: { bucket: string }) {
  return (
    <SpaceBetween size='l'>
      <OverviewSection bucket={bucket} />
      <VersioningSection bucket={bucket} />
      <BucketTagsSection bucket={bucket} />
      <NotificationsSection bucket={bucket} />
      <LifecycleSection bucket={bucket} />
      <MultipartUploadsSection bucket={bucket} />
    </SpaceBetween>
  );
}

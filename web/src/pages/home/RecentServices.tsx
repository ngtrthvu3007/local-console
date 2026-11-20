import Box from "@cloudscape-design/components/box";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import { servicePath } from "../../registry.ts";
import { ServiceIcon } from "@shared/components/ServiceIcon.tsx";
import { SEARCH_SHORTCUT_KEY } from "@shared/constants.ts";
import { useFollow } from "@shared/hooks/useFollow.ts";
import {
  RECENT_SERVICES_TITLE as TITLE,
  useRecentServices,
} from "@shared/recentServices.ts";

const RECENT_COLUMNS = 2;

// Như widget "Recently visited" của AWS Console Home; danh sách đủ service nằm
// ở sidebar và ô search
export function RecentServices() {
  const recent = useRecentServices();
  const follow = useFollow();
  return (
    <Container header={<Header variant='h2'>{TITLE}</Header>}>
      {recent.length === 0 ? (
        <Box textAlign='center' color='text-status-inactive'>
          <b>No recently visited services</b>
          <Box variant='p' color='inherit'>
            Open a service from the menu, or press {SEARCH_SHORTCUT_KEY} to
            search.
          </Box>
        </Box>
      ) : (
        <ColumnLayout columns={RECENT_COLUMNS}>
          {recent.map((service) => (
            <div key={service.id} className='console-service'>
              <ServiceIcon service={service} />
              <Link href={servicePath(service)} onFollow={follow}>
                {service.fullName}
              </Link>
            </div>
          ))}
        </ColumnLayout>
      )}
    </Container>
  );
}

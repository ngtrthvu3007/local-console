import type { ReactNode } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { DEV_SERVER_START_COMMAND, FLOCI_START_COMMAND } from "../constants.ts";
import { TerminalBlock } from "./TerminalBlock.tsx";

interface Props {
  title: string;
  description: string;
  command: string;
  notes: ReactNode[];
  checking: boolean;
  onCheck: () => void;
}

// Trang thay cho nội dung khi console không chạy được: một lệnh để chạy lại,
// kiểm tra lại bằng tay. Console vẫn tự kiểm tra định kỳ nên trang tự trở lại
// khi Floci / server lên
function Unavailable({
  title,
  description,
  command,
  notes,
  checking,
  onCheck,
}: Props) {
  return (
    <ContentLayout
      header={
        <Header variant='h1' description={description}>
          {title}
        </Header>
      }
    >
      <Container>
        <SpaceBetween size='s'>
          <TerminalBlock code={command} prompt />
          <Box variant='small' color='text-body-secondary'>
            <ul className='console-unavailable__notes'>
              {notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          </Box>
          <Button loading={checking} onClick={onCheck}>
            Check again
          </Button>
        </SpaceBetween>
      </Container>
    </ContentLayout>
  );
}

export function FlociDown({
  endpoint,
  checking,
  onCheck,
}: {
  endpoint?: string;
  checking: boolean;
  onCheck: () => void;
}) {
  return (
    <Unavailable
      title="Floci isn't running"
      description={`The console can't reach Floci${endpoint ? ` at ${endpoint}` : ""}. Start it from the folder with the console's docker-compose.yml:`}
      command={FLOCI_START_COMMAND}
      notes={[
        "Docker Desktop (or Docker Engine) must be running.",
        "The first start downloads the Floci image (about 270 MB).",
        "This page comes back by itself once Floci answers.",
      ]}
      checking={checking}
      onCheck={onCheck}
    />
  );
}

export function ServerDown({
  checking,
  onCheck,
}: {
  checking: boolean;
  onCheck: () => void;
}) {
  return (
    <Unavailable
      title="Can't reach the console server"
      description='The page loads, but the console API (/api) does not answer. In development, start it in another terminal:'
      command={DEV_SERVER_START_COMMAND}
      notes={[
        "With docker compose, restart the console container instead: docker compose up -d console.",
        "This page comes back by itself once the server answers.",
      ]}
      checking={checking}
      onCheck={onCheck}
    />
  );
}

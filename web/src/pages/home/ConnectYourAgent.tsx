import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Tabs, { type TabsProps } from "@cloudscape-design/components/tabs";
import { MCP_PATH, MCP_SERVER_NAME } from "@shared/constants.ts";
import { TabCodeBlock } from "./ConnectYourApp.tsx";

const COPY_COMMAND_LABEL = "Copy command";
const COPY_CONFIG_LABEL = "Copy configuration";
const JSON_INDENT = 2;

export function ConnectYourAgent() {
  // Theo origin trang đang mở: user đổi cổng console vẫn chép đúng URL
  const url = `${window.location.origin}${MCP_PATH}`;

  const tabs: TabsProps.Tab[] = [
    {
      id: "claude-code",
      label: "Claude Code",
      content: (
        <TabCodeBlock
          code={`claude mcp add --transport http ${MCP_SERVER_NAME} ${url}`}
          copyLabel={COPY_COMMAND_LABEL}
          note='Run once. Works for the CLI and the VS Code / JetBrains extensions.'
        />
      ),
    },
    {
      id: "codex",
      label: "Codex",
      content: (
        <TabCodeBlock
          code={`[mcp_servers.${MCP_SERVER_NAME}]\nurl = "${url}"`}
          copyLabel={COPY_CONFIG_LABEL}
          note='Add to ~/.codex/config.toml.'
        />
      ),
    },
    {
      id: "others",
      label: "Cursor and others",
      content: (
        <TabCodeBlock
          code={JSON.stringify(
            { mcpServers: { [MCP_SERVER_NAME]: { url } } },
            undefined,
            JSON_INDENT,
          )}
          copyLabel={COPY_CONFIG_LABEL}
          note='Cursor: ~/.cursor/mcp.json. Copilot, Cline, Continue…: add an HTTP MCP server with this URL.'
        />
      ),
    },
  ];

  const header = (
    <Header
      variant='h2'
      description='Let your AI agent create, read and delete resources here. Add ?services=sqs,ses to the URL for fewer tools, or ?read_only=true to only read. Upload and download files in the console.'
    >
      Connect your AI agent
    </Header>
  );

  return (
    <Container fitHeight header={header}>
      <Tabs disableContentPaddings tabs={tabs} />
    </Container>
  );
}

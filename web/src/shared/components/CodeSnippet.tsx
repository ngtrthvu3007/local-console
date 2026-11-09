import type { ReactNode } from "react";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { LOADING_PLACEHOLDER } from "../constants.ts";
import { CopyButton } from "./CopyButton.tsx";

const scrollable = { overflowX: "auto" } as const;

// Khối code có nút Copy; dòng dài cuộn trong khung, trang không cuộn ngang
export function CodeSnippet({ code, note }: { code?: string; note?: ReactNode }) {
  return (
    <SpaceBetween size='s'>
      <div style={scrollable}>
        <Box variant='pre' padding='s'>
          {code ?? LOADING_PLACEHOLDER}
        </Box>
      </div>
      <SpaceBetween direction='horizontal' size='s' alignItems='center'>
        <CopyButton text={code} />
        {note && <Box color='text-body-secondary'>{note}</Box>}
      </SpaceBetween>
    </SpaceBetween>
  );
}

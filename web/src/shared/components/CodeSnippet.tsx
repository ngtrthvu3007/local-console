import { ResponsiveActions } from "./ResponsiveActions.tsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { LOADING_PLACEHOLDER } from "../constants.ts";
import { CopyButton } from "./CopyButton.tsx";
import "./CodeSnippet.css";

const scrollable = { overflowX: "auto" } as const;

// Khối code có nút Copy; dòng dài cuộn trong khung, trang không cuộn ngang
export function CodeSnippet({
  code,
  note,
  wrap = false,
}: {
  code?: string;
  note?: ReactNode;
  wrap?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [code, wrap]);
  return (
    <SpaceBetween size='s'>
      <div
        ref={frame}
        style={scrollable}
        className={wrap ? "code-snippet code-snippet--wrap" : "code-snippet"}
        role={overflowing ? "region" : undefined}
        aria-label={overflowing ? "Code snippet, scroll horizontally to read" : undefined}
        tabIndex={overflowing ? 0 : undefined}
      >
        <Box variant='pre' padding='s'>
          {code ?? LOADING_PLACEHOLDER}
        </Box>
      </div>
      {overflowing && (
        <div className='code-snippet__scroll-hint'>
          <Box color='text-body-secondary'>Scroll horizontally to read the full lines.</Box>
        </div>
      )}
      <ResponsiveActions>
        <CopyButton text={code} />
        {note && <Box color='text-body-secondary'>{note}</Box>}
      </ResponsiveActions>
    </SpaceBetween>
  );
}

import { CopyButton } from "./CopyButton.tsx";

const COPY_COMMAND_LABEL = "Copy command";

// Dấu $ chỉ để nhìn, nút copy không chép nó
export function TerminalBlock({
  code,
  copyLabel = COPY_COMMAND_LABEL,
  prompt = false,
}: {
  code: string;
  copyLabel?: string;
  prompt?: boolean;
}) {
  return (
    <div className='console-command'>
      <code>
        {prompt && (
          <span className='console-command__prompt' aria-hidden>
            $
          </span>
        )}
        <span>{code}</span>
      </code>
      <CopyButton variant='icon' text={code} label={copyLabel} />
    </div>
  );
}

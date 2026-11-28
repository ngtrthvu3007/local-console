import { useState } from "react";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { BreakableText } from "@shared/components/BreakableText.tsx";
import { SECURE_STRING } from "../constants.ts";

const MASK = "••••••••";

// Floci trả SecureString dạng rõ (spec 7 #7): console tự che như AWS
export function ParameterValue({ type, value }: { type?: string; value: string }) {
  const [shown, setShown] = useState(false);

  if (type !== SECURE_STRING) return <BreakableText text={value} />;

  return (
    <SpaceBetween direction='horizontal' size='xs' alignItems='center'>
      {shown ? <BreakableText text={value} /> : MASK}
      <Button variant='inline-link' onClick={() => setShown(!shown)}>
        {shown ? "Hide" : "Show"}
      </Button>
    </SpaceBetween>
  );
}

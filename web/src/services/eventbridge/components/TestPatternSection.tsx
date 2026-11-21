import { useEffect, useState } from "react";
import Button from "@cloudscape-design/components/button";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import FormField from "@cloudscape-design/components/form-field";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { ValueEditor } from "@shared/components/ValueEditor.tsx";
import { useLoadedConfig } from "@shared/hooks/useConfig.ts";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import { jsonObjectError } from "@shared/json.ts";
import { DEFAULT_SAMPLE_EVENT, EDITOR_HEIGHT_PX } from "../constants.ts";
import { useTestPattern } from "../hooks/useRules.ts";
import { patternError, wrapSampleEvent } from "../pattern.ts";

// Thử pattern với một event mẫu trước khi lưu rule
export function TestPatternSection({ pattern }: { pattern: string }) {
  const { region } = useLoadedConfig();
  const test = useTestPattern();
  const [sample, setSample] = useState(DEFAULT_SAMPLE_EVENT);
  const [problem, setProblem] = useState<string>();

  // Kết quả cũ không còn đúng khi pattern hoặc event mẫu đã đổi
  const { reset } = test;
  useEffect(() => {
    reset();
    setProblem(undefined);
  }, [pattern, sample, reset]);

  const run = () => {
    const error =
      patternError(pattern) ?? jsonObjectError(sample, "A sample event is a JSON object.");
    setProblem(error);
    if (!error) test.mutate({ pattern, event: wrapSampleEvent(sample, region) });
  };

  return (
    <ExpandableSection headerText='Test pattern'>
      <SpaceBetween size='s'>
        <FormField
          label='Sample event'
          description='Write source, detail-type and detail. The other fields are filled in for you.'
          errorText={problem}
          stretch
        >
          <ValueEditor value={sample} onChange={setSample} height={EDITOR_HEIGHT_PX} />
        </FormField>
        <SpaceBetween size='s' direction='horizontal' alignItems='center'>
          <Button formAction='none' loading={test.isPending} onClick={run}>
            Test
          </Button>
          {test.isError && (
            <StatusIndicator type='error'>{errorMessage(test.error)}</StatusIndicator>
          )}
          {test.isSuccess && !problem && (
            <StatusIndicator type={test.data ? "success" : "stopped"}>
              {test.data ? "Match" : "No match"}
            </StatusIndicator>
          )}
        </SpaceBetween>
      </SpaceBetween>
    </ExpandableSection>
  );
}

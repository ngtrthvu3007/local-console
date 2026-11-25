import { useState, type ReactNode } from "react";
import type {
  EncryptionAlgorithmSpec,
  KeyMetadata,
  MacAlgorithmSpec,
  SigningAlgorithmSpec,
} from "@aws-sdk/client-kms";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Textarea from "@cloudscape-design/components/textarea";
import type { ZodType } from "zod";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { KeyValueEditor, type KeyValue } from "@shared/components/KeyValueEditor.tsx";
import { errorMessage } from "@shared/hooks/useNotify.ts";
import { KEY_USAGES, SYMMETRIC_SPEC } from "../constants.ts";
import {
  useDecrypt,
  useEncrypt,
  useGenerateDataKey,
  useGenerateMac,
  usePublicKey,
  useSign,
  useVerify,
  useVerifyMac,
} from "../hooks/useCrypto.ts";
import { ciphertextSchema, tryItInputSchema } from "../schemas.ts";

const TEXTAREA_ROWS = 3;
const NOTE =
  "Runs against this key in Floci. Nothing is saved: results go away when you leave the tab.";

interface RunState {
  isPending: boolean;
  isError: boolean;
  error: unknown;
}

// Khung một thao tác: tiêu đề, ô nhập, nút chạy, lỗi của Floci, kết quả
function Operation(props: {
  title: string;
  action: string;
  run: () => void;
  state: RunState;
  result?: ReactNode;
  children?: ReactNode;
}) {
  const { title, action, run, state, result, children } = props;

  return (
    <Container header={<Header variant='h2'>{title}</Header>}>
      <SpaceBetween size='m'>
        {children}
        <Button onClick={run} loading={state.isPending}>
          {action}
        </Button>
        {state.isError && <Alert type='error'>{errorMessage(state.error)}</Alert>}
        {result}
      </SpaceBetween>
    </Container>
  );
}

// Ô nhập chữ: plaintext / message kiểm giới hạn 4096 byte; ciphertext chỉ kiểm không trống
function useTextInput(schema: ZodType<string> = tryItInputSchema) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();

  const valid = () => {
    const parsed = schema.safeParse(value);
    setError(parsed.success ? undefined : parsed.error.issues[0]?.message);
    return parsed.success;
  };

  const field = (label: string) => (
    <FormField label={label} errorText={error} stretch>
      <Textarea
        value={value}
        rows={TEXTAREA_ROWS}
        onChange={({ detail }) => setValue(detail.value)}
      />
    </FormField>
  );

  return { value, valid, field };
}

function ContextField({
  items,
  onChange,
}: {
  items: KeyValue[];
  onChange: (items: KeyValue[]) => void;
}) {
  return (
    <FormField
      label='Encryption context - optional'
      description='Decrypt needs the same pairs as Encrypt.'
      stretch
    >
      <KeyValueEditor items={items} onChange={onChange} keyError={() => undefined} />
    </FormField>
  );
}

function AlgorithmField<T extends string>(props: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { options, value, onChange } = props;
  return (
    <FormField label='Algorithm'>
      <Select
        selectedOption={{ value, label: value }}
        options={options.map((option) => ({ value: option, label: option }))}
        onChange={({ detail }) =>
          onChange(options.find((option) => option === detail.selectedOption.value) ?? value)
        }
      />
    </FormField>
  );
}

const Result = ({ label, code }: { label: string; code: string }) => (
  <FormField label={label} stretch>
    <CodeSnippet code={code} wrap ariaLabel={label} />
  </FormField>
);

const Validity = ({ valid }: { valid: boolean }) =>
  valid ? (
    <StatusIndicator type='success'>Valid</StatusIndicator>
  ) : (
    <StatusIndicator type='error'>Invalid</StatusIndicator>
  );

function EncryptPanels({ meta }: { meta: KeyMetadata }) {
  const keyId = meta.KeyId ?? "";
  const symmetric = meta.KeySpec === SYMMETRIC_SPEC;
  const algorithms = meta.EncryptionAlgorithms ?? [];
  const [algorithm, setAlgorithm] = useState<EncryptionAlgorithmSpec | undefined>(
    symmetric ? undefined : algorithms[algorithms.length - 1],
  );
  const [encryptContext, setEncryptContext] = useState<KeyValue[]>([]);
  const [decryptContext, setDecryptContext] = useState<KeyValue[]>([]);
  const plaintext = useTextInput();
  const ciphertext = useTextInput(ciphertextSchema);
  const encrypt = useEncrypt(keyId, algorithm);
  const decrypt = useDecrypt(keyId, algorithm);
  const dataKey = useGenerateDataKey(keyId);

  return (
    <>
      {!symmetric && algorithm && (
        <Container>
          <AlgorithmField options={algorithms} value={algorithm} onChange={setAlgorithm} />
        </Container>
      )}
      <Operation
        title='Encrypt'
        action='Encrypt'
        state={encrypt}
        run={() =>
          plaintext.valid() && encrypt.mutate({ input: plaintext.value, context: encryptContext })
        }
        result={
          encrypt.data !== undefined && <Result label='Ciphertext (base64)' code={encrypt.data} />
        }
      >
        {plaintext.field("Plaintext")}
        {symmetric && <ContextField items={encryptContext} onChange={setEncryptContext} />}
      </Operation>
      <Operation
        title='Decrypt'
        action='Decrypt'
        state={decrypt}
        run={() =>
          ciphertext.valid() && decrypt.mutate({ input: ciphertext.value, context: decryptContext })
        }
        result={decrypt.data !== undefined && <Result label='Plaintext' code={decrypt.data} />}
      >
        {ciphertext.field("Ciphertext (base64)")}
        {symmetric && <ContextField items={decryptContext} onChange={setDecryptContext} />}
      </Operation>
      {symmetric && (
        <Operation
          title='Generate data key'
          action='Generate data key'
          state={dataKey}
          run={() => dataKey.mutate()}
          result={
            dataKey.data && (
              <>
                <Result label='Plaintext key (base64)' code={dataKey.data.plaintext} />
                <Result label='Encrypted key (base64)' code={dataKey.data.ciphertext} />
              </>
            )
          }
        />
      )}
    </>
  );
}

function SignPanels({ meta }: { meta: KeyMetadata }) {
  const keyId = meta.KeyId ?? "";
  const algorithms = meta.SigningAlgorithms ?? [];
  const [algorithm, setAlgorithm] = useState<SigningAlgorithmSpec | undefined>(algorithms[0]);
  const [signature, setSignature] = useState("");
  const signMessage = useTextInput();
  const verifyMessage = useTextInput();
  const sign = useSign(keyId);
  const verify = useVerify(keyId);
  const publicKey = usePublicKey(keyId);
  if (!algorithm) return null;

  return (
    <>
      <Container>
        <AlgorithmField options={algorithms} value={algorithm} onChange={setAlgorithm} />
      </Container>
      <Operation
        title='Sign'
        action='Sign'
        state={sign}
        run={() => signMessage.valid() && sign.mutate({ input: signMessage.value, algorithm })}
        result={sign.data !== undefined && <Result label='Signature (base64)' code={sign.data} />}
      >
        {signMessage.field("Message")}
      </Operation>
      <Operation
        title='Verify'
        action='Verify'
        state={verify}
        run={() =>
          verifyMessage.valid() &&
          verify.mutate({ input: verifyMessage.value, signature, algorithm })
        }
        result={verify.data !== undefined && <Validity valid={verify.data} />}
      >
        {verifyMessage.field("Message")}
        <FormField label='Signature (base64)' stretch>
          <Textarea
            value={signature}
            rows={TEXTAREA_ROWS}
            onChange={({ detail }) => setSignature(detail.value)}
          />
        </FormField>
      </Operation>
      <Container header={<Header variant='h2'>Public key</Header>}>
        {publicKey.isError ? (
          <Alert type='error'>{errorMessage(publicKey.error)}</Alert>
        ) : publicKey.data === undefined ? (
          <StatusIndicator type='loading'>Loading public key</StatusIndicator>
        ) : (
          <CodeSnippet code={publicKey.data} ariaLabel='Public key (PEM)' />
        )}
      </Container>
    </>
  );
}

function MacPanels({ meta }: { meta: KeyMetadata }) {
  const keyId = meta.KeyId ?? "";
  const algorithms = meta.MacAlgorithms ?? [];
  const [algorithm, setAlgorithm] = useState<MacAlgorithmSpec | undefined>(algorithms[0]);
  const [mac, setMac] = useState("");
  const generateMessage = useTextInput();
  const verifyMessage = useTextInput();
  const generate = useGenerateMac(keyId);
  const verify = useVerifyMac(keyId);
  if (!algorithm) return null;

  return (
    <>
      {algorithms.length > 1 && (
        <Container>
          <AlgorithmField options={algorithms} value={algorithm} onChange={setAlgorithm} />
        </Container>
      )}
      <Operation
        title='Generate MAC'
        action='Generate MAC'
        state={generate}
        run={() =>
          generateMessage.valid() && generate.mutate({ input: generateMessage.value, algorithm })
        }
        result={generate.data !== undefined && <Result label='MAC (base64)' code={generate.data} />}
      >
        {generateMessage.field("Message")}
      </Operation>
      <Operation
        title='Verify MAC'
        action='Verify MAC'
        state={verify}
        run={() =>
          verifyMessage.valid() && verify.mutate({ input: verifyMessage.value, mac, algorithm })
        }
        result={verify.data !== undefined && <Validity valid={verify.data} />}
      >
        {verifyMessage.field("Message")}
        <FormField label='MAC (base64)' stretch>
          <Textarea
            value={mac}
            rows={TEXTAREA_ROWS}
            onChange={({ detail }) => setMac(detail.value)}
          />
        </FormField>
      </Operation>
    </>
  );
}

// Như tab Test của Lambda: mỗi thao tác một khung, theo cách dùng của key
export function TryItTab({ meta }: { meta: KeyMetadata }) {
  return (
    <SpaceBetween size='l'>
      <Alert type='info'>{NOTE}</Alert>
      {meta.KeyUsage === KEY_USAGES.sign && <SignPanels meta={meta} />}
      {meta.KeyUsage === KEY_USAGES.mac && <MacPanels meta={meta} />}
      {meta.KeyUsage === KEY_USAGES.encrypt && <EncryptPanels meta={meta} />}
    </SpaceBetween>
  );
}

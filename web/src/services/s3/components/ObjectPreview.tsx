import { useEffect, useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Spinner from "@cloudscape-design/components/spinner";
import { CodeSnippet } from "@shared/components/CodeSnippet.tsx";
import { ErrorState } from "@shared/components/TableStates.tsx";
import { formatBytes, reformatJson } from "@localconsole/core/shared";
import {
  DOWNLOAD_URL_LIFETIME_SECONDS,
  IMAGE_PREVIEW_MAX_BYTES,
  TEXT_PREVIEW_MAX_BYTES,
  previewKind,
} from "@localconsole/core/s3";
import { useTextContent } from "../hooks/useObject.ts";
import { useS3Service } from "../hooks/useS3Service.ts";
import { downloadObject } from "../downloadObject.ts";

const PREVIEW_MAX_HEIGHT = "70vh";
const previewFrameStyle = { maxHeight: PREVIEW_MAX_HEIGHT, overflow: "auto" } as const;
const imageStyle = { maxWidth: "100%", maxHeight: PREVIEW_MAX_HEIGHT } as const;

interface Props {
  bucket: string;
  objectKey: string;
  contentType?: string;
  size?: number;
}

export function ObjectPreview({ bucket, objectKey, contentType, size }: Props) {
  const s3 = useS3Service();
  const kind = previewKind(objectKey, contentType, size);
  const isText = kind === "text" || kind === "json";
  const text = useTextContent(bucket, objectKey, isText);
  const [imageUrl, setImageUrl] = useState<string>();

  // <img> không đi qua SDK được nên tải thẳng từ Floci bằng pre-signed URL
  useEffect(() => {
    if (kind !== "image") return;
    s3.presign({
      bucket,
      key: objectKey,
      method: "GET",
      expiresIn: DOWNLOAD_URL_LIFETIME_SECONDS,
    }).then(setImageUrl);
  }, [kind, s3, bucket, objectKey]);

  if (kind === "none") {
    return (
      <Container>
        <Box textAlign='center' padding='l'>
          <Box variant='strong'>Preview not available</Box>
          <Box color='text-body-secondary'>
            Previews cover text up to {formatBytes(TEXT_PREVIEW_MAX_BYTES)} and images up to{" "}
            {formatBytes(IMAGE_PREVIEW_MAX_BYTES)}.
          </Box>
          <Box padding={{ top: "s" }}>
            <Button iconName='download' onClick={() => downloadObject(s3, bucket, objectKey)}>
              Download
            </Button>
          </Box>
        </Box>
      </Container>
    );
  }

  if (kind === "image") {
    const image = imageUrl ? (
      <img src={imageUrl} alt={objectKey} style={imageStyle} />
    ) : (
      <Spinner />
    );
    return <Container>{image}</Container>;
  }

  const textBody = text.data !== undefined && (
    <div style={previewFrameStyle}>
      <CodeSnippet
        code={kind === "json" ? reformatJson(text.data) : text.data}
        wrap={kind === "text"}
      />
    </div>
  );

  return (
    <Container>
      {text.isLoading && <Spinner />}
      {text.isError && <ErrorState error={text.error} onRetry={() => text.refetch()} />}
      {textBody}
    </Container>
  );
}

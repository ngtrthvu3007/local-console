import { useEffect, useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Spinner from "@cloudscape-design/components/spinner";
import { ErrorState } from "@shared/components/TableStates.tsx";
import { formatBytes } from "@shared/format.ts";
import { reformatJson } from "@shared/json.ts";
import {
  DOWNLOAD_URL_LIFETIME_SECONDS,
  IMAGE_PREVIEW_MAX_BYTES,
  TEXT_PREVIEW_MAX_BYTES,
} from "../constants.ts";
import { previewKind } from "../helpers.ts";
import { useTextContent } from "../hooks/useObject.ts";
import { useS3 } from "../hooks/useS3.ts";
import { downloadObject, presign } from "../presign.ts";

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
  const { signer } = useS3();
  const kind = previewKind(objectKey, contentType, size);
  const isText = kind === "text" || kind === "json";
  const text = useTextContent(bucket, objectKey, isText);
  const [imageUrl, setImageUrl] = useState<string>();

  // <img> không đi qua SDK được nên tải thẳng từ Floci bằng pre-signed URL
  useEffect(() => {
    if (kind !== "image") return;
    presign(signer, {
      bucket,
      key: objectKey,
      method: "GET",
      expiresIn: DOWNLOAD_URL_LIFETIME_SECONDS,
    }).then(setImageUrl);
  }, [kind, signer, bucket, objectKey]);

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
            <Button iconName='download' onClick={() => downloadObject(signer, bucket, objectKey)}>
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
      <Box variant='pre'>{kind === "json" ? reformatJson(text.data) : text.data}</Box>
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

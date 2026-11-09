import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CopyObjectCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectTaggingCommand,
  type DeleteMarkerEntry,
  type ObjectVersion,
} from "@aws-sdk/client-s3";
import type { Tag } from "@shared/components/TagsModal.tsx";
import { copySource, fromS3TagSet, toS3TagSet } from "../helpers.ts";
import { objectsQueryKey, useInvalidateObjects } from "./useObjects.ts";
import { useS3 } from "./useS3.ts";

// Nằm dưới key objects của bucket, nên làm mới cả bucket cũng làm mới chi tiết
const objectQueryKey = (bucket: string, key: string, part: string) => [
  ...objectsQueryKey(bucket),
  "object",
  key,
  part,
];

export function useHeadObject(bucket: string, key: string) {
  const { s3 } = useS3();
  return useQuery({
    queryKey: objectQueryKey(bucket, key, "head"),
    queryFn: () => s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
    retry: false,
  });
}

export function useTextContent(bucket: string, key: string, enabled: boolean) {
  const { s3 } = useS3();
  return useQuery({
    queryKey: objectQueryKey(bucket, key, "text"),
    enabled,
    queryFn: async () => {
      const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return response.Body!.transformToString();
    },
  });
}

export type VersionEntry = (ObjectVersion | DeleteMarkerEntry) & {
  isDeleteMarker: boolean;
  Size?: number;
};

const newestFirst = (left: VersionEntry, right: VersionEntry) =>
  (right.LastModified?.getTime() ?? 0) - (left.LastModified?.getTime() ?? 0);

export function useObjectHistory(bucket: string, key: string) {
  const { s3 } = useS3();
  return useQuery({
    queryKey: objectQueryKey(bucket, key, "versions"),
    queryFn: async (): Promise<VersionEntry[]> => {
      const page = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key }));
      const versions = (page.Versions ?? []).map((version) => ({
        ...version,
        isDeleteMarker: false,
      }));
      const markers = (page.DeleteMarkers ?? []).map((marker) => ({
        ...marker,
        isDeleteMarker: true,
      }));
      // Prefix khớp cả key dài hơn (notes.txt khớp notes.txt.bak)
      return [...versions, ...markers].filter((entry) => entry.Key === key).sort(newestFirst);
    },
  });
}

// enabled=false khi chưa biết object còn tồn tại (object đã xóa thì S3 trả 405)
export function useObjectTags(bucket: string, key: string, enabled = true) {
  const { s3 } = useS3();
  return useQuery({
    queryKey: objectQueryKey(bucket, key, "tags"),
    enabled,
    queryFn: async () => {
      const response = await s3.send(new GetObjectTaggingCommand({ Bucket: bucket, Key: key }));
      return fromS3TagSet(response.TagSet);
    },
  });
}

export function usePutObjectTags(bucket: string) {
  const { s3 } = useS3();
  const invalidate = useInvalidateObjects();
  return useMutation({
    mutationFn: ({ key, tags }: { key: string; tags: Tag[] }) =>
      s3.send(
        new PutObjectTaggingCommand({
          Bucket: bucket,
          Key: key,
          Tagging: { TagSet: toS3TagSet(tags) },
        }),
      ),
    onSuccess: () => invalidate(bucket),
  });
}

interface MetadataInput {
  key: string;
  contentType: string;
  metadata: Record<string, string>;
}

// S3 không sửa metadata tại chỗ: copy object lên chính nó với REPLACE
export function useEditMetadata(bucket: string) {
  const { s3 } = useS3();
  const invalidate = useInvalidateObjects();
  return useMutation({
    mutationFn: ({ key, contentType, metadata }: MetadataInput) =>
      s3.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: key,
          CopySource: copySource(bucket, key),
          MetadataDirective: "REPLACE",
          ContentType: contentType || undefined,
          Metadata: metadata,
        }),
      ),
    onSuccess: () => invalidate(bucket),
  });
}

// Đưa version cũ thành bản mới nhất
export function useRestoreVersion(bucket: string) {
  const { s3 } = useS3();
  const invalidate = useInvalidateObjects();
  return useMutation({
    mutationFn: ({ key, versionId }: { key: string; versionId: string }) =>
      s3.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: key,
          CopySource: copySource(bucket, key, versionId),
        }),
      ),
    onSuccess: () => invalidate(bucket),
  });
}

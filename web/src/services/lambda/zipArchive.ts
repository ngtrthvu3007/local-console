import { strToU8, unzipSync, zipSync } from "fflate";

// Đường dẫn file trong gói → nội dung
export type PackageFiles = Record<string, Uint8Array>;
// Đường dẫn file text → nội dung đã sửa
export type CodeEdits = Record<string, string>;

const DIRECTORY_SUFFIX = "/";
const NULL_CHARACTER = "\0";
const strictDecoder = new TextDecoder("utf-8", { fatal: true });

export const unzipPackage = (bytes: Uint8Array): PackageFiles =>
  unzipSync(bytes, { filter: (file) => !file.name.endsWith(DIRECTORY_SUFFIX) });

// File nhị phân không giải mã được UTF-8, hoặc có ký tự NUL
function decodeText(bytes: Uint8Array): string | undefined {
  try {
    const text = strictDecoder.decode(bytes);
    return text.includes(NULL_CHARACTER) ? undefined : text;
  } catch {
    return undefined;
  }
}

export const textFilesOf = (files: PackageFiles): Record<string, string> =>
  Object.fromEntries(
    Object.entries(files).flatMap(([path, bytes]) => {
      const text = decodeText(bytes);
      return text === undefined ? [] : [[path, text]];
    }),
  );

// Nén lại toàn bộ gói: file đã sửa thay bản cũ, file nhị phân giữ nguyên
export function zipPackage(files: PackageFiles, edits: CodeEdits = {}): Uint8Array {
  const editedFiles = Object.fromEntries(
    Object.entries(edits).map(([path, text]) => [path, strToU8(text)]),
  );
  return zipSync({ ...files, ...editedFiles });
}

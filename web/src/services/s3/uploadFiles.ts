export interface PickedFile {
  file: File;
  path: string; // đường dẫn tương đối, giữ cấu trúc folder khi kéo thả
}

const FOLDER_SEPARATOR = "/";

const readFile = (entry: FileSystemFileEntry) =>
  new Promise<File>((resolve, reject) => entry.file(resolve, reject));

const readDirectoryBatch = (reader: FileSystemDirectoryReader) =>
  new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));

// dataTransfer.files không chứa file trong folder kéo vào nên phải tự duyệt
export async function filesFromDrop(dataTransfer: DataTransfer): Promise<PickedFile[]> {
  const roots = [...dataTransfer.items]
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);
  const picked: PickedFile[] = [];

  async function walk(entry: FileSystemEntry, parentPath: string): Promise<void> {
    if (entry.isFile) {
      const file = await readFile(entry as FileSystemFileEntry);
      picked.push({ file, path: parentPath + file.name });
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const childPath = parentPath + entry.name + FOLDER_SEPARATOR;
    // readEntries trả từng đợt, đọc tới khi rỗng
    for (
      let batch = await readDirectoryBatch(reader);
      batch.length;
      batch = await readDirectoryBatch(reader)
    ) {
      for (const child of batch) await walk(child, childPath);
    }
  }

  for (const root of roots) await walk(root, "");
  return picked;
}

// File chọn qua input folder có webkitRelativePath, vd: "folder/sub/file.txt"
export const filesFromInput = (files: FileList | null): PickedFile[] =>
  [...(files ?? [])].map((file) => ({ file, path: file.webkitRelativePath || file.name }));

export const filesFromList = (files: File[]): PickedFile[] =>
  files.map((file) => ({ file, path: file.name }));

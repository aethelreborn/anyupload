export type PickedFile = {
  file: File;
  /** Path relative to the dropped folder root, or the plain file name. */
  path: string;
};

export function fromFileList(list: FileList | null | undefined): PickedFile[] {
  if (!list) return [];
  return Array.from(list).map((file) => {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    return { file, path: relative && relative.length > 0 ? relative : file.name };
  });
}

/**
 * Walks a drop, descending into directories so a dropped folder keeps its
 * structure. Uses the (deprecated but still universally supported)
 * `webkitGetAsEntry` API, which is the only way to read folder trees from a
 * drag-and-drop.
 */
export async function fromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<PickedFile[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  if (entries.length === 0) {
    return fromFileList(dataTransfer.files);
  }

  const picked: PickedFile[] = [];
  for (const entry of entries) {
    await walk(entry, "", picked);
  }
  return picked;
}

async function walk(
  entry: FileSystemEntry,
  prefix: string,
  out: PickedFile[],
): Promise<void> {
  if (entry.isFile) {
    const file = await readFile(entry as FileSystemFileEntry);
    if (file) out.push({ file, path: `${prefix}${entry.name}` });
    return;
  }

  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries only returns a batch at a time and signals the end with an
    // empty array, so it has to be called in a loop.
    for (;;) {
      const batch = await readEntries(reader);
      if (batch.length === 0) break;
      for (const child of batch) {
        await walk(child, `${prefix}${entry.name}/`, out);
      }
    }
  }
}

function readFile(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    try {
      entry.file(
        (file) => resolve(file),
        () => resolve(null),
      );
    } catch {
      resolve(null);
    }
  });
}

function readEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    try {
      reader.readEntries(
        (entries) => resolve(entries),
        () => resolve([]),
      );
    } catch {
      resolve([]);
    }
  });
}

/** Root folder name of a picked path, if the path came from a folder. */
export function rootFolder(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 1 ? parts[0] : null;
}

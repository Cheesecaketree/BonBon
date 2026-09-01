interface FileSystemEntryLike {
  isFile: boolean
  isDirectory: boolean
  file?: (success: (file: File) => void, error?: (reason: unknown) => void) => void
  createReader?: () => {
    readEntries: (success: (entries: FileSystemEntryLike[]) => void, error?: (reason: unknown) => void) => void
  }
}

async function readEntry(entry: FileSystemEntryLike): Promise<File[]> {
  if (entry.isFile && entry.file) {
    return new Promise((resolve, reject) => entry.file?.((file) => resolve([file]), reject))
  }
  if (!entry.isDirectory || !entry.createReader) return []

  const reader = entry.createReader()
  const entries: FileSystemEntryLike[] = []
  while (true) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (!batch.length) break
    entries.push(...batch)
  }
  return (await Promise.all(entries.map(readEntry))).flat()
}

export async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = [...dataTransfer.items]
  const entries = items.map((item) => {
    const withEntry = item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntryLike | null }
    return withEntry.webkitGetAsEntry?.() as unknown as FileSystemEntryLike | null | undefined
  }).filter((entry): entry is FileSystemEntryLike => entry !== null && entry !== undefined)

  if (entries.length) return (await Promise.all(entries.map(readEntry))).flat()
  return [...dataTransfer.files]
}

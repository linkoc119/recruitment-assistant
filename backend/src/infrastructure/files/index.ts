import { createHash, randomUUID } from "node:crypto";
import { processSingleton } from "../runtime/index.ts";

export interface StoredFile {
  object_key: string;
  sha256: string;
  media_type: string;
  size_bytes: number;
}

/** CLS-02 `FileStore` port. */
export interface FileStore {
  put(content: Uint8Array, mediaType: string): Promise<StoredFile>;
  get(objectKey: string): Promise<Uint8Array | null>;
}

/** In-memory stand-in — no S3/disk in this round (accepted scope). */
export class InMemoryFileStore implements FileStore {
  private readonly objects = new Map<string, Uint8Array>();

  async put(content: Uint8Array, mediaType: string): Promise<StoredFile> {
    const objectKey = `mem://${randomUUID()}`;
    this.objects.set(objectKey, content);
    return {
      object_key: objectKey,
      sha256: createHash("sha256").update(content).digest("hex"),
      media_type: mediaType,
      size_bytes: content.byteLength,
    };
  }

  async get(objectKey: string): Promise<Uint8Array | null> {
    return this.objects.get(objectKey) ?? null;
  }
}

export const fileStore = processSingleton("files", () => new InMemoryFileStore());

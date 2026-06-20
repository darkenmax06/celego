import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type RelayStoredEvidence = {
  deliveryId: string;
  deviceId: string;
  objectId: string;
  evidenceKind: "ACUSE" | "CEDULA";
  status: "uploaded" | "downloaded" | "expired";
  sha256: string;
  byteSize: number;
  receivedAt: string;
  expiresAt: string;
};

export interface RelayMetadataStore {
  put(record: RelayStoredEvidence): Promise<RelayStoredEvidence>;
  get(objectId: string): Promise<RelayStoredEvidence | null>;
  list(): Promise<RelayStoredEvidence[]>;
}

export class InMemoryRelayMetadataStore implements RelayMetadataStore {
  private readonly records = new Map<string, RelayStoredEvidence>();

  async put(record: RelayStoredEvidence) {
    this.records.set(record.objectId, record);
    return record;
  }

  async get(objectId: string) {
    return this.records.get(objectId) ?? null;
  }

  async list() {
    return [...this.records.values()].sort((left, right) =>
      right.receivedAt.localeCompare(left.receivedAt),
    );
  }
}

export class JsonFileRelayMetadataStore implements RelayMetadataStore {
  private readonly records = new Map<string, RelayStoredEvidence>();
  private loaded = false;

  constructor(private readonly filePath: string) {}

  private async load() {
    if (this.loaded) return;
    this.loaded = true;

    try {
      const raw = await readFile(this.filePath, "utf-8");
      const rows = JSON.parse(raw) as RelayStoredEvidence[];
      for (const row of rows) {
        this.records.set(row.objectId, row);
      }
    } catch (error) {
      const code = error && typeof error === "object" ? (error as { code?: string }).code : "";
      if (code !== "ENOENT") throw error;
    }
  }

  private async flush() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify([...this.records.values()], null, 2));
  }

  async put(record: RelayStoredEvidence) {
    await this.load();
    this.records.set(record.objectId, record);
    await this.flush();
    return record;
  }

  async get(objectId: string) {
    await this.load();
    return this.records.get(objectId) ?? null;
  }

  async list() {
    await this.load();
    return [...this.records.values()].sort((left, right) =>
      right.receivedAt.localeCompare(left.receivedAt),
    );
  }
}

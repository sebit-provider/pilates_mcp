import fs from "node:fs/promises";
import path from "node:path";
import type { PosterContent, PosterMetadata, PosterRecord, SearchPostersInput } from "./types.js";
import { LocalStorage } from "./storage.js";
import { assertSafeId, nowIso } from "./util.js";

export class PosterRepository {
  constructor(private readonly storage: LocalStorage) {}

  posterDir(metadata: Pick<PosterMetadata, "year" | "id">): string {
    assertSafeId(metadata.id);
    return this.storage.resolve("posters", String(metadata.year), metadata.id);
  }

  relativePosterDir(metadata: Pick<PosterMetadata, "year" | "id">): string {
    assertSafeId(metadata.id);
    return path.join("posters", String(metadata.year), metadata.id);
  }

  async save(record: PosterRecord, html: string, css: string): Promise<{ htmlPath: string; cssPath: string; metadataPath: string; contentPath: string }> {
    const dir = this.relativePosterDir(record.metadata);
    await this.storage.writeText(path.join(dir, "poster.html"), html);
    await this.storage.writeText(path.join(dir, "poster.css"), css);
    await this.storage.writeJson(path.join(dir, "metadata.json"), record.metadata);
    await this.storage.writeJson(path.join(dir, "content.json"), { content: record.content, theme: record.theme });
    return {
      htmlPath: path.join(dir, "poster.html"),
      cssPath: path.join(dir, "poster.css"),
      metadataPath: path.join(dir, "metadata.json"),
      contentPath: path.join(dir, "content.json")
    };
  }

  async get(id: string): Promise<PosterRecord & { paths: { dir: string; htmlPath: string; cssPath: string; metadataPath: string } }> {
    assertSafeId(id);
    const metadata = await this.findMetadataById(id);
    if (!metadata) throw new Error(`Poster not found: ${id}`);
    const dir = this.relativePosterDir(metadata);
    const packed = await this.storage.readJson<{ content: PosterContent; theme: PosterRecord["theme"] }>(path.join(dir, "content.json"), {
      content: {},
      theme: {
        background: "#fff",
        surface: "#fff",
        text: "#111",
        mutedText: "#777",
        accent: "#111",
        fontFamily: "sans-serif",
        radius: "8px",
        borderWidth: "1px",
        spacingScale: "normal"
      }
    });
    return {
      metadata,
      content: packed.content,
      theme: packed.theme,
      paths: {
        dir,
        htmlPath: path.join(dir, "poster.html"),
        cssPath: path.join(dir, "poster.css"),
        metadataPath: path.join(dir, "metadata.json")
      }
    };
  }

  async update(record: PosterRecord, html: string, css: string): Promise<void> {
    const existing = await this.get(record.metadata.id);
    const stamp = nowIso().replace(/[:.]/g, "-");
    const revisionDir = path.join(existing.paths.dir, "revisions", stamp);
    await this.storage.writeJson(path.join(revisionDir, "metadata.json"), existing.metadata);
    await this.storage.writeJson(path.join(revisionDir, "content.json"), { content: existing.content, theme: existing.theme });
    const oldHtml = await fs.readFile(this.storage.resolve(existing.paths.htmlPath), "utf8");
    const oldCss = await fs.readFile(this.storage.resolve(existing.paths.cssPath), "utf8");
    await this.storage.writeText(path.join(revisionDir, "poster.html"), oldHtml);
    await this.storage.writeText(path.join(revisionDir, "poster.css"), oldCss);
    await this.save(record, html, css);
  }

  async setRendered(id: string, rendered: { png?: boolean; pdf?: boolean }): Promise<PosterMetadata> {
    const record = await this.get(id);
    record.metadata.rendered = { ...(record.metadata.rendered ?? {}), ...rendered };
    record.metadata.updatedAt = nowIso();
    await this.storage.writeJson(record.paths.metadataPath, record.metadata);
    return record.metadata;
  }

  async search(input: SearchPostersInput): Promise<PosterMetadata[]> {
    const all = await this.listMetadata();
    const since = input.recentMonths ? monthFloor(new Date(), input.recentMonths) : null;
    const query = input.query?.trim().toLocaleLowerCase("ko-KR");
    return all
      .filter((item) => input.year === undefined || item.year === input.year)
      .filter((item) => input.month === undefined || item.month === input.month)
      .filter((item) => input.layout === undefined || item.layout === input.layout)
      .filter((item) => input.purpose === undefined || item.purpose === input.purpose)
      .filter((item) => input.style === undefined || item.style === input.style)
      .filter((item) => input.mood === undefined || (item.mood ?? []).includes(input.mood))
      .filter((item) => input.tag === undefined || (item.tags ?? []).includes(input.tag))
      .filter((item) => input.status === undefined || item.status === input.status)
      .filter((item) => input.programCategory === undefined || item.programCategories.includes(input.programCategory))
      .filter((item) => input.programSeparation === undefined || item.programSeparation === input.programSeparation)
      .filter((item) => input.tableStyle === undefined || item.tableStyle === input.tableStyle)
      .filter((item) => input.vatPolicy === undefined || item.vatPolicy === input.vatPolicy)
      .filter((item) => since === null || new Date(item.year, item.month - 1, 1) >= since)
      .filter((item) => {
        if (!query) return true;
        const haystack = [item.title, item.eventName, item.style, item.notes, ...(item.tags ?? []), ...(item.mood ?? [])].join(" ").toLocaleLowerCase("ko-KR");
        return haystack.includes(query);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, input.limit ?? 50);
  }

  private async findMetadataById(id: string): Promise<PosterMetadata | null> {
    return (await this.listMetadata()).find((item) => item.id === id) ?? null;
  }

  private async listMetadata(): Promise<PosterMetadata[]> {
    const postersRoot = this.storage.resolve("posters");
    const results: PosterMetadata[] = [];
    try {
      const years = await fs.readdir(postersRoot, { withFileTypes: true });
      for (const year of years.filter((entry) => entry.isDirectory())) {
        const yearDir = path.join(postersRoot, year.name);
        const posters = await fs.readdir(yearDir, { withFileTypes: true });
        for (const poster of posters.filter((entry) => entry.isDirectory())) {
          const file = path.join(yearDir, poster.name, "metadata.json");
          try {
            results.push(JSON.parse(await fs.readFile(file, "utf8")) as PosterMetadata);
          } catch {
            continue;
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return results;
  }
}

function monthFloor(now: Date, months: number): Date {
  return new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
}

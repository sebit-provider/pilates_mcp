import fs from "node:fs/promises";
import path from "node:path";
import { assertInside } from "./util.js";

export class LocalStorage {
  readonly root: string;

  constructor(root = path.join(process.cwd(), "data")) {
    this.root = path.resolve(root);
  }

  resolve(...segments: string[]): string {
    return assertInside(this.root, path.join(this.root, ...segments));
  }

  async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(assertInside(this.root, dir), { recursive: true });
  }

  async readJson<T>(file: string, fallback: T): Promise<T> {
    const safe = assertInside(this.root, file);
    try {
      return JSON.parse(await fs.readFile(safe, "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
      throw error;
    }
  }

  async writeJson(file: string, value: unknown): Promise<void> {
    await this.writeText(file, `${JSON.stringify(value, null, 2)}\n`);
  }

  async writeText(file: string, value: string): Promise<void> {
    const safe = assertInside(this.root, file);
    await fs.mkdir(path.dirname(safe), { recursive: true });
    const tmp = `${safe}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, value, "utf8");
    await fs.rename(tmp, safe);
  }

  async exists(file: string): Promise<boolean> {
    try {
      await fs.access(assertInside(this.root, file));
      return true;
    } catch {
      return false;
    }
  }
}

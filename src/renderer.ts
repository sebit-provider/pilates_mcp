import fs from "node:fs/promises";
import path from "node:path";
import type { PosterRenderSizeName } from "./types.js";
import { LocalStorage } from "./storage.js";

export const renderSizes: Record<PosterRenderSizeName, { width: number; height: number; pdfFormat?: "A4" }> = {
  "instagram-portrait": { width: 1080, height: 1350 },
  "instagram-square": { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  "a4-portrait": { width: 794, height: 1123, pdfFormat: "A4" }
};

export class PosterRenderer {
  constructor(private readonly storage: LocalStorage) {}

  async render(input: { posterDir: string; png?: boolean; pdf?: boolean; size?: PosterRenderSizeName }): Promise<{ previewPath?: string; pdfPath?: string; errors: string[] }> {
    const size = renderSizes[input.size ?? "instagram-portrait"];
    const errors: string[] = [];
    let chromium: typeof import("playwright").chromium;
    try {
      chromium = (await import("playwright")).chromium;
    } catch {
      return { errors: ["Playwright is not installed. Run npm install before rendering."] };
    }

    const htmlPath = this.storage.resolve(input.posterDir, "poster.html");
    const cssPath = this.storage.resolve(input.posterDir, "poster.css");
    const html = await fs.readFile(htmlPath, "utf8");
    const css = await fs.readFile(cssPath, "utf8");
    const composed = html.replace('<link rel="stylesheet" href="./poster.css">', `<style>${css}</style>`);
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, javaScriptEnabled: false });
      await page.setContent(composed, { waitUntil: "load" });
      const poster = page.locator(".poster");
      const previewPath = input.png ? path.join(input.posterDir, "preview.png") : undefined;
      if (previewPath) {
        await poster.screenshot({ path: this.storage.resolve(previewPath) });
      }
      const pdfPath = input.pdf ? path.join(input.posterDir, "poster.pdf") : undefined;
      if (pdfPath) {
        await page.pdf({
          path: this.storage.resolve(pdfPath),
          printBackground: true,
          width: size.pdfFormat ? undefined : `${size.width}px`,
          height: size.pdfFormat ? undefined : `${size.height}px`,
          format: size.pdfFormat
        });
      }
      return { previewPath, pdfPath, errors };
    } catch (error) {
      errors.push((error as Error).message);
      return { errors };
    } finally {
      if (browser) await browser.close();
    }
  }
}

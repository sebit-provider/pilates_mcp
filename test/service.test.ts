import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PosterService } from "../src/service.js";
import type { PosterBrief } from "../src/types.js";

async function makeService(): Promise<{ service: PosterService; root: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pilates-mcp-"));
  return { service: new PosterService(root), root };
}

function assertCreated(result: unknown): Record<string, unknown> {
  assert.equal((result as { valid?: boolean }).valid, true);
  return result as Record<string, unknown>;
}

const tableContent = {
  subtitle: "이번 달 특별 혜택",
  badge: "8월 EVENT",
  table: {
    columns: ["상품", "정상가", "이벤트가"],
    rows: [
      ["1:1 개인레슨 10회", "800,000원", "650,000원"],
      ["듀엣레슨 10회", "500,000원", "390,000원"]
    ],
    highlightColumn: 2
  },
  footer: "선착순 마감"
};

const completeBrief = {
    eventName: "8월 회원권 이벤트",
    programCategories: ["private", "duet"],
  programSeparation: "table" as const,
  tablePreference: "required" as const,
  tableStyle: "comparison" as const,
  vatPolicy: "excluded" as const
} satisfies Partial<PosterBrief>;

test("validates required PosterBrief fields before creating", async () => {
  const { service } = await makeService();
  const result = await service.createPoster({
    title: "8월 회원권 이벤트",
    purpose: "event",
    content: tableContent
  });
  assert.equal(result.valid, false);
  assert.deepEqual(result.missing, ["eventName", "programSeparation", "tablePreference", "tableStyle", "vatPolicy"]);
});

test("creates Korean table poster and preserves UTF-8", async () => {
  const { service, root } = await makeService();
  const result = await service.createPoster({
    title: "8월 회원권 이벤트",
    purpose: "event",
    brief: completeBrief,
    content: tableContent,
    style: "premium",
    mood: ["calm", "clean"],
    year: 2026,
    month: 8,
    tags: ["여름", "가격표"]
  });
  const ok = assertCreated(result);
  const posterId = String(ok.posterId);
  const poster = await service.getPoster(posterId);
  assert.equal(poster.metadata.eventName, "8월 회원권 이벤트");
  assert.equal(poster.metadata.vatPolicy, "excluded");
  assert.match(poster.html, /1:1 개인레슨 10회/);
  assert.match(poster.html, /VAT 별도/);
  await fs.access(path.join(root, String(ok.htmlPath)));
});

test("creates Korean standard poster", async () => {
  const { service } = await makeService();
  const result = await service.createPoster({
    title: "SUMMER EVENT",
    layout: "standard",
    purpose: "promotion",
    brief: {
      eventName: "여름 회원권 EVENT",
      programCategories: ["private"],
      programSeparation: "none",
      tablePreference: "none",
      vatPolicy: "not_applicable"
    },
    content: {
      headline: "3개월 등록 시\n개인레슨 2회 무료",
      subtitle: "선착순 20명",
      cta: "지금 상담하세요",
      footer: "2026.08.20 - 09.15"
    }
  });
  const ok = assertCreated(result);
  const poster = await service.getPoster(String(ok.posterId));
  assert.equal(poster.metadata.layout, "standard");
  assert.match(poster.html, /개인레슨 2회 무료/);
});

test("searches by year month layout purpose free text and recent months", async () => {
  const { service } = await makeService();
  await service.createPoster({
    title: "8월 회원권 이벤트",
    purpose: "event",
    brief: completeBrief,
    content: tableContent,
    year: 2026,
    month: 8,
    tags: ["여름"]
  });
  assert.equal((await service.searchPosters({ year: 2026, month: 8 })).length, 1);
  assert.equal((await service.searchPosters({ layout: "table" })).length, 1);
  assert.equal((await service.searchPosters({ purpose: "event" })).length, 1);
  assert.equal((await service.searchPosters({ query: "회원권" })).length, 1);
  assert.equal((await service.searchPosters({ recentMonths: 12 })).length, 1);
  assert.equal((await service.searchPosters({ tableStyle: "comparison", vatPolicy: "excluded" })).length, 1);
});

test("uses center poster defaults and renders split table sections", async () => {
  const { service } = await makeService();
  await service.updateCenterProfile({
    posterDefaults: {
      programSeparation: "table",
      tablePreference: "required",
      tableStyle: "split",
      vatPolicy: "excluded"
    }
  });
  const result = await service.createPoster({
    title: "9월 신규회원 이벤트",
    purpose: "event",
    brief: {
      eventName: "9월 신규회원 이벤트",
      programCategories: ["group", "private"]
    },
    content: {
      table: {
        columns: ["프로그램", "횟수", "이벤트가"],
        rows: [
          ["그룹레슨", "10회", "220,000원"],
          ["개인레슨", "10회", "650,000원"]
        ],
        rowCategories: ["GROUP", "PRIVATE"],
        highlightColumn: 2
      }
    }
  });
  const ok = assertCreated(result);
  const poster = await service.getPoster(String(ok.posterId));
  assert.equal(poster.metadata.programSeparation, "table");
  assert.equal(poster.metadata.tableStyle, "split");
  assert.equal(poster.metadata.vatPolicy, "excluded");
  assert.match(poster.html, /class="split-section"/);
  assert.match(poster.html, /GROUP/);
  assert.match(poster.html, /PRIVATE/);
});

test("reuses template without changing source and records sourcePosterId", async () => {
  const { service } = await makeService();
  const source = await service.createPoster({
    title: "2025년 8월 이벤트",
    purpose: "event",
    brief: completeBrief,
    content: tableContent,
    style: "premium",
    year: 2025,
    month: 8
  });
  const okSource = assertCreated(source);
  const sourceBefore = await service.getPoster(String(okSource.posterId));
  const reused = await service.reusePosterTemplate({
    sourcePosterId: String(okSource.posterId),
    title: "2026년 8월 이벤트",
    content: {
      ...tableContent,
      table: {
        ...tableContent.table,
        rows: [["1:1 개인레슨 10회", "820,000원", "670,000원"]]
      }
    },
    brief: { eventName: "2026년 8월 회원권 이벤트", vatPolicy: "excluded" },
    year: 2026,
    month: 8
  });
  const okReused = assertCreated(reused);
  const sourceAfter = await service.getPoster(String(okSource.posterId));
  const copy = await service.getPoster(String(okReused.posterId));
  assert.equal(sourceAfter.html, sourceBefore.html);
  assert.equal(copy.metadata.sourcePosterId, okSource.posterId);
  assert.notEqual(copy.metadata.id, okSource.posterId);
});

test("stores and retrieves global and table feedback", async () => {
  const { service } = await makeService();
  await service.addDesignFeedback({ scope: "global", text: "가격은 항상 크게 보여줘." });
  await service.addDesignFeedback({ scope: "table", text: "표 테두리를 너무 굵게 하지 마." });
  const items = await service.getDesignFeedback({ layout: "table" });
  assert.equal(items.length, 2);
  assert.ok(items.some((item) => item.scope === "global"));
  assert.ok(items.some((item) => item.scope === "table"));
});

test("blocks invalid poster ids and archive path traversal", async () => {
  const { service } = await makeService();
  await assert.rejects(() => service.getPoster("../secret"), /Invalid poster id/);
  await assert.rejects(
    () =>
      service.importPoster({
        htmlPath: "../outside.html",
        css: "body{}",
        metadata: {
          title: "bad",
          year: 2026,
          month: 8,
          layout: "standard",
          purpose: "notice",
          eventName: "bad",
          programCategories: [],
          programSeparation: "none",
          tablePreference: "none",
          vatPolicy: "not_applicable",
          status: "draft",
          sourcePosterId: null
        }
      }),
    /Path traversal blocked/
  );
});

test("renders PNG and PDF when Playwright browser is available", async (t) => {
  const { service, root } = await makeService();
  const created = await service.createPoster({
    title: "8월 회원권 이벤트",
    purpose: "event",
    brief: completeBrief,
    content: tableContent,
    year: 2026,
    month: 8
  });
  const okCreated = assertCreated(created);
  const rendered = await service.renderPoster({ posterId: String(okCreated.posterId), png: true, pdf: true, size: "instagram-square" });
  if (Array.isArray(rendered.renderErrors) && rendered.renderErrors.length > 0) {
    t.skip(`Playwright render skipped: ${rendered.renderErrors.join("; ")}`);
    return;
  }
  assert.ok(rendered.previewPath);
  assert.ok(rendered.pdfPath);
  const png = await fs.stat(path.join(root, String(rendered.previewPath)));
  const pdf = await fs.stat(path.join(root, String(rendered.pdfPath)));
  assert.ok(png.size > 0);
  assert.ok(pdf.size > 0);
});

import fs from "node:fs/promises";
import path from "node:path";
import type {
  CenterProfile,
  CreatePosterInput,
  PosterBrief,
  PosterContent,
  PosterLayout,
  PosterMetadata,
  PosterRecord,
  PosterRenderSizeName,
  PosterTheme,
  SearchPostersInput,
  ValidationResult
} from "./types.js";
import { FeedbackRepository } from "./feedback.js";
import { CenterProfileRepository } from "./profile.js";
import { PosterRepository } from "./repository.js";
import { PosterRenderer } from "./renderer.js";
import { LocalStorage } from "./storage.js";
import { renderCss, renderHtml } from "./templates.js";
import { resolveTheme } from "./themes.js";
import { assertInside, assertSafeId, includesPrice, normalizeArray, nowIso, posterId } from "./util.js";

export class PosterService {
  readonly storage: LocalStorage;
  readonly profiles: CenterProfileRepository;
  readonly posters: PosterRepository;
  readonly feedback: FeedbackRepository;
  readonly renderer: PosterRenderer;

  constructor(root?: string) {
    this.storage = new LocalStorage(root);
    this.profiles = new CenterProfileRepository(this.storage);
    this.posters = new PosterRepository(this.storage);
    this.feedback = new FeedbackRepository(this.storage);
    this.renderer = new PosterRenderer(this.storage);
  }

  async getCenterProfile(): Promise<CenterProfile> {
    return this.profiles.get();
  }

  async updateCenterProfile(patch: Partial<CenterProfile>): Promise<CenterProfile> {
    return this.profiles.update(patch);
  }

  async createPoster(input: CreatePosterInput): Promise<ValidationResult | Record<string, unknown>> {
    const center = await this.profiles.get();
    const brief = this.resolveBrief(input, center);
    const validation = this.validateBrief(brief, input.content);
    if (!validation.valid) {
      return validation;
    }

    const now = nowIso();
    const date = new Date();
    const layout = this.resolveLayout(input.layout, brief);
    const id = posterId();
    const metadata: PosterMetadata = {
      id,
      title: input.title,
      year: input.year ?? date.getFullYear(),
      month: input.month ?? date.getMonth() + 1,
      createdAt: now,
      updatedAt: now,
      layout,
      purpose: input.purpose,
      eventName: brief.eventName,
      programCategories: brief.programCategories,
      programSeparation: brief.programSeparation,
      tablePreference: brief.tablePreference,
      tableStyle: brief.tableStyle,
      vatPolicy: brief.vatPolicy,
      style: input.style ?? brief.style ?? center.defaultStyle,
      mood: input.mood ?? brief.mood,
      tags: input.tags,
      status: input.status ?? "draft",
      sourcePosterId: null,
      rendered: { png: false, pdf: false },
      notes: input.notes ?? brief.notes
    };
    const relevantFeedback = await this.feedback.get({ layout, activeOnly: true });
    const theme = resolveTheme(metadata.style, center, input.theme);
    const record: PosterRecord = { metadata, content: input.content, theme };
    const paths = await this.writeRecord(record, center, relevantFeedback);
    const renderResult = await this.maybeRender(metadata, input.render);
    return {
      valid: true,
      posterId: id,
      ...paths,
      ...renderResult,
      appliedFeedback: relevantFeedback
    };
  }

  async getPoster(id: string): Promise<PosterRecord & { html: string; css: string; paths: Record<string, string> }> {
    const record = await this.posters.get(id);
    const html = await fs.readFile(this.storage.resolve(record.paths.htmlPath), "utf8");
    const css = await fs.readFile(this.storage.resolve(record.paths.cssPath), "utf8");
    return { ...record, html, css, paths: record.paths };
  }

  async updatePoster(input: { posterId: string; title?: string; content?: PosterContent; style?: string; mood?: string[]; theme?: Partial<PosterTheme>; status?: PosterMetadata["status"]; notes?: string }): Promise<Record<string, unknown>> {
    const current = await this.posters.get(input.posterId);
    const center = await this.profiles.get();
    const metadata: PosterMetadata = {
      ...current.metadata,
      title: input.title ?? current.metadata.title,
      style: input.style ?? current.metadata.style,
      mood: input.mood ?? current.metadata.mood,
      status: input.status ?? current.metadata.status,
      notes: input.notes ?? current.metadata.notes,
      updatedAt: nowIso()
    };
    const content = input.content ?? current.content;
    const theme = { ...current.theme, ...(input.theme ?? {}) };
    const feedback = await this.feedback.get({ layout: metadata.layout, posterId: metadata.id, activeOnly: true });
    const html = renderHtml({ metadata, content, center, feedback });
    const css = renderCss(metadata.layout, theme);
    await this.posters.update({ metadata, content, theme }, html, css);
    return { posterId: metadata.id, updatedAt: metadata.updatedAt, revisionCreated: true };
  }

  async searchPosters(input: SearchPostersInput): Promise<PosterMetadata[]> {
    return this.posters.search(input);
  }

  async reusePosterTemplate(input: { sourcePosterId: string; title: string; purpose?: PosterMetadata["purpose"]; content: PosterContent; brief?: Partial<PosterBrief>; year?: number; month?: number; tags?: string[]; render?: false | { png?: boolean; pdf?: boolean; size?: PosterRenderSizeName } }): Promise<ValidationResult | Record<string, unknown>> {
    const source = await this.posters.get(input.sourcePosterId);
    const center = await this.profiles.get();
    const brief = this.resolveBrief(
      {
        title: input.title,
        purpose: input.purpose ?? source.metadata.purpose,
        content: input.content,
        brief: { ...source.metadata, ...input.brief },
        style: source.metadata.style,
        mood: source.metadata.mood
      },
      center
    );
    const validation = this.validateBrief(brief, input.content);
    if (!validation.valid) return validation;
    const now = nowIso();
    const id = posterId();
    const metadata: PosterMetadata = {
      ...source.metadata,
      id,
      title: input.title,
      purpose: input.purpose ?? source.metadata.purpose,
      eventName: brief.eventName,
      programCategories: brief.programCategories,
      programSeparation: brief.programSeparation,
      tablePreference: brief.tablePreference,
      tableStyle: brief.tableStyle,
      vatPolicy: brief.vatPolicy,
      year: input.year ?? new Date().getFullYear(),
      month: input.month ?? new Date().getMonth() + 1,
      createdAt: now,
      updatedAt: now,
      sourcePosterId: source.metadata.id,
      tags: input.tags ?? source.metadata.tags,
      rendered: { png: false, pdf: false }
    };
    const feedback = await this.feedback.get({ layout: metadata.layout, activeOnly: true });
    const paths = await this.writeRecord({ metadata, content: input.content, theme: source.theme }, center, feedback);
    const renderResult = await this.maybeRender(metadata, input.render);
    return { valid: true, posterId: id, sourcePosterId: source.metadata.id, ...paths, ...renderResult, appliedFeedback: feedback };
  }

  async importPoster(input: { html?: string; css?: string; htmlPath?: string; cssPath?: string; metadata: Omit<PosterMetadata, "id" | "createdAt" | "updatedAt"> & Partial<Pick<PosterMetadata, "id" | "createdAt" | "updatedAt">>; content?: PosterContent; theme?: PosterTheme }): Promise<Record<string, unknown>> {
    const id = input.metadata.id ?? posterId();
    assertSafeId(id);
    const createdAt = input.metadata.createdAt ?? nowIso();
    const metadata: PosterMetadata = { ...input.metadata, id, createdAt, updatedAt: input.metadata.updatedAt ?? createdAt };
    const html = input.html ?? (input.htmlPath ? await fs.readFile(assertInside(this.storage.root, path.join(this.storage.root, input.htmlPath)), "utf8") : undefined);
    const css = input.css ?? (input.cssPath ? await fs.readFile(assertInside(this.storage.root, path.join(this.storage.root, input.cssPath)), "utf8") : undefined);
    if (!html || !css) throw new Error("import_poster requires html/css text or archive-relative htmlPath/cssPath");
    const center = await this.profiles.get();
    const theme = input.theme ?? resolveTheme(metadata.style, center);
    const content = input.content ?? {};
    const paths = await this.posters.save({ metadata, content, theme }, html, css);
    return { posterId: id, ...paths };
  }

  async renderPoster(input: { posterId: string; png?: boolean; pdf?: boolean; size?: PosterRenderSizeName }): Promise<Record<string, unknown>> {
    const record = await this.posters.get(input.posterId);
    return this.renderAndMark(record.metadata, input);
  }

  async addDesignFeedback(input: { scope: "global" | "table" | "standard" | "poster"; posterId?: string; text: string; active?: boolean }) {
    if (input.scope === "poster") assertSafeId(input.posterId ?? "");
    return this.feedback.add(input);
  }

  async getDesignFeedback(input: { scope?: "global" | "table" | "standard" | "poster"; posterId?: string; layout?: PosterLayout; activeOnly?: boolean }) {
    return this.feedback.get(input);
  }

  async recommendPosterStyle(input: { purpose?: PosterMetadata["purpose"]; month?: number; recentMonths?: number; programCategories?: string[] } = {}) {
    const profile = await this.profiles.get();
    const matches = await this.posters.search({ purpose: input.purpose, month: input.month, recentMonths: input.recentMonths ?? 12, limit: 100 });
    const style = mostCommon(matches.map((item) => item.style).filter(Boolean) as string[]) ?? profile.defaultStyle;
    const tableStyle = mostCommon(matches.map((item) => item.tableStyle).filter(Boolean) as string[]) ?? profile.posterDefaults?.tableStyle;
    const separation = mostCommon(matches.map((item) => item.programSeparation).filter(Boolean)) ?? profile.posterDefaults?.programSeparation;
    const layout = mostCommon(matches.map((item) => item.layout));
    const feedback = await this.feedback.get({ activeOnly: true });
    const reasons = [
      matches.length > 0 ? `최근 ${input.recentMonths ?? 12}개월 조건에 맞는 포스터 ${matches.length}건을 참고했습니다.` : "조건에 맞는 과거 포스터가 없어 센터 기본 설정을 참고했습니다.",
      tableStyle ? `가장 자주 사용된 tableStyle은 ${tableStyle}입니다.` : undefined,
      separation ? `가장 자주 사용된 programSeparation은 ${separation}입니다.` : undefined,
      feedback.length > 0 ? `활성 디자인 피드백 ${feedback.length}건을 함께 확인했습니다.` : undefined
    ].filter(Boolean);
    return {
      recommendedLayout: layout ?? (profile.posterDefaults?.tablePreference === "required" ? "table" : "standard"),
      recommendedTableStyle: tableStyle,
      recommendedProgramSeparation: separation,
      recommendedStyle: style,
      recommendedMood: mostCommonMood(matches),
      referencePosterIds: matches.slice(0, 5).map((item) => item.id),
      reason: reasons,
      feedback
    };
  }

  private resolveBrief(input: Pick<CreatePosterInput, "purpose" | "brief" | "style" | "mood"> & { content: PosterContent; title: string }, center: CenterProfile): PosterBrief {
    const defaults = center.posterDefaults ?? {};
    const brief = input.brief ?? {};
    return {
      eventName: brief.eventName ?? "",
      purpose: brief.purpose ?? input.purpose,
      programCategories: normalizeArray(brief.programCategories),
      programSeparation: brief.programSeparation ?? defaults.programSeparation ?? ("" as PosterBrief["programSeparation"]),
      tablePreference: brief.tablePreference ?? defaults.tablePreference ?? ("" as PosterBrief["tablePreference"]),
      tableStyle: brief.tableStyle ?? defaults.tableStyle,
      vatPolicy: brief.vatPolicy ?? defaults.vatPolicy ?? "unspecified",
      style: input.style ?? brief.style,
      mood: input.mood ?? brief.mood,
      notes: brief.notes
    };
  }

  private validateBrief(brief: PosterBrief, content: PosterContent): ValidationResult {
    const missing: string[] = [];
    const questions: string[] = [];
    if (!brief.eventName) {
      missing.push("eventName");
      questions.push("이벤트 이름을 입력해주세요.");
    }
    if (!brief.programSeparation) {
      missing.push("programSeparation");
      questions.push("그룹/개인/듀엣 프로그램을 포스터에서 어떻게 구분할까요?");
    }
    if (!brief.tablePreference) {
      missing.push("tablePreference");
      questions.push("표를 반드시 사용할까요, 적합할 때만 사용할까요, 아니면 사용하지 않을까요?");
    }
    if ((brief.tablePreference === "required" || content.table) && !brief.tableStyle) {
      missing.push("tableStyle");
      questions.push("표 양식은 single, split, grouped, comparison, price-list 중 무엇인가요?");
    }
    if (includesPrice(content) && (brief.vatPolicy === "unspecified" || !brief.vatPolicy)) {
      missing.push("vatPolicy");
      questions.push("표시된 가격은 VAT 포함인가요, 별도인가요?");
    }
    return { valid: missing.length === 0, missing, questions };
  }

  private resolveLayout(layout: PosterLayout | undefined, brief: PosterBrief): PosterLayout {
    if (layout) return layout;
    if (brief.tablePreference === "required") return "table";
    if (brief.tablePreference === "none") return "standard";
    return "table";
  }

  private async writeRecord(record: PosterRecord, center: CenterProfile, feedback: Awaited<ReturnType<FeedbackRepository["get"]>>) {
    const html = renderHtml({ metadata: record.metadata, content: record.content, center, feedback });
    const css = renderCss(record.metadata.layout, record.theme);
    return this.posters.save(record, html, css);
  }

  private async maybeRender(metadata: PosterMetadata, render: CreatePosterInput["render"]) {
    if (!render) return { previewPath: undefined, pdfPath: undefined, renderErrors: [] };
    return this.renderAndMark(metadata, render);
  }

  private async renderAndMark(metadata: PosterMetadata, render: { png?: boolean; pdf?: boolean; size?: PosterRenderSizeName }) {
    const dir = this.posters.relativePosterDir(metadata);
    const result = await this.renderer.render({ posterDir: dir, png: render.png, pdf: render.pdf, size: render.size });
    if (result.previewPath || result.pdfPath) {
      await this.posters.setRendered(metadata.id, { png: Boolean(result.previewPath), pdf: Boolean(result.pdfPath) });
    }
    return { previewPath: result.previewPath, pdfPath: result.pdfPath, renderErrors: result.errors };
  }
}

function mostCommon<T extends string>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function mostCommonMood(matches: PosterMetadata[]): string[] {
  const values = matches.flatMap((item) => item.mood ?? []);
  const first = mostCommon(values);
  return first ? [first] : ["clean"];
}

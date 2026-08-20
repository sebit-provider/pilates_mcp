import type { DesignFeedback, FeedbackScope, PosterLayout } from "./types.js";
import { LocalStorage } from "./storage.js";
import { feedbackId, nowIso } from "./util.js";

export class FeedbackRepository {
  constructor(private readonly storage: LocalStorage) {}

  private file(scope: FeedbackScope, posterId?: string): string {
    if (scope === "poster") {
      if (!posterId) throw new Error("posterId is required for poster-scoped feedback");
      return `feedback/poster-${posterId}.json`;
    }
    return `feedback/${scope}.json`;
  }

  async add(input: { scope: FeedbackScope; posterId?: string; text: string; active?: boolean }): Promise<DesignFeedback> {
    const item: DesignFeedback = {
      id: feedbackId(),
      scope: input.scope,
      posterId: input.posterId,
      text: input.text,
      createdAt: nowIso(),
      active: input.active ?? true
    };
    const file = this.file(input.scope, input.posterId);
    const items = await this.storage.readJson<DesignFeedback[]>(file, []);
    items.push(item);
    await this.storage.writeJson(file, items);
    return item;
  }

  async get(input: { scope?: FeedbackScope; posterId?: string; layout?: PosterLayout; activeOnly?: boolean } = {}): Promise<DesignFeedback[]> {
    const scopes: FeedbackScope[] = input.scope ? [input.scope] : ["global", ...(input.layout ? [input.layout] : []), ...(input.posterId ? ["poster" as const] : [])];
    const all: DesignFeedback[] = [];
    for (const scope of scopes) {
      const items = await this.storage.readJson<DesignFeedback[]>(this.file(scope, input.posterId), []);
      all.push(...items);
    }
    return input.activeOnly === false ? all : all.filter((item) => item.active);
  }
}

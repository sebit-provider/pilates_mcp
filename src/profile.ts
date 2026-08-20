import type { CenterProfile } from "./types.js";
import { LocalStorage } from "./storage.js";

export const defaultCenterProfile: CenterProfile = {
  name: "Example Pilates",
  logoPath: null,
  defaultLocale: "ko-KR",
  defaultStyle: "clean",
  brand: {
    primary: "#D8CBBE",
    secondary: "#F7F4F0",
    text: "#252525"
  },
  footerText: null,
  posterDefaults: {
    programSeparation: undefined,
    tablePreference: undefined,
    tableStyle: undefined,
    vatPolicy: undefined
  }
};

export class CenterProfileRepository {
  constructor(private readonly storage: LocalStorage) {}

  async get(): Promise<CenterProfile> {
    return this.storage.readJson("config/center-profile.json", defaultCenterProfile);
  }

  async update(patch: Partial<CenterProfile>): Promise<CenterProfile> {
    const current = await this.get();
    const updated: CenterProfile = {
      ...current,
      ...patch,
      brand: { ...current.brand, ...(patch.brand ?? {}) },
      posterDefaults: { ...(current.posterDefaults ?? {}), ...(patch.posterDefaults ?? {}) }
    };
    await this.storage.writeJson("config/center-profile.json", updated);
    return updated;
  }
}

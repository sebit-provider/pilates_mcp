import type { CenterProfile, PosterTheme } from "./types.js";

const fontFamily =
  '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "Segoe UI", sans-serif';

export const themePresets: Record<string, PosterTheme> = {
  clean: {
    background: "#F8F8F6",
    surface: "#FFFFFF",
    text: "#252525",
    mutedText: "#6D6A66",
    accent: "#7D8F7A",
    fontFamily,
    radius: "18px",
    borderWidth: "1px",
    spacingScale: "normal"
  },
  premium: {
    background: "#191817",
    surface: "#2A2825",
    text: "#F8F1E8",
    mutedText: "#C8BBAA",
    accent: "#C9A66B",
    fontFamily,
    radius: "10px",
    borderWidth: "1px",
    spacingScale: "airy"
  },
  minimal: {
    background: "#FFFFFF",
    surface: "#F4F4F4",
    text: "#161616",
    mutedText: "#707070",
    accent: "#111111",
    fontFamily,
    radius: "4px",
    borderWidth: "1px",
    spacingScale: "compact"
  },
  soft: {
    background: "#F4F0EA",
    surface: "#FFFDFC",
    text: "#2D2926",
    mutedText: "#7D7168",
    accent: "#B98775",
    fontFamily,
    radius: "24px",
    borderWidth: "1px",
    spacingScale: "airy"
  },
  energetic: {
    background: "#FFF7E8",
    surface: "#FFFFFF",
    text: "#202124",
    mutedText: "#69645E",
    accent: "#E85D3F",
    fontFamily,
    radius: "14px",
    borderWidth: "2px",
    spacingScale: "normal"
  }
};

export function resolveTheme(style: string | undefined, center: CenterProfile, override?: Partial<PosterTheme>): PosterTheme {
  const base = themePresets[style ?? center.defaultStyle] ?? themePresets.clean;
  return {
    ...base,
    background: override?.background ?? center.brand.secondary ?? base.background,
    text: override?.text ?? center.brand.text ?? base.text,
    accent: override?.accent ?? center.brand.primary ?? base.accent,
    ...override
  };
}

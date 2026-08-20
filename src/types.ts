export const posterLayouts = ["table", "standard"] as const;
export type PosterLayout = (typeof posterLayouts)[number];

export const posterPurposes = ["event", "price", "notice", "schedule", "promotion", "other"] as const;
export type PosterPurpose = (typeof posterPurposes)[number];

export const posterStatuses = ["draft", "used", "archived"] as const;
export type PosterStatus = (typeof posterStatuses)[number];

export const programCategories = ["group", "private", "duet", "other"] as const;
export type ProgramCategory = (typeof programCategories)[number];

export const programSeparations = ["none", "section", "color", "table", "card"] as const;
export type ProgramSeparation = (typeof programSeparations)[number];

export const tablePreferences = ["required", "preferred", "none"] as const;
export type TablePreference = (typeof tablePreferences)[number];

export const tableStyles = ["single", "split", "grouped", "comparison", "price-list"] as const;
export type TableStyle = (typeof tableStyles)[number];

export const vatPolicies = ["included", "excluded", "not_applicable", "unspecified"] as const;
export type VatPolicy = (typeof vatPolicies)[number];

export type FeedbackScope = "global" | "table" | "standard" | "poster";

export interface PosterTheme {
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  accent: string;
  fontFamily: string;
  radius: string;
  borderWidth: string;
  spacingScale: "compact" | "normal" | "airy";
}

export interface PosterBrief {
  eventName: string;
  purpose: PosterPurpose;
  programCategories: ProgramCategory[];
  programSeparation: ProgramSeparation;
  tablePreference: TablePreference;
  tableStyle?: TableStyle;
  vatPolicy: VatPolicy;
  style?: string;
  mood?: string[];
  notes?: string;
}

export interface PosterTable {
  columns: string[];
  rows: Array<Array<string>>;
  highlightColumn?: number;
  rowCategories?: Array<ProgramCategory | string | null>;
}

export interface PosterContent {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  headline?: string;
  body?: string;
  highlight?: string;
  cta?: string;
  badge?: string;
  note?: string;
  footer?: string;
  table?: PosterTable;
}

export interface PosterMetadata {
  id: string;
  title: string;
  year: number;
  month: number;
  createdAt: string;
  updatedAt: string;
  layout: PosterLayout;
  purpose: PosterPurpose;
  eventName: string;
  programCategories: ProgramCategory[];
  programSeparation: ProgramSeparation;
  tablePreference: TablePreference;
  tableStyle?: TableStyle;
  vatPolicy: VatPolicy;
  style?: string;
  mood?: string[];
  tags?: string[];
  status: PosterStatus;
  sourcePosterId?: string | null;
  rendered?: {
    png?: boolean;
    pdf?: boolean;
  };
  notes?: string;
}

export interface PosterRecord {
  metadata: PosterMetadata;
  content: PosterContent;
  theme: PosterTheme;
}

export interface CenterProfile {
  name: string;
  logoPath: string | null;
  defaultLocale: string;
  defaultStyle: string;
  brand: {
    primary: string;
    secondary: string;
    text: string;
  };
  footerText: string | null;
  posterDefaults?: Partial<Pick<PosterBrief, "programSeparation" | "tablePreference" | "tableStyle" | "vatPolicy">>;
}

export interface DesignFeedback {
  id: string;
  scope: FeedbackScope;
  posterId?: string;
  text: string;
  createdAt: string;
  active: boolean;
}

export interface CreatePosterInput {
  title: string;
  layout?: PosterLayout;
  purpose: PosterPurpose;
  brief?: Partial<PosterBrief>;
  content: PosterContent;
  style?: string;
  mood?: string[];
  year?: number;
  month?: number;
  tags?: string[];
  status?: PosterStatus;
  theme?: Partial<PosterTheme>;
  render?: false | { png?: boolean; pdf?: boolean; size?: PosterRenderSizeName };
  notes?: string;
}

export type PosterRenderSizeName = "instagram-portrait" | "instagram-square" | "story" | "a4-portrait";

export interface SearchPostersInput {
  year?: number;
  month?: number;
  layout?: PosterLayout;
  purpose?: PosterPurpose;
  style?: string;
  mood?: string;
  tag?: string;
  status?: PosterStatus;
  query?: string;
  recentMonths?: number;
  programCategory?: ProgramCategory;
  programSeparation?: ProgramSeparation;
  tableStyle?: TableStyle;
  vatPolicy?: VatPolicy;
  limit?: number;
}

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  questions: string[];
}

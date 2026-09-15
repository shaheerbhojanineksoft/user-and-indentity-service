/** The 16 default widget-section types created at signup (spec §5.5.5). */
export type SectionType =
  | "highlightStats"
  | "highlightStatsRight"
  | "topStats"
  | "traderType"
  | "favouriteInvestment"
  | "recommendation"
  | "predictions"
  | "profitAndLoss"
  | "watchlists"
  | "playbook"
  | "links"
  | "favouriteInfluencer"
  | "portfolio"
  | "winningTrades"
  | "images"
  | "points";

/** A widget section stored in the `sections` collection (spec §5.5.5). */
export interface SectionEntity {
  userId: string;
  name: string;
  type: SectionType;
  status: "public";
  privacy: "public";
  data?: Record<string, any>;
  order?: number;
  isInitial?: boolean;
  createdOn?: number;
}

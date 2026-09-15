import type { SectionEntity, SectionType } from "../dto/section.dto";
import {
  countSections,
  findSection,
  insertSection,
} from "../repositories/sections.repo";

/** The 16 default sections created for every new user (spec §5.5.5). */
const INITIAL_SECTIONS: Array<{ name: string; type: SectionType }> = [
  { name: "Highlights Left Stats", type: "highlightStats" },
  { name: "Highlights Right Stats", type: "highlightStatsRight" },
  { name: "Top Stats", type: "topStats" },
  { name: "Trader Type", type: "traderType" },
  { name: "Favorite Investments", type: "favouriteInvestment" },
  { name: "Recommendation", type: "recommendation" },
  { name: "Prediction", type: "predictions" },
  { name: "Profit and Loss", type: "profitAndLoss" },
  { name: "Watchlist", type: "watchlists" },
  { name: "Playbook", type: "playbook" },
  { name: "Links", type: "links" },
  { name: "Favorite Influencer", type: "favouriteInfluencer" },
  { name: "Favorite Platforms", type: "portfolio" },
  { name: "Best Trades", type: "winningTrades" },
  { name: "Images", type: "images" },
  { name: "Lists", type: "points" },
];

/** Default empty data shape per section type (spec §5.5.5). */
function getInitialSectionData(type: SectionType): Record<string, any> {
  switch (type) {
    case "portfolio":
      return { portfolios: [] };
    case "traderType":
      return { traderTypes: [] };
    case "topStats":
    case "highlightStats":
    case "highlightStatsRight":
      return { stats: [] };
    case "favouriteInvestment":
      return { stocks: [] };
    case "playbook":
      return { playbook: [] };
    default:
      return { list: [] };
  }
}

/**
 * Create the 16 default sections for a user (spec §5.5.5, Option B — direct
 * DB write, mirrors the widget microservice `addInitialSections` command).
 *
 * - Dedup on `{ userId, type }` — a section is only created if none exists.
 * - `order = totalSections(userId) + 1` (incremented per created section).
 * - `isInitial = true` → no push notification is sent (matches source).
 *
 * Best-effort: never throws (a failing section insert is just logged).
 */
export async function addInitialSections(userId: string): Promise<void> {
  if (!userId) return;

  let order = await countSections({ userId });

  for (const { name, type } of INITIAL_SECTIONS) {
    const existing = await findSection({ userId, type });
    if (existing) continue; // dedup — already exists

    order += 1;
    const section: SectionEntity = {
      userId,
      name,
      type,
      status: "public",
      privacy: "public",
      data: getInitialSectionData(type),
      order,
      isInitial: true,
      createdOn: Date.now(),
    };

    try {
      await insertSection(section);
    } catch (err) {
      console.error("[sections] addInitialSections insert error:", err);
    }
  }
}

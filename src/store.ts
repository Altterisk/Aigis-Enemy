// Zustand store for cross-navigation UI preferences (NOT filter/search
// state -- that lives in the URL via useSearchParams so back/forward and
// shared links restore it; this is for things like "is the filter panel
// expanded" that should persist across page navigation but aren't part of
// the shareable URL). Persisted to localStorage so it also survives a
// full reload.
import { create } from "zustand";
import { persist } from "zustand/middleware";

// one selected unit on the /costgen page (palette slot, tier/skill choice,
// per-unit slider/toggle values) -- lives here so leaving the page and
// coming back (or a reload) keeps the comparison setup.
export interface CostGenSel {
  id: number;
  color: number; // palette slot, fixed while selected
  tier: number; // index into tiers
  slot: "base" | "class_evolved" | "awakened";
  sliders: Record<string, number>;
  toggles: Record<string, boolean>;
  costOverride: string; // "" = computed
}

interface UiState {
  unitFiltersOpen: boolean;
  setUnitFiltersOpen: (open: boolean) => void;
  costgenSels: CostGenSel[];
  setCostgenSels: (sels: CostGenSel[] | ((cur: CostGenSel[]) => CostGenSel[])) => void;
  costgenCdr: number;
  setCostgenCdr: (v: number) => void;
  costgenSeconds: number;
  setCostgenSeconds: (v: number) => void;
  costgenIgnoreCosts: boolean;
  setCostgenIgnoreCosts: (v: boolean) => void;
  costgenIgnoreInitial: boolean;
  setCostgenIgnoreInitial: (v: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      unitFiltersOpen: false,
      setUnitFiltersOpen: (open) => set({ unitFiltersOpen: open }),
      costgenSels: [],
      setCostgenSels: (sels) =>
        set((s) => ({ costgenSels: typeof sels === "function" ? sels(s.costgenSels) : sels })),
      costgenCdr: 0,
      setCostgenCdr: (v) => set({ costgenCdr: v }),
      costgenSeconds: 180,
      setCostgenSeconds: (v) => set({ costgenSeconds: v }),
      costgenIgnoreCosts: false,
      setCostgenIgnoreCosts: (v) => set({ costgenIgnoreCosts: v }),
      costgenIgnoreInitial: false,
      setCostgenIgnoreInitial: (v) => set({ costgenIgnoreInitial: v }),
    }),
    { name: "aigis-ui-store" }
  )
);

// Zustand store for persistent browser-local state. Shareable filter/search
// state lives in the URL; page preferences, simulator selections, and the
// collection checklist live here so they survive navigation and reloads.
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
  collectionOwned: number[];
  setCollectionOwned: (ids: number[] | ((cur: number[]) => number[])) => void;
  collectionPrinceDots: number[];
  setCollectionPrinceDots: (ids: number[] | ((cur: number[]) => number[])) => void;
  collectionHall: Record<number, number>;
  setCollectionHall: (
    states: Record<number, number> | ((cur: Record<number, number>) => Record<number, number>)
  ) => void;
  collectionBondDone: number[];
  setCollectionBondDone: (ids: number[] | ((cur: number[]) => number[])) => void;
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
      collectionOwned: [],
      setCollectionOwned: (ids) =>
        set((s) => ({ collectionOwned: typeof ids === "function" ? ids(s.collectionOwned) : ids })),
      collectionPrinceDots: [],
      setCollectionPrinceDots: (ids) =>
        set((s) => ({
          collectionPrinceDots: typeof ids === "function" ? ids(s.collectionPrinceDots) : ids,
        })),
      collectionHall: {},
      setCollectionHall: (states) =>
        set((s) => ({
          collectionHall: typeof states === "function" ? states(s.collectionHall) : states,
        })),
      collectionBondDone: [],
      setCollectionBondDone: (ids) =>
        set((s) => ({
          collectionBondDone: typeof ids === "function" ? ids(s.collectionBondDone) : ids,
        })),
    }),
    { name: "aigis-ui-store" }
  )
);

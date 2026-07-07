// Zustand store for cross-navigation UI preferences (NOT filter/search
// state -- that lives in the URL via useSearchParams so back/forward and
// shared links restore it; this is for things like "is the filter panel
// expanded" that should persist across page navigation but aren't part of
// the shareable URL). Persisted to localStorage so it also survives a
// full reload.
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  unitFiltersOpen: boolean;
  setUnitFiltersOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      unitFiltersOpen: false,
      setUnitFiltersOpen: (open) => set({ unitFiltersOpen: open }),
    }),
    { name: "aigis-ui-store" }
  )
);

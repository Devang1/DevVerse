import { create } from "zustand";
import type { DeveloperCity, GitHubRepo } from "@/lib/github-world";

type KingdomState = {
  cities: DeveloperCity[];
  activeCity: string | null;
  selected: string;
  selectedRepo: GitHubRepo | null;
  selectedCity: DeveloperCity | null;
  isLoading: boolean;
  error: string | null;
  setCities: (cities: DeveloperCity[]) => void;
  setActiveCity: (activeCity: string) => void;
  setSelected: (selected: string) => void;
  setSelectedRepo: (selectedRepo: GitHubRepo | null) => void;
  setSelectedCity: (selectedCity: DeveloperCity | null) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
};

export const useKingdomStore = create<KingdomState>((set) => ({
  cities: [],
  activeCity: null,
  selected: "World map",
  selectedRepo: null,
  selectedCity: null,
  isLoading: true,
  error: null,
  setCities: (cities) =>
    set((state) => ({
      cities,
      activeCity: cities.some((city) => city.login === state.activeCity) ? state.activeCity : cities[0]?.login ?? null
    })),
  setActiveCity: (activeCity) => set({ activeCity, selected: `${activeCity}'s city`, selectedRepo: null, selectedCity: null }),
  setSelected: (selected) => set({ selected }),
  setSelectedRepo: (selectedRepo) =>
    set({ selectedRepo, selectedCity: null, selected: selectedRepo ? `${selectedRepo.name} repository` : "World map" }),
  setSelectedCity: (selectedCity) =>
    set({
      selectedCity,
      selectedRepo: null,
      activeCity: selectedCity?.login ?? null,
      selected: selectedCity ? `${selectedCity.name} city hall` : "World map"
    }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error })
}));

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type InventoryTileSize = "compact" | "standard" | "large";
export type ColorTheme = "guardian" | "abyss" | "crimson" | "frost" | "light";

const THEME_COLOR_META: Record<ColorTheme, string> = {
  guardian: "#090a0c",
  abyss: "#090a0c",
  crimson: "#090a0c",
  frost: "#090a0c",
  light: "#f2f4f7",
};

export const COLOR_THEMES: ReadonlyArray<{
  value: ColorTheme;
  label: string;
  description: string;
  swatch: string;
}> = [
  { value: "guardian", label: "守护者金", description: "经典的金色导航强调", swatch: "#d7b35e" },
  { value: "abyss", label: "深渊蓝绿", description: "冷静的深海青色调", swatch: "#57c4c2" },
  { value: "crimson", label: "猩红蜂巢", description: "克制的猩红战术色", swatch: "#e47a68" },
  { value: "frost", label: "冰霜星界", description: "清透的冰蓝银色调", swatch: "#8ab8e8" },
  { value: "light", label: "曙光亮色", description: "明亮的浅色工作区", swatch: "#f3f5f7" },
];

interface UiState {
  mobileNavOpen: boolean;
  showReasoning: boolean;
  autoScroll: boolean;
  compactMessages: boolean;
  sessionSidebarCollapsed: boolean;
  inventoryPanelWidth: number;
  inventoryTileSize: InventoryTileSize;
  colorTheme: ColorTheme;
  setMobileNavOpen: (open: boolean) => void;
  setPreference: (key: "showReasoning" | "autoScroll" | "compactMessages", value: boolean) => void;
  setSessionSidebarCollapsed: (collapsed: boolean) => void;
  toggleSessionSidebar: () => void;
  setInventoryPanelWidth: (width: number) => void;
  setInventoryTileSize: (size: InventoryTileSize) => void;
  setColorTheme: (theme: ColorTheme) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      mobileNavOpen: false,
      showReasoning: false,
      autoScroll: true,
      compactMessages: false,
      sessionSidebarCollapsed: false,
      inventoryPanelWidth: 356,
      inventoryTileSize: "compact",
      colorTheme: "guardian",
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      setPreference: (key, value) => set({ [key]: value }),
      setSessionSidebarCollapsed: (sessionSidebarCollapsed) => set({ sessionSidebarCollapsed }),
      toggleSessionSidebar: () => set((state) => ({ sessionSidebarCollapsed: !state.sessionSidebarCollapsed })),
      setInventoryPanelWidth: (inventoryPanelWidth) => set({ inventoryPanelWidth }),
      setInventoryTileSize: (inventoryTileSize) => set({ inventoryTileSize }),
      setColorTheme: (colorTheme) => set({ colorTheme }),
    }),
    {
      name: "destiny-webui-ui",
      partialize: (state) => ({
        showReasoning: state.showReasoning,
        autoScroll: state.autoScroll,
        compactMessages: state.compactMessages,
        sessionSidebarCollapsed: state.sessionSidebarCollapsed,
        inventoryPanelWidth: state.inventoryPanelWidth,
        inventoryTileSize: state.inventoryTileSize,
        colorTheme: state.colorTheme,
      }),
    },
  ),
);

function syncThemeColor(theme: ColorTheme) {
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR_META[theme]);
}

syncThemeColor(useUiStore.getState().colorTheme);
useUiStore.subscribe((state, previous) => {
  if (state.colorTheme !== previous.colorTheme) syncThemeColor(state.colorTheme);
});

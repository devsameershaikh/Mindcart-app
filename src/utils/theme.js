// Modern indigo/teal design system — card-based, soft shadows, rounded.
export const DARK = {
  bg: "#12131D",
  surface: "#1B1C2B",
  surface2: "#242539",
  border: "#2E3046",
  text: "#F0F1FA",
  muted: "#9297B5",
  accent: "#6366F1",       // indigo — primary
  accent2: "#2DD4BF",      // teal — secondary / success
  accentSoft: "#6366F122",
  accent2Soft: "#2DD4BF22",
  danger: "#F87171",
  dangerSoft: "#F8717122",
  shadow: "rgba(0,0,0,0.35)",
};

export const LIGHT = {
  bg: "#F4F5FB",
  surface: "#FFFFFF",
  surface2: "#F0F1FA",
  border: "#E5E7F5",
  text: "#1E2033",
  muted: "#767B94",
  accent: "#4F46E5",       // indigo — primary
  accent2: "#0D9488",      // teal — secondary / success
  accentSoft: "#4F46E512",
  accent2Soft: "#0D948814",
  danger: "#DC2626",
  dangerSoft: "#DC262614",
  shadow: "rgba(79,70,229,0.12)",
};

export function getTheme(isDark) {
  return isDark ? DARK : LIGHT;
}

// Shared design tokens used across the redesigned screens.
export const RADIUS = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 };
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export function cardShadow(t) {
  return {
    shadowColor: t.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  };
}

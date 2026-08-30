export const DARK = {
  bg: "#12141A",
  surface: "#1B1F27",
  surface2: "#232834",
  border: "#2C313D",
  text: "#EDEFF3",
  muted: "#8B92A3",
  accent: "#1FAD5C",
  accent2: "#F0A83A",
  danger: "#E5555E",
};

export const LIGHT = {
  bg: "#FAF8F4",
  surface: "#FFFFFF",
  surface2: "#F1EEE6",
  border: "#E3DECF",
  text: "#20221F",
  muted: "#767267",
  accent: "#1B9552",
  accent2: "#C97F17",
  danger: "#C6444C",
};

export function getTheme(isDark) {
  return isDark ? DARK : LIGHT;
}

export const UNITS = ["kg", "g", "litre", "ml", "packet", "piece", "dozen"];

export const CATEGORIES = [
  "Kitchen",
  "Vegetables",
  "Fruits",
  "Dairy",
  "Bakery",
  "Grains & Pulses",
  "Spices & Masala",
  "Oil & Ghee",
  "Snacks",
  "Beverages",
  "Breakfast",
  "Frozen Food",
  "Personal Care",
  "Cleaning",
  "Baby Care",
  "Pet Care",
  "Other",
];

const ICON_RULES = [
  [["tea", "chai"], "🍵"],
  [["coffee"], "☕"],
  [["biscuit", "cookie"], "🍪"],
  [["shakkar", "sugar"], "🧂"],
  [["milk"], "🥛"],
  [["oil"], "🛢️"],
  [["rice"], "🍚"],
  [["atta", "flour"], "🌾"],
  [["soap"], "🧼"],
  [["shampoo"], "🧴"],
  [["bread"], "🍞"],
  [["egg"], "🥚"],
  [["salt"], "🧂"],
  [["dal", "lentil"], "🫘"],
  [["detergent", "surf"], "🫧"],
  [["toothpaste", "brush"], "🪥"],
  [["fruit", "apple", "banana"], "🍎"],
  [["vegetable"], "🥦"],
  [["ghee"], "🧈"],
  [["masala", "spice"], "🌶️"],
  [["towel", "bedsheet"], "🛏️"],
  [["curtain"], "🪟"],
];

export function getIcon(name) {
  const n = name.toLowerCase();
  for (const [keys, icon] of ICON_RULES) {
    if (keys.some((k) => n.includes(k))) return icon;
  }
  return "🛒";
}

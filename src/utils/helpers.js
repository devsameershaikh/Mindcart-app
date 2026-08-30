// utils/helpers.js — pure logic ported verbatim from the web app's App.jsx.
// None of this is platform-specific, so it moves over unchanged.

export const UNITS = ["kg", "g", "litre", "ml", "packet", "piece", "dozen"];

const ICON_RULES = [
  [["tea", "chai"], "🍵"], [["coffee"], "☕"], [["biscuit", "cookie"], "🍪"],
  [["shakkar", "sugar"], "🧂"], [["milk"], "🥛"], [["oil"], "🛢️"],
  [["rice"], "🍚"], [["atta", "flour"], "🌾"], [["soap"], "🧼"],
  [["shampoo"], "🧴"], [["bread"], "🍞"], [["egg"], "🥚"], [["salt"], "🧂"],
  [["dal", "lentil"], "🫘"], [["detergent", "surf"], "🫧"], [["toothpaste", "brush"], "🪥"],
  [["fruit", "apple", "banana"], "🍎"], [["vegetable"], "🥦"], [["ghee"], "🧈"],
  [["masala", "spice"], "🌶️"], [["towel", "bedsheet"], "🛏️"], [["curtain"], "🪟"],
];
export function getIcon(name) {
  const n = name.toLowerCase();
  for (const [keys, icon] of ICON_RULES) if (keys.some((k) => n.includes(k))) return icon;
  return "🛒";
}

// ---------- Category auto-suggest (grocery-flavoured, harmless for other list types) ----------
const CATEGORY_RULES = [
  [["milk", "curd", "paneer", "cheese", "yogurt", "yoghurt", "butter"], "Dairy"],
  [["tea", "chai", "coffee", "juice", "cola", "soda", "drink"], "Beverages"],
  [["rice", "atta", "flour", "dal", "lentil", "wheat", "besan"], "Grains & Pulses"],
  [["oil", "ghee"], "Oil & Ghee"],
  [["masala", "spice", "salt", "chilli", "chili", "turmeric", "jeera"], "Spices & Masala"],
  [["bread", "bun", "cake", "pastry", "pav"], "Bakery"],
  [["biscuit", "cookie", "chips", "namkeen", "snack", "kurkure"], "Snacks"],
  [["apple", "banana", "mango", "orange", "grape", "fruit"], "Fruits"],
  [["onion", "potato", "tomato", "vegetable", "veggie", "carrot", "spinach"], "Vegetables"],
  [["soap", "shampoo", "toothpaste", "toothbrush", "lotion", "deodorant", "razor"], "Personal Care"],
  [["detergent", "surf", "cleaner", "phenyl", "dishwash", "harpic"], "Cleaning"],
  [["diaper", "baby"], "Baby Care"],
  [["pet", "dog food", "cat food"], "Pet Care"],
  [["frozen"], "Frozen Food"],
  [["cereal", "oats", "muesli", "cornflakes"], "Breakfast"],
  [["egg", "sugar", "shakkar"], "Kitchen"],
];
export function suggestCategory(name) {
  const n = name.toLowerCase();
  for (const [keys, cat] of CATEGORY_RULES) if (keys.some((k) => n.includes(k))) return cat;
  return null;
}

// ---------- Validation helpers ----------
export function validateListName(name, lists, excludeId = null) {
  const trimmed = name.trim();
  if (!trimmed) return "List name can't be empty.";
  if (trimmed.length > 40) return "List name is too long (max 40 characters).";
  const dup = lists.some((l) => l.id !== excludeId && l.name.trim().toLowerCase() === trimmed.toLowerCase());
  if (dup) return `A list called "${trimmed}" already exists.`;
  return "";
}
export function validateItemName(name, category, items, excludeId = null) {
  const trimmed = name.trim();
  if (!trimmed) return "Item name can't be empty.";
  if (trimmed.length > 40) return "Item name is too long (max 40 characters).";
  const dup = items.some(
    (i) => i.id !== excludeId && i.category === category && i.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (dup) return `"${trimmed}" is already in ${category}.`;
  return "";
}
export function clampQty(qty) {
  const n = Math.floor(Number(qty));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 999) return 999;
  return n;
}
export function clampPrice(price) {
  console.log("clampPrice", price);
  if (price === "" || price === null || price === undefined) return "";
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return "";
  return Math.round(Math.min(n, 100000) * 100) / 100;
}
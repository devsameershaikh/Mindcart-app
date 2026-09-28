// suggestions.js — on-device autocomplete for the Add Item box.
// No network: instant, works offline, and learns from what the user has
// already added on ANY of their lists (history ranks above the built-in catalog).

// [name, category, unit] — categories/units must exist in CATEGORIES / UNITS.
const CATALOG = [
  // Dairy
  ["Milk", "Dairy", "liter"], ["Curd", "Dairy", "packet"], ["Paneer", "Dairy", "packet"],
  ["Butter", "Dairy", "pack"], ["Cheese", "Dairy", "pack"], ["Cream", "Dairy", "packet"],
  ["Buttermilk", "Dairy", "packet"], ["Yogurt", "Dairy", "pack"],
  // Vegetables
  ["Onion", "Vegetables", "kg"], ["Potato", "Vegetables", "kg"], ["Tomato", "Vegetables", "kg"],
  ["Carrot", "Vegetables", "kg"], ["Spinach", "Vegetables", "piece"], ["Cauliflower", "Vegetables", "piece"],
  ["Cabbage", "Vegetables", "piece"], ["Capsicum", "Vegetables", "kg"], ["Cucumber", "Vegetables", "kg"],
  ["Green Chilli", "Vegetables", "g"], ["Coriander", "Vegetables", "piece"], ["Ginger", "Vegetables", "g"],
  ["Garlic", "Vegetables", "g"], ["Lemon", "Vegetables", "piece"], ["Brinjal", "Vegetables", "kg"],
  ["Ladyfinger", "Vegetables", "kg"], ["Peas", "Vegetables", "kg"], ["Beans", "Vegetables", "kg"],
  // Fruits
  ["Banana", "Fruits", "dozen"], ["Apple", "Fruits", "kg"], ["Mango", "Fruits", "kg"],
  ["Orange", "Fruits", "kg"], ["Grapes", "Fruits", "kg"], ["Papaya", "Fruits", "piece"],
  ["Watermelon", "Fruits", "piece"], ["Pomegranate", "Fruits", "kg"], ["Pineapple", "Fruits", "piece"],
  // Grains & Pulses
  ["Rice", "Grains & Pulses", "kg"], ["Basmati Rice", "Grains & Pulses", "kg"], ["Atta", "Grains & Pulses", "kg"],
  ["Maida", "Grains & Pulses", "kg"], ["Besan", "Grains & Pulses", "kg"], ["Sooji", "Grains & Pulses", "kg"],
  ["Toor Dal", "Grains & Pulses", "kg"], ["Moong Dal", "Grains & Pulses", "kg"], ["Chana Dal", "Grains & Pulses", "kg"],
  ["Masoor Dal", "Grains & Pulses", "kg"], ["Urad Dal", "Grains & Pulses", "kg"], ["Rajma", "Grains & Pulses", "kg"],
  ["Chickpeas", "Grains & Pulses", "kg"], ["Poha", "Grains & Pulses", "kg"], ["Sabudana", "Grains & Pulses", "kg"],
  // Spices & Masala
  ["Salt", "Spices & Masala", "kg"], ["Turmeric Powder", "Spices & Masala", "packet"], ["Red Chilli Powder", "Spices & Masala", "packet"],
  ["Coriander Powder", "Spices & Masala", "packet"], ["Garam Masala", "Spices & Masala", "packet"], ["Jeera", "Spices & Masala", "packet"],
  ["Mustard Seeds", "Spices & Masala", "packet"], ["Black Pepper", "Spices & Masala", "packet"], ["Cardamom", "Spices & Masala", "packet"],
  ["Hing", "Spices & Masala", "packet"], ["Tea Masala", "Spices & Masala", "packet"],
  // Oil & Ghee
  ["Sunflower Oil", "Oil & Ghee", "liter"], ["Mustard Oil", "Oil & Ghee", "liter"], ["Groundnut Oil", "Oil & Ghee", "liter"],
  ["Olive Oil", "Oil & Ghee", "bottle"], ["Ghee", "Oil & Ghee", "pack"],
  // Bakery
  ["Bread", "Bakery", "packet"], ["Pav", "Bakery", "packet"], ["Bun", "Bakery", "packet"], ["Cake", "Bakery", "piece"],
  // Snacks
  ["Biscuits", "Snacks", "packet"], ["Chips", "Snacks", "packet"], ["Namkeen", "Snacks", "packet"],
  ["Kurkure", "Snacks", "packet"], ["Popcorn", "Snacks", "packet"], ["Chocolate", "Snacks", "piece"],
  ["Peanuts", "Snacks", "packet"], ["Almonds", "Snacks", "pack"], ["Cashew", "Snacks", "pack"], ["Raisins", "Snacks", "pack"],
  // Beverages
  ["Tea", "Beverages", "packet"], ["Coffee", "Beverages", "jar"], ["Cold Drink", "Beverages", "bottle"],
  ["Juice", "Beverages", "carton"], ["Mineral Water", "Beverages", "bottle"], ["Green Tea", "Beverages", "box"],
  // Breakfast
  ["Cornflakes", "Breakfast", "box"], ["Oats", "Breakfast", "pack"], ["Muesli", "Breakfast", "pack"],
  ["Jam", "Breakfast", "jar"], ["Peanut Butter", "Breakfast", "jar"], ["Honey", "Breakfast", "bottle"],
  // Kitchen
  ["Sugar", "Kitchen", "kg"], ["Jaggery", "Kitchen", "kg"], ["Eggs", "Kitchen", "dozen"],
  ["Tissue Paper", "Kitchen", "pack"], ["Aluminium Foil", "Kitchen", "piece"], ["Garbage Bags", "Kitchen", "pack"],
  // Frozen
  ["Frozen Peas", "Frozen Food", "packet"], ["Ice Cream", "Frozen Food", "box"], ["French Fries", "Frozen Food", "packet"],
  // Personal Care
  ["Soap", "Personal Care", "piece"], ["Shampoo", "Personal Care", "bottle"], ["Toothpaste", "Personal Care", "piece"],
  ["Toothbrush", "Personal Care", "piece"], ["Body Lotion", "Personal Care", "bottle"], ["Face Wash", "Personal Care", "piece"],
  ["Deodorant", "Personal Care", "piece"], ["Razor", "Personal Care", "pack"], ["Sanitary Pads", "Personal Care", "pack"],
  ["Hair Oil", "Personal Care", "bottle"],
  // Cleaning
  ["Detergent", "Cleaning", "kg"], ["Dishwash Liquid", "Cleaning", "bottle"], ["Floor Cleaner", "Cleaning", "bottle"],
  ["Toilet Cleaner", "Cleaning", "bottle"], ["Handwash", "Cleaning", "bottle"], ["Phenyl", "Cleaning", "bottle"],
  ["Scrub Pad", "Cleaning", "pack"],
  // Baby / Pet
  ["Diapers", "Baby Care", "pack"], ["Baby Wipes", "Baby Care", "pack"], ["Baby Powder", "Baby Care", "piece"],
  ["Dog Food", "Pet Care", "kg"], ["Cat Food", "Pet Care", "kg"],
];

const norm = (s) => String(s || "").trim().toLowerCase();

// Build "what this user usually adds" from every list they have.
// itemsByList shape: { [listId]: { [itemId]: item } }
export function buildHistory(itemsByList) {
  const seen = new Map();
  for (const map of Object.values(itemsByList || {})) {
    for (const it of Object.values(map || {})) {
      if (!it || !it.name) continue;
      const key = norm(it.name);
      const prev = seen.get(key);
      if (prev) prev.count += 1;
      else seen.set(key, { name: it.name, category: it.category, unit: it.unit, count: 1, fromHistory: true });
    }
  }
  return Array.from(seen.values());
}

// Suggestions for the segment currently being typed.
//  - query:        text after the last comma
//  - history:      output of buildHistory()
//  - existingKeys: Set of `${category}|${lowercased name}` already on THIS list
export function getSuggestions(query, history = [], existingKeys = new Set(), limit = 6) {
  const q = norm(query);
  if (q.length < 1) return [];

  const pool = [
    ...history,
    ...CATALOG.map(([name, category, unit]) => ({ name, category, unit, count: 0, fromHistory: false })),
  ];

  const scored = [];
  const dedupe = new Set();
  for (const c of pool) {
    const n = norm(c.name);
    if (dedupe.has(n)) continue;
    if (n === q) continue; // already typed in full -> nothing to suggest
    if (existingKeys.has(`${c.category}|${n}`)) continue; // would be rejected as a duplicate

    let score = -1;
    if (n.startsWith(q)) score = 3;
    else if (n.split(/[\s&-]+/).some((w) => w.startsWith(q))) score = 2; // "dal" -> "Toor Dal"
    else if (q.length >= 3 && n.includes(q)) score = 1;
    if (score < 0) continue;

    dedupe.add(n);
    scored.push({ ...c, score: score * 10 + (c.fromHistory ? 5 : 0) + Math.min(c.count, 4) });
  }
  scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
  return scored.slice(0, limit);
}
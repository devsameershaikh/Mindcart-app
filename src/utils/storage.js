// storage.js — local-first persistence layer for D-Mart List (Expo / React Native)
//
// This is the ONLY place that talks to a storage medium. Here that medium is
// AsyncStorage (device-local key/value storage). If/when this app needs cloud
// sync, only this file (plus the load/save calls in App.js) needs to change —
// the rest of the app just calls loadState()/saveState() and never touches
// AsyncStorage directly.
//
// Everything is stored under a single key as one JSON blob so a read/write
// is effectively atomic and there's exactly one schema to migrate.

import AsyncStorage from "@react-native-async-storage/async-storage";

export const SCHEMA_VERSION = 1;
const STORAGE_KEY = "dmart_app_state_v1";

export const DEFAULT_CATEGORIES = [
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

export const DEFAULT_LIST_ID = "list_groceries";

// Seeded into every brand-new user's first "Groceries" list so the app
// isn't a blank screen on first launch. Names/categories/units line up
// with suggestCategory()/getIcon() in utils/helpers.js so these render
// with the right icon and land in the right category immediately.
// IMPORTANT: keep this in sync with the DEFAULT_ITEMS list in the
// backend's src/routes/auth.js — that's what actually seeds Neon on
// first sign-up; this copy only seeds the local, pre-sign-in placeholder
// list so offline-first launch looks the same before an account exists.
export const DEFAULT_ITEMS = [
  { name: "Milk", category: "Dairy", unit: "liter" },
  { name: "Rice", category: "Grains & Pulses", unit: "kg" },
  { name: "Sugar", category: "Kitchen", unit: "kg" },
  { name: "Cooking Oil", category: "Oil & Ghee", unit: "liter" },
  { name: "Wheat Flour (Atta)", category: "Grains & Pulses", unit: "kg" },
  { name: "Salt", category: "Spices & Masala", unit: "kg" },
  { name: "Tea", category: "Beverages", unit: "packet" },
  { name: "Onion", category: "Vegetables", unit: "kg" },
];

// function makeId(prefix = "id") {
//   return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
// }
// export { makeId };

// function defaultState() {
//   return {
//     schemaVersion: SCHEMA_VERSION,
//     profile: { name: "" }, // optional, local only — never required to use the app
//     theme: "dark", // "dark" | "light"
//     selectedListId: DEFAULT_LIST_ID,
//     lists: [
//       { id: DEFAULT_LIST_ID, name: "Groceries", createdAt: Date.now() },
//     ],
//     // items live per-list so each list is an independent, reusable master list
//     itemsByList: {
//       [DEFAULT_LIST_ID]: [],
//     },
//     categories: DEFAULT_CATEGORIES,
//     preferences: {},
//   };
// }
function makeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export { makeId };

function defaultState() {
  const defaultListId = makeId("list");
  const now = Date.now();

  // Seed items keyed by id, matching the { itemId: item } shape App.js
  // keeps itemsByList in (see the one-time array->map migration in
  // App.js's load effect) so a first-ever launch never has to pass
  // through the legacy array shape at all.
  const seededItems = {};
  DEFAULT_ITEMS.forEach((it, i) => {
    const id = makeId("item");
    seededItems[id] = {
      id,
      name: it.name,
      category: it.category,
      unit: it.unit,
      qty: 0,
      price: "",
      checked: false,
      skipped: false,
      note: "",
      createdAt: now + i, // stable relative order
    };
  });

  return {
    schemaVersion: SCHEMA_VERSION,

    profile: {
      name: "",
    },

    theme: "dark",

    selectedListId: defaultListId,

    lists: [
      {
        id: defaultListId,
        name: "Groceries",
        createdAt: now,
        // Marks this as the auto-generated placeholder created before any
        // account exists, so App.js's sign-in merge can tell it apart
        // from a list the user actually made themselves. Once signed in,
        // an account either already has this same seeded list from the
        // backend (see auth.js DEFAULT_ITEMS) or has other cloud lists —
        // either way this placeholder should be dropped rather than
        // migrated up as a duplicate.
        isDefaultSeed: true,
      },
    ],

    itemsByList: {
      [defaultListId]: seededItems,
    },

    categories: DEFAULT_CATEGORIES,

    preferences: {},
  };
}

// Migration ladder — add a `if (state.schemaVersion < N) { ...upgrade...; state.schemaVersion = N; }`
// block here for every future schema bump. Keeping old data intact is the point.
function migrate(state) {
  if (!state || typeof state !== "object") return defaultState();
  const d = defaultState();

  let migrated = { ...d, ...state };

  if (!migrated.schemaVersion) migrated.schemaVersion = 1;

  // Defensive fallbacks in case of partially-written/corrupt data.
  if (!Array.isArray(migrated.lists) || migrated.lists.length === 0) {
    migrated.lists = d.lists;
  }
  if (!migrated.itemsByList || typeof migrated.itemsByList !== "object") {
    migrated.itemsByList = d.itemsByList;
  }
  // Make sure every list has an items bucket. Accepts EITHER shape here —
  // the legacy array form or the current `{ itemId: item }` map form (see
  // the one-time array->map conversion in App.js's load effect) — and
  // only replaces it with an empty array when it's missing/corrupt.
  // Previously this only accepted arrays, which meant every list's items
  // got silently reset to `[]` on the very next app launch after the
  // array->map migration ran once (since a map is not an array) — wiping
  // saved items (including these seeded defaults) on every restart.
  for (const list of migrated.lists) {
    const bucket = migrated.itemsByList[list.id];
    const isValidBucket = Array.isArray(bucket) || (bucket && typeof bucket === "object");
    if (!isValidBucket) {
      migrated.itemsByList[list.id] = [];
    }
  }
  if (!Array.isArray(migrated.categories) || migrated.categories.length === 0) {
    migrated.categories = d.categories;
  }
  if (!migrated.selectedListId || !migrated.lists.some((l) => l.id === migrated.selectedListId)) {
    migrated.selectedListId = migrated.lists[0].id;
  }
  if (!migrated.profile || typeof migrated.profile !== "object") migrated.profile = d.profile;
  if (migrated.theme !== "dark" && migrated.theme !== "light") migrated.theme = d.theme;
  if (!migrated.preferences || typeof migrated.preferences !== "object") migrated.preferences = {};

  return migrated;
}

// In-memory fallback for the (rare) case AsyncStorage throws. Data won't
// survive a real restart there, but the app keeps working for the session
// instead of crashing.
let memoryState = null;
let persistent = true;

export async function loadState() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    persistent = true;
    const parsed = raw ? JSON.parse(raw) : null;
    return migrate(parsed);
  } catch (e) {
    console.error("loadState: failed to read AsyncStorage", e);
    persistent = false;
    return migrate(memoryState);
  }
}

export async function saveState(state) {
  const toSave = { ...state, schemaVersion: SCHEMA_VERSION };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    persistent = true;
    return true;
  } catch (e) {
    console.error("saveState: failed to write AsyncStorage", e);
    persistent = false;
    memoryState = toSave;
    return false;
  }
}

export function isPersistent() {
  return persistent;
}
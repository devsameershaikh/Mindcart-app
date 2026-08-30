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

function makeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
export { makeId };

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { name: "" }, // optional, local only — never required to use the app
    theme: "dark", // "dark" | "light"
    selectedListId: DEFAULT_LIST_ID,
    lists: [
      { id: DEFAULT_LIST_ID, name: "Groceries", createdAt: Date.now() },
    ],
    // items live per-list so each list is an independent, reusable master list
    itemsByList: {
      [DEFAULT_LIST_ID]: [],
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
  // Make sure every list has an items bucket.
  for (const list of migrated.lists) {
    if (!Array.isArray(migrated.itemsByList[list.id])) {
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
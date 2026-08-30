import React, { useState, useEffect, useRef, useMemo } from "react";
// NEW DEPENDENCIES — run this before testing:
//   npx expo install expo-camera expo-notifications
// Both permissions (camera, notifications) are requested at runtime where
// they're used below (openScanner / toggleReminders) — Expo Go handles that
// fine; a production build should still add the expo-camera and
// expo-notifications config plugins to app.json per their docs.
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Notifications from "expo-notifications";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  StatusBar,
  Image,
  Animated,
  Linking,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Plus, Trash2, Moon, SunMedium, Search, Settings, ChevronDown, Check,
  FileDown, Home, ListPlus, EyeOff, RotateCcw, Pencil, X, ListChecks,
  Barcode, Bell, Menu, BellRing, Info, Mail, ShieldCheck, FileText,
  ChevronRight,
} from "lucide-react-native";

import { loadState, saveState, DEFAULT_CATEGORIES, makeId } from "./src/utils/storage";
import { getTheme } from "./src/utils/theme";
import { UNITS, getIcon, suggestCategory, validateListName, validateItemName, clampQty, clampPrice } from "./src/utils/helpers";
import { exportListPdf } from "./src/utils/exportpdf";
import CategorySelect from "./src/components/Categoryselect";
import SimpleSelect from "./src/components/Simpleselect";

// This app is local-first: everything lives in on-device storage (see
// storage.js). There is no login, no backend, and no network calls for
// list/item data. storage.js is the single seam where cloud sync could be
// added later without touching the rest of this file.

// ---------- Currency ----------
// Symbol-only: picking a currency just changes the label shown next to
// prices everywhere in the app. There's no conversion or exchange rate
// involved — a price the user typed under "$" stays the same number if
// they later switch the label to "€".
const CURRENCIES = [
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "SAR", symbol: "﷼", name: "Saudi Riyal" },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "MXN", symbol: "Mex$", name: "Mexican Peso" },
  { code: "RUB", symbol: "₽", name: "Russian Ruble" },
  { code: "KRW", symbol: "₩", name: "South Korean Won" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah" },
  { code: "PKR", symbol: "₨", name: "Pakistani Rupee" },
  { code: "BDT", symbol: "৳", name: "Bangladeshi Taka" },
  { code: "LKR", symbol: "Rs", name: "Sri Lankan Rupee" },
  { code: "NPR", symbol: "Rs", name: "Nepalese Rupee" },
  { code: "THB", symbol: "฿", name: "Thai Baht" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit" },
  { code: "PHP", symbol: "₱", name: "Philippine Peso" },
  { code: "VND", symbol: "₫", name: "Vietnamese Dong" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira" },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira" },
  { code: "EGP", symbol: "E£", name: "Egyptian Pound" },
];
const DEFAULT_CURRENCY = CURRENCIES[0];

// ---------- About screen content ----------
// Edit these to match your actual details before publishing.
const APP_VERSION = "1.0.0";
const DEVELOPER_NAME = "Sameer Shaikh";
const PRIVACY_POLICY_URL = "https://example.com/privacy-policy";
const CONTACT_EMAIL = "support@example.com";
const OPEN_SOURCE_LIBS = [
  { name: "React Native", note: "Core app framework" },
  { name: "Expo", note: "Build & runtime tooling" },
  { name: "expo-camera", note: "Barcode scanning" },
  { name: "expo-notifications", note: "Shopping reminders" },
  { name: "react-native-safe-area-context", note: "Safe area layout" },
  { name: "lucide-react-native", note: "Icon set" },
];

// ---------- Reminders ----------
// These are local, on-device notifications only — scheduled directly by
// this app based on inactivity, never sent from a server. That means no
// push token / EAS project ID / backend is needed, just the runtime
// permission prompt (see toggleReminders below).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Replaces the old fixed IndianRupee icon with the user's chosen symbol,
// rendered like a small icon so it drops into existing icon+text rows.
function CurrencyGlyph({ symbol, color, size = 12 }) {
  return <Text style={{ color, fontSize: size, fontWeight: "800" }}>{symbol}</Text>;
}

export default function DmartApp() {
  const [appLoaded, setAppLoaded] = useState(false);
  const hydrated = useRef(false); // guards the very first save-effect run

  const [profile, setProfile] = useState({ name: "" });
  const [dark, setDark] = useState(true);

  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState(null);
  const [itemsByList, setItemsByList] = useState({});
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);

  const [tab, setTab] = useState("home");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [pendingDelete, setPendingDelete] = useState(null); // { item, timer }
  const [notice, setNotice] = useState("");

  const [exportingPdf, setExportingPdf] = useState(false);

  const [fName, setFName] = useState("");
  const [fUnit, setFUnit] = useState("packet");
  const [fCategory, setFCategory] = useState("Kitchen");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [itemNameError, setItemNameError] = useState("");
  const [noteDrafts, setNoteDrafts] = useState({});

  const [editingItemId, setEditingItemId] = useState(null);
  const [eName, setEName] = useState("");
  const [eCategory, setECategory] = useState("");
  const [eUnit, setEUnit] = useState("packet");
  const [ePrice, setEPrice] = useState("");
  const [editNameError, setEditNameError] = useState("");

  const [listsModalOpen, setListsModalOpen] = useState(false);
  const [newListModalOpen, setNewListModalOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [listNameError, setListNameError] = useState("");
  const [renamingListId, setRenamingListId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteListId, setConfirmDeleteListId] = useState(null);

  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");

  const [fPrice, setFPrice] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scanLockRef = useRef(false);

  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);

  // Android 8+ silently drops scheduled notifications without a channel —
  // this only needs to run once, it's a no-op / ignored on iOS.
  useEffect(() => {
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("default", {
        name: "Shopping reminders",
        importance: Notifications.AndroidImportance.DEFAULT,
      }).catch(() => {});
    }
  }, []);

  // ---------- Load everything from local storage once, on mount ----------
  useEffect(() => {
    (async () => {
      const state = await loadState();
      setProfile(state.profile || { name: "" });
      setDark(state.theme !== "light");
      setLists(state.lists);
      setSelectedListId(state.selectedListId);
      setItemsByList(state.itemsByList);
      setCategories(state.categories);
      setAppLoaded(true);
    })();
  }, []);

  // ---------- Persist on every change (debounced so rapid edits coalesce into one write) ----------
  useEffect(() => {
    if (!appLoaded) return;
    if (!hydrated.current) { hydrated.current = true; return; }
    const timer = setTimeout(() => {
      saveState({
        profile,
        theme: dark ? "dark" : "light",
        selectedListId,
        lists,
        itemsByList,
        categories,
        preferences: {},
      });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line
  }, [appLoaded, profile, dark, selectedListId, lists, itemsByList, categories]);

  // debounce search so filtering doesn't run on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // clear search when switching lists
  useEffect(() => {
    setSearch("");
    setDebouncedSearch("");
  }, [selectedListId]);

  // clear any pending "undo delete" timer on unmount
  useEffect(() => {
    return () => { if (pendingDelete) clearTimeout(pendingDelete.timer); };
    // eslint-disable-next-line
  }, [pendingDelete]);

  // auto-clear inline notices after a few seconds
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const t = getTheme(dark);

  // Currency lives on the profile object, which is already persisted and
  // loaded as one blob (see the load/save effects above), so no changes
  // to storage.js are needed for this to survive a restart. A profile
  // saved before this feature existed simply has no `currency` yet —
  // that's exactly the signal used below to show the first-launch picker.
  const currency = profile.currency || DEFAULT_CURRENCY;
  const needsCurrencySetup = appLoaded && !profile.currency;
  const reminderSettings = profile.reminders || { enabled: false, days: 5 };

  // items/selectedList and the useMemo below must stay ABOVE the
  // `if (!appLoaded)` early return — hooks can't be called conditionally,
  // and useMemo is a hook, so it has to run on every render regardless of
  // whether the loader is about to be shown instead.
  const items = itemsByList[selectedListId] || [];
  const selectedList = lists.find((l) => l.id === selectedListId) || lists[0];

  const derived = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const filtered = items.filter((i) => i.name.toLowerCase().includes(q));
    const searchMatch = q ? items.find((i) => i.name.toLowerCase() === q) : null;
    const itemCategories = [...new Set(items.map((i) => i.category))];
    const boughtItems = items.filter((i) => i.checked);
    const pendingItems = items.filter((i) => !i.checked && !i.skipped);
    const skippedItems = items.filter((i) => !i.checked && i.skipped);
    // price is the final amount for the whole line (not a per-unit price),
    // so totals just sum it directly — qty is informational only and does
    // not multiply into the total.
    const boughtTotal = boughtItems.reduce((s, i) => s + Number(i.price || 0), 0);
    const pendingTotal = pendingItems.reduce((s, i) => s + Number(i.price || 0), 0);
    return { filtered, searchMatch, itemCategories, boughtItems, pendingItems, skippedItems, boughtTotal, pendingTotal };
    // eslint-disable-next-line
  }, [items, debouncedSearch]);
  const { filtered, searchMatch, itemCategories, boughtItems, pendingItems, skippedItems, boughtTotal, pendingTotal } = derived;
  const noSearchResults = debouncedSearch.trim() && filtered.length === 0;

  if (!appLoaded) return <Loader t={{ bg: "#12141A", muted: "#8B92A3", accent: "#1FAD5C" }} />;

  function setListItems(listId, updater) {
    setItemsByList((prev) => ({ ...prev, [listId]: updater(prev[listId] || []) }));
  }

  // ---------- List management ----------
  function openNewListModal() {
    setNewListName("");
    setListNameError("");
    setNewListModalOpen(true);
  }
  function addList() {
    const err = validateListName(newListName, lists);
    setListNameError(err);
    if (err) return;
    const id = makeId("list");
    setLists((prev) => [...prev, { id, name: newListName.trim(), createdAt: Date.now(), lastActivityAt: Date.now() }]);
    setItemsByList((prev) => ({ ...prev, [id]: [] }));
    setSelectedListId(id);
    setNewListName("");
    setListNameError("");
    setNewListModalOpen(false);
    if (reminderSettings.enabled) scheduleReminderForList({ id, name: newListName.trim() }, Number(reminderSettings.days) || 5);
  }
  function startRenameList(list) {
    setRenamingListId(list.id);
    setRenameDraft(list.name);
    setListNameError("");
  }
  function commitRenameList() {
    const err = validateListName(renameDraft, lists, renamingListId);
    if (err) { setListNameError(err); return; }
    setLists((prev) => prev.map((l) => (l.id === renamingListId ? { ...l, name: renameDraft.trim() } : l)));
    setRenamingListId(null);
    setRenameDraft("");
    setListNameError("");
  }
  function deleteList(listId) {
    if (lists.length <= 1) {
      setNotice("You need at least one list — create another before deleting this one.");
      setConfirmDeleteListId(null);
      return;
    }
    const remaining = lists.filter((l) => l.id !== listId);
    const removed = lists.find((l) => l.id === listId);
    if (removed?.reminderNotifId) { Notifications.cancelScheduledNotificationAsync(removed.reminderNotifId).catch(() => {}); }
    setLists(remaining);
    setItemsByList((prev) => { const p = { ...prev }; delete p[listId]; return p; });
    if (selectedListId === listId) setSelectedListId(remaining[0].id);
    setConfirmDeleteListId(null);
  }
  // Budget is stored per-list (like price, as the raw string from the
  // input) so an empty field just means "no budget set" rather than 0.
  // function setListBudget(listId, value) {
  //   setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, budget: value } : l)));
  // }

  // ---------- Reminders ----------
  // Each list gets its own one-shot local notification "N days from now".
  // Any shopping activity on that list cancels the pending one and
  // re-schedules it further out — so it only ever actually fires once the
  // list has genuinely gone quiet for N days straight.
  async function scheduleReminderForList(list, days) {
    if (list.reminderNotifId) {
      try { await Notifications.cancelScheduledNotificationAsync(list.reminderNotifId); } catch {}
    }
    let id = null;
    try {
      id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "Shopping reminder",
          body: `You haven't shopped for "${list.name}" in ${days} day${days === 1 ? "" : "s"}.`,
        },
        trigger: { seconds: Math.max(1, days) * 24 * 60 * 60, channelId: "default" },
      });
    } catch {
      // scheduling can fail without permission or on unsupported platforms — safe to ignore
    }
    setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, reminderNotifId: id, lastActivityAt: Date.now() } : l)));
  }
  // Called from any action that counts as "shopping activity" on a list.
  function bumpActivity(listId) {
    if (!reminderSettings.enabled) return;
    const list = lists.find((l) => l.id === listId);
    if (list) scheduleReminderForList(list, Number(reminderSettings.days) || 5);
  }
  async function toggleReminders(nextEnabled) {
    if (nextEnabled) {
      const perm = await Notifications.requestPermissionsAsync();
      if (!perm.granted) {
        setNotice("Enable notifications for this app in system settings to get shopping reminders.");
        return;
      }
      const days = Number(reminderSettings.days) || 5;
      setProfile((prev) => ({ ...prev, reminders: { days, enabled: true } }));
      for (const l of lists) await scheduleReminderForList(l, days);
    } else {
      for (const l of lists) {
        if (l.reminderNotifId) { try { await Notifications.cancelScheduledNotificationAsync(l.reminderNotifId); } catch {} }
      }
      setProfile((prev) => ({ ...prev, reminders: { ...(prev.reminders || {}), enabled: false } }));
    }
  }
  async function updateReminderDays(value) {
    setProfile((prev) => ({ ...prev, reminders: { ...(prev.reminders || {}), enabled: prev.reminders?.enabled || false, days: value } }));
    if (reminderSettings.enabled) {
      const days = Number(value) || 5;
      for (const l of lists) await scheduleReminderForList(l, days);
    }
  }
  // Fires a few seconds from now so notification setup can be verified
  // immediately, instead of waiting days for a real reminder to trigger.
  async function sendTestNotification() {
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) {
      perm = await Notifications.requestPermissionsAsync();
    }
    if (!perm.granted) {
      setNotice("Enable notifications for this app in system settings, then try the test again.");
      return;
    }
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Test notification 🎉",
          body: "If you see this, notifications are set up correctly.",
        },
        trigger: { seconds: 3, channelId: "default" },
      });
      setNotice("Test notification sent — it should appear in about 3 seconds.");
    } catch (e) {
      setNotice(`Couldn't send the test notification: ${e?.message || "unknown error"}`);
    }
  }

  // ---------- Item management ----------
  function addItem() {
    if (!fName.trim()) return;
    const rawNames = fName.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
    if (rawNames.length === 0) return;
    const category = (fCategory || "Other").trim() || "Other";

    const seenInBatch = [];
    const errors = [];
    const toAdd = [];
    for (const name of rawNames) {
      const capped = name.length > 40 ? name.slice(0, 40) : name;
      const dupInBatch = seenInBatch.some((n) => n.toLowerCase() === capped.toLowerCase());
      const validationErr = validateItemName(capped, category, items);
      if (dupInBatch) { errors.push(`"${capped}" was entered twice.`); continue; }
      if (validationErr) { errors.push(validationErr); continue; }
      seenInBatch.push(capped);
      toAdd.push(capped);
    }

    if (toAdd.length === 0) {
      setItemNameError(errors[0] || "Enter a valid item name.");
      return;
    }
    setItemNameError("");

    const newItems = toAdd.map((name) => ({
      id: makeId("item"),
      name,
      category,
      qty: 1,
      unit: fUnit,
      price: fPrice || "",
      checked: false,
      skipped: false,
      note: "",
      createdAt: Date.now(),
    }));
    setListItems(selectedListId, (prev) => [...prev, ...newItems]);
    setFName("");
    setFPrice("");
    setCategoryTouched(false);
    if (errors.length) setNotice(errors[0]);
    bumpActivity(selectedListId);
  }

  function updateItem(id, patch) {
    if (patch.qty !== undefined) patch = { ...patch, qty: clampQty(patch.qty) };
    if (patch.price !== undefined) patch = { ...patch, price: clampPrice(patch.price) };
    setListItems(selectedListId, (prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    if (patch.checked !== undefined) bumpActivity(selectedListId);
  }

  // optimistic delete with a 5s "Undo" window
  function deleteItem(item) {
    if (pendingDelete) clearTimeout(pendingDelete.timer); 
    setListItems(selectedListId, (prev) => prev.filter((i) => i.id !== item.id));
    const timer = setTimeout(() => setPendingDelete(null), 5000);
    setPendingDelete({ item, timer });
  }
  function undoDelete() {
    if (!pendingDelete) return;
    clearTimeout(pendingDelete.timer);
    setListItems(selectedListId, (prev) => [...prev, pendingDelete.item]);
    setPendingDelete(null);
  }

  function toggleCollapse(cat) { setCollapsed((p) => ({ ...p, [cat]: !p[cat] })); }

  // ---------- Barcode scanning ----------
  async function openScanner() {
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) { setNotice("Camera permission is needed to scan barcodes."); return; }
    }
    scanLockRef.current = false;
    setScannerOpen(true);
  }
  function onBarcodeScanned(result) {
    if (scanLockRef.current) return;
    scanLockRef.current = true;
    setScannerOpen(false);
    // lookupBarcode(result.data);
  }
  // Uses UPCitemdb's free lookup endpoint — no API key needed, but it's a
  // trial/rate-limited endpoint, so failures (unknown code, rate limit,
  // offline) are expected sometimes; the user can still type the name in.
  async function lookupBarcode(code) {
    setScanLoading(true);
    try {
      const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`);
      const data = await res.json();
      const item = data?.items?.[0];
      if (item?.title) {
        setFName(item.title.length > 40 ? item.title.slice(0, 40) : item.title);
        const price = item.lowest_recorded_price || item.highest_recorded_price || item.offers?.[0]?.price;
        if (price) setFPrice(String(Math.round(Number(price))));
        setNotice(`Found "${item.title}" — check the details before adding.`);
      } else {
        setNotice("No product found for that barcode — you can still type the name in.");
      }
    } catch(e) {
      console.log("Barcode lookup error:", e);
      setNotice("Couldn't look up that barcode — check your connection and try again.");
    } finally {
      setScanLoading(false);
    }
  }

  async function exportPDF() {
    if (exportingPdf) return; // guard against double taps while one export is in flight
    setExportingPdf(true);
    try {
      await exportListPdf({
        listName: selectedList ? selectedList.name : "Shopping List",
        profileName: profile.name,
        pendingItems,
        boughtItems,
        pendingTotal,
        boughtTotal,
        currencySymbol: currency.symbol,
      });
    } catch (e) {
      console.log("PDF export error:", e);
      setNotice(`Couldn't export PDF: ${e?.message || "unknown error"}`);
    } finally {
      setExportingPdf(false);
    }
  }

  function noteValue(item) { return noteDrafts[item.id] !== undefined ? noteDrafts[item.id] : item.note || ""; }
  function commitNote(item) {
    const draft = noteDrafts[item.id];
    setNoteDrafts((prev) => { const p = { ...prev }; delete p[item.id]; return p; });
    if (draft === undefined || draft === (item.note || "")) return;
    updateItem(item.id, { note: draft.trim() });
  }

function startNewTrip() {
  setListItems(selectedListId, (prev) =>
    prev.map((i) => ({ ...i, checked: false, skipped: false, note: "", qty: 0, price: "" }))
  );
  setNoteDrafts({});
  setNotice(`Started a new trip for "${selectedList.name}".`);
  bumpActivity(selectedListId);
}

  function addCategory(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCategories((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  }

  // ---------- Edit item ----------
  function startEditItem(item) {
    setEditingItemId(item.id);
    setEName(item.name);
    setECategory(item.category);
    setEUnit(item.unit);
    setEPrice(item.price === "" || item.price === null || item.price === undefined ? "" : String(item.price));
    setEditNameError("");
  }
  function cancelEditItem() {
    setEditingItemId(null);
    setEditNameError("");
  }
  function saveEditItem() {
    const err = validateItemName(eName, eCategory, items, editingItemId);
    if (err) { setEditNameError(err); return; }
    updateItem(editingItemId, { name: eName.trim(), category: eCategory, unit: eUnit, price: ePrice });
    setEditingItemId(null);
    setEditNameError("");
  }

  // ---------- Currency ----------
  function selectCurrency(cur) {
    setProfile((prev) => ({ ...prev, currency: cur }));
    setCurrencyModalOpen(false);
    setCurrencySearch("");
  }
  // ---------- About ----------
  function openPrivacyPolicy() {
    Linking.openURL(PRIVACY_POLICY_URL).catch(() =>
      setNotice("Couldn't open the privacy policy link.")
    );
  }
  function openContactEmail() {
    const subject = encodeURIComponent("Shopping List feedback");
    Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${subject}`).catch(() =>
      setNotice("Couldn't open your mail app.")
    );
  }

  const filteredCurrencies = CURRENCIES.filter((c) => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return true;
    return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  });

  const s = makeStyles(t);

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} backgroundColor={t.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* ===== Header ===== */}
        <View style={s.headerRow}>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Image source={require("./src/assets/icon.png")} style={{ width: 25, height: 25 }} />

              <Text style={s.brand}>Shopping List</Text>
            </View>
            <TouchableOpacity onPress={() => setListsModalOpen(true)} style={s.listSwitcher}>
              <ListChecks size={13} color={t.accent} />
              <Text style={s.listSwitcherText}>{selectedList ? selectedList.name : "Select list"}</Text>
              <ChevronDown size={13} color={t.accent} />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={exportPDF} style={s.iconBtn} disabled={exportingPdf}>
              {exportingPdf ? (
                <ActivityIndicator size="small" color={t.text} />
              ) : (
                <FileDown size={16} color={t.text} />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setHeaderMenuOpen(true)} style={s.iconBtn}>
              <Menu size={16} color={t.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ===== Header overflow menu ===== */}
        {headerMenuOpen && (
          <Pressable style={s.menuBackdrop} onPress={() => setHeaderMenuOpen(false)}>
            <Pressable style={s.headerMenuCard} onPress={() => {}}>
              <TouchableOpacity
                onPress={() => { setHeaderMenuOpen(false); setReminderModalOpen(true); }}
                style={s.headerMenuRow}
              >
                <Bell size={16} color={reminderSettings.enabled ? t.accent : t.text} />
                <Text style={s.headerMenuText}>Reminders</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setHeaderMenuOpen(false); setCurrencyModalOpen(true); }}
                style={s.headerMenuRow}
              >
                <Settings size={16} color={t.text} />
                <Text style={s.headerMenuText}>Currency</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setHeaderMenuOpen(false); setDark((d) => !d); }}
                style={s.headerMenuRow}
              >
                {dark ? <SunMedium size={16} color={t.text} /> : <Moon size={16} color={t.text} />}
                <Text style={s.headerMenuText}>{dark ? "Light mode" : "Dark mode"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setHeaderMenuOpen(false); setAboutModalOpen(true); }}
                style={s.headerMenuRow}
              >
                <Info size={16} color={t.text} />
                <Text style={s.headerMenuText}>About</Text>
              </TouchableOpacity>
              {/* <TouchableOpacity
                onPress={() => { setHeaderMenuOpen(false); sendTestNotification(); }}
                style={s.headerMenuRow}
              >
                <BellRing size={16} color={t.accent2} />
                <Text style={s.headerMenuText}>Send test notification</Text>
              </TouchableOpacity> */}
            </Pressable>
          </Pressable>
        )}

        {notice ? (
          <View style={s.notice}><Text style={{ color: t.accent2, fontSize: 12.5 }}>{notice}</Text></View>
        ) : null}

        {pendingDelete ? (
          <View style={s.undoRow}>
            <Text style={{ color: t.text, fontSize: 12.5 }}>Deleted "{pendingDelete.item.name}"</Text>
            <TouchableOpacity onPress={undoDelete}>
              <Text style={{ color: t.accent, fontWeight: "700", fontSize: 12.5 }}>Undo</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={s.searchWrap}>
          <Search size={15} color={t.muted} style={s.searchIcon} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={`Search "${selectedList ? selectedList.name : ""}"...`}
            placeholderTextColor={t.muted}
            style={s.searchInput}
          />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {tab === "home" && (
            <>
              <View style={s.summaryCard}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18, alignItems: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <CurrencyGlyph symbol={currency.symbol} color={t.accent} />
                    <Text style={{ color: t.accent, fontSize: 13 }}>{boughtTotal.toFixed(0)} bought ({boughtItems.length})</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <CurrencyGlyph symbol={currency.symbol} color={t.accent2} />
                    <Text style={{ color: t.accent2, fontSize: 13 }}>{pendingTotal.toFixed(0)} pending ({pendingItems.length})</Text>
                  </View>
                  <Text style={{ color: t.text, fontWeight: "700", marginLeft: "auto", fontSize: 13 }}>Total {currency.symbol}{(boughtTotal + pendingTotal).toFixed(0)}</Text>
                </View>

                {/* <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
                  <Text style={{ color: t.muted, fontSize: 12 }}>Budget</Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    placeholder="Not set"
                    placeholderTextColor={t.muted}
                    value={selectedList?.budget != null ? String(selectedList.budget) : ""}
                    onChangeText={(v) => setListBudget(selectedListId, v)}
                    style={[s.priceInput, { width: 90 }]}
                  />
                </View> */}

                {/* {selectedList?.budget ? (() => {
                  const budgetNum = Number(selectedList.budget) || 0;
                  const spent = boughtTotal + pendingTotal;
                  const pct = budgetNum > 0 ? Math.min(100, (spent / budgetNum) * 100) : 0;
                  const over = budgetNum > 0 && spent > budgetNum;
                  return (
                    <View style={{ marginTop: 8 }}>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.border, overflow: "hidden" }}>
                        <View style={{ height: 6, borderRadius: 3, width: `${pct}%`, backgroundColor: over ? t.accent2 : t.accent }} />
                      </View>
                      <Text style={{ color: over ? t.accent2 : t.muted, fontSize: 11.5, marginTop: 4 }}>
                        {over
                          ? `Over budget by ${currency.symbol}${(spent - budgetNum).toFixed(0)}`
                          : `Spent ${currency.symbol}${spent.toFixed(0)} of ${currency.symbol}${budgetNum.toFixed(0)}`}
                      </Text>
                    </View>
                  );
                })() : null} */}

                <TouchableOpacity onPress={startNewTrip} style={s.newTripBtn}>
                  <RotateCcw size={13} color={t.accent} />
                  <Text style={{ color: t.accent, fontWeight: "600", fontSize: 12.5 }}>Start new trip</Text>
                </TouchableOpacity>
              </View>

              {items.length === 0 && (
                <Text style={s.emptyText}>"{selectedList ? selectedList.name : ""}" is empty — add items from the "Add" tab first.</Text>
              )}
              {items.length > 0 && noSearchResults && (
                <Text style={s.emptyText}>No items match "{debouncedSearch}" in this list.</Text>
              )}

              {itemCategories.map((cat) => {
                const catItems = filtered.filter((i) => i.category === cat && !i.skipped);
                if (catItems.length === 0) return null;
                const isCollapsed = collapsed[cat];
                return (
                  <View key={cat} style={{ marginTop: 14 }}>
                    <TouchableOpacity onPress={() => toggleCollapse(cat)} style={s.catHeader}>
                      <Text style={s.catHeaderText}>{cat}</Text>
                      <ChevronDown size={15} color={t.muted} style={{ transform: [{ rotate: isCollapsed ? "-90deg" : "0deg" }] }} />
                    </TouchableOpacity>
                    {!isCollapsed && (
                      <View style={{ gap: 8, marginTop: 6 }}>
                        {catItems.map((item) => (
                          <View key={item.id} style={[s.itemCard, { opacity: item.checked ? 0.55 : 1 }]}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                              <TouchableOpacity
                                onPress={() => updateItem(item.id, { checked: !item.checked })}
                                style={[s.checkbox, { borderColor: item.checked ? t.accent : t.border, backgroundColor: item.checked ? t.accent : "transparent" }]}
                              >
                                {item.checked && <Check size={13} color="#fff" />}
                              </TouchableOpacity>
                              <Text style={{ fontSize: 17 }}>{getIcon(item.name)}</Text>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={[s.itemName, item.checked && { textDecorationLine: "line-through" }]}>{item.name}</Text>
                                <Text style={s.itemUnit}>{item.unit}</Text>
                              </View>
                              <TouchableOpacity
                                onPress={() => updateItem(item.id, { qty: Math.max(1, Number(item.qty) - 1) })}
                                disabled={Number(item.qty) <= 1}
                                style={[s.qtyBtn, Number(item.qty) <= 1 && { opacity: 0.5 }]}
                              >
                                <Text style={s.qtyBtnText}>−</Text>
                              </TouchableOpacity>
                              <Text style={s.qtyValue}>{item.qty}</Text>
                              <TouchableOpacity
                                onPress={() => updateItem(item.id, { qty: Math.min(999, Number(item.qty) + 1) })}
                                disabled={Number(item.qty) >= 999}
                                style={[s.qtyBtn, Number(item.qty) >= 999 && { opacity: 0.5 }]}
                              >
                                <Text style={s.qtyBtnText}>+</Text>
                              </TouchableOpacity>
                              <TextInput
                                keyboardType="decimal-pad"
                                placeholder={currency.symbol}
                                placeholderTextColor={t.muted}
                                value={String(item.price ?? "")}
                                onChangeText={(v) => updateItem(item.id, { price: v })}
                                style={s.priceInput}
                              />
                              {!item.checked && (
                                <TouchableOpacity onPress={() => updateItem(item.id, { skipped: true })} style={{ padding: 2 }}>
                                  <EyeOff size={15} color={t.muted} />
                                </TouchableOpacity>
                              )}
                            </View>
                            <TextInput
                              value={noteValue(item)}
                              onChangeText={(v) => setNoteDrafts((prev) => ({ ...prev, [item.id]: v }))}
                              onBlur={() => commitNote(item)}
                              maxLength={60}
                              placeholder="Add a note (e.g. only Amul, small pack)"
                              placeholderTextColor={t.muted}
                              style={s.noteInput}
                            />
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}

              {skippedItems.length > 0 && (
                <View style={{ marginTop: 10 }}>
                  <TouchableOpacity onPress={() => toggleCollapse("__skipped__")} style={s.catHeader}>
                    <Text style={[s.catHeaderText, { color: t.muted }]}>Not buying this time ({skippedItems.length})</Text>
                    <ChevronDown size={15} color={t.muted} style={{ transform: [{ rotate: collapsed["__skipped__"] ? "-90deg" : "0deg" }] }} />
                  </TouchableOpacity>
                  {!collapsed["__skipped__"] && (
                    <View style={{ gap: 8, marginTop: 6 }}>
                      {skippedItems.map((item) => (
                        <View key={item.id} style={[s.itemCard, { flexDirection: "row", alignItems: "center", gap: 10, opacity: 0.6 }]}>
                          <Text style={{ fontSize: 17 }}>{getIcon(item.name)}</Text>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={s.itemName}>{item.name}</Text>
                            <Text style={s.itemUnit}>{item.qty} {item.unit}</Text>
                          </View>
                          <TouchableOpacity onPress={() => updateItem(item.id, { skipped: false })} style={s.addBackBtn}>
                            <Text style={{ color: t.accent, fontWeight: "600", fontSize: 11.5 }}>Add back</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          {tab === "add" && (
            <>
              {debouncedSearch.trim() ? (
                <Text style={{ marginTop: 10, fontSize: 12.5, color: searchMatch ? t.accent : t.muted }}>
                  {searchMatch
                    ? `✅ "${searchMatch.name}" is already on your list (qty: ${searchMatch.qty} ${searchMatch.unit})`
                    : `"${debouncedSearch}" is not on your list yet — add it below.`}
                </Text>
              ) : null}

              <View style={s.addCard}>
                <Text style={s.addHint}>Add an item whenever you remember (tip: "milk, bread, eggs" adds all three)</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <TextInput
                    value={fName}
                    maxLength={200}
                    onChangeText={(val) => {
                      setFName(val);
                      if (itemNameError) setItemNameError("");
                      if (!categoryTouched && !val.includes(",")) {
                        const guess = suggestCategory(val);
                        if (guess) setFCategory(guess);
                      }
                    }}
                    onSubmitEditing={addItem}
                    placeholder="Item name"
                    placeholderTextColor={t.muted}
                    style={[s.input, { flex: 1, minWidth: 140, borderColor: itemNameError ? t.danger : t.border }]}
                  />
                  {/* <TouchableOpacity onPress={openScanner} style={s.iconBtn} disabled={scanLoading}>
                    <Barcode size={16} color={scanLoading ? t.muted : t.text} />
                  </TouchableOpacity> */}
                  <CategorySelect
                    value={fCategory}
                    categories={categories}
                    onChange={(c) => { setFCategory(c); setCategoryTouched(true); }}
                    onAddCategory={addCategory}
                    t={t}
                    style={{ flex: 1, minWidth: 100 }}
                  />
                </View>
                {itemNameError ? <Text style={s.errorText}>{itemNameError}</Text> : null}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" }}>
                  <SimpleSelect value={fUnit} options={UNITS} onChange={setFUnit} title="Unit" t={t} />
                  <TouchableOpacity onPress={addItem} style={s.addItemBtn}>
                    <Plus size={15} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Adds</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ marginTop: 16, gap: 8 }}>
                {filtered.length === 0 && (
                  <Text style={s.emptyText}>{items.length === 0 ? "No items yet." : `No items match "${debouncedSearch}".`}</Text>
                )}
                {filtered.map((item) => (
                  <View key={item.id} style={s.itemCard}>
                    {editingItemId === item.id ? (
                      <View style={{ gap: 8 }}>
                        <TextInput
                          value={eName}
                          maxLength={40}
                          onChangeText={(v) => { setEName(v); if (editNameError) setEditNameError(""); }}
                          style={[s.input, { borderColor: editNameError ? t.danger : t.border }]}
                        />
                        {editNameError ? <Text style={s.errorText}>{editNameError}</Text> : null}
                        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                          <CategorySelect value={eCategory} categories={categories} onChange={setECategory} onAddCategory={addCategory} t={t} style={{ flex: 1, minWidth: 100 }} />
                          <SimpleSelect value={eUnit} options={UNITS} onChange={setEUnit} title="Unit" t={t} style={{ flex: 1, minWidth: 90 }} />
                          
                        </View>
                        <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
                          <TouchableOpacity onPress={cancelEditItem} style={s.smallBtn}><Text style={s.smallBtnText}>Cancel</Text></TouchableOpacity>
                          <TouchableOpacity onPress={saveEditItem} style={[s.smallBtn, { backgroundColor: t.accent, borderColor: t.accent }]}><Text style={[s.smallBtnText, { color: "#fff" }]}>Save</Text></TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Text style={{ fontSize: 17 }}>{getIcon(item.name)}</Text>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.itemName}>{item.name}</Text>
                          <Text style={s.itemUnit}>
                            {item.category} · {item.unit}
                          </Text>
                        </View>
                        <TouchableOpacity onPress={() => startEditItem(item)} style={{ padding: 4 }}><Pencil size={15} color={t.muted} /></TouchableOpacity>
                        <TouchableOpacity onPress={() => deleteItem(item)} style={{ padding: 4 }}><Trash2 size={15} color={t.danger} /></TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>

        {/* ===== Bottom tab bar ===== */}
        <View style={s.tabBar}>
          {[
            { id: "home", label: "Home / Buy", icon: Home },
            { id: "add", label: "Add / Manage", icon: ListPlus },
          ].map(({ id, label, icon: Icon }) => (
            <TouchableOpacity key={id} onPress={() => setTab(id)} style={s.tabBtn}>
              <Icon size={19} color={tab === id ? t.accent : t.muted} />
              <Text style={{ fontSize: 11.5, fontWeight: "600", color: tab === id ? t.accent : t.muted }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </KeyboardAvoidingView>

      {/* ===== Lists modal (create / rename / delete / switch) ===== */}
      <Modal visible={listsModalOpen} transparent animationType="slide" onRequestClose={() => setListsModalOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setListsModalOpen(false)}>
          <Pressable style={s.listsSheet} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={s.sheetTitle}>Your lists</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <TouchableOpacity onPress={openNewListModal} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Plus size={16} color={t.accent} />
                    <Text style={{ color: t.accent, fontWeight: "700", fontSize: 13 }}>New list</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setListsModalOpen(false)}><X size={18} color={t.muted} /></TouchableOpacity>
                </View>
              </View>

              <View style={{ gap: 8 }}>
                {lists.map((list) => (
                  <View key={list.id} style={[s.listRow, { borderColor: list.id === selectedListId ? t.accent : t.border }]}>
                    {renamingListId === list.id ? (
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TextInput
                          autoFocus
                          value={renameDraft}
                          maxLength={40}
                          onChangeText={(v) => { setRenameDraft(v); if (listNameError) setListNameError(""); }}
                          onSubmitEditing={commitRenameList}
                          style={[s.input, { flex: 1, borderColor: listNameError ? t.danger : t.border }]}
                        />
                        <TouchableOpacity onPress={commitRenameList} style={[s.smallBtn, { backgroundColor: t.accent, borderColor: t.accent }]}><Text style={[s.smallBtnText, { color: "#fff" }]}>Save</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => { setRenamingListId(null); setListNameError(""); }} style={s.smallBtn}><Text style={s.smallBtnText}>Cancel</Text></TouchableOpacity>
                      </View>
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <TouchableOpacity onPress={() => { setSelectedListId(list.id); setListsModalOpen(false); }} style={{ flex: 1 }}>
                          <Text style={{ fontWeight: "700", fontSize: 14.5, color: t.text }}>{list.name}{list.id === selectedListId ? " · current" : ""}</Text>
                          <Text style={{ fontSize: 11.5, color: t.muted }}>{(itemsByList[list.id] || []).length} items</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => startRenameList(list)} style={{ padding: 4 }}><Pencil size={15} color={t.muted} /></TouchableOpacity>
                        <TouchableOpacity onPress={() => setConfirmDeleteListId(list.id)} style={{ padding: 4 }}><Trash2 size={15} color={t.danger} /></TouchableOpacity>
                      </View>
                    )}
                    {confirmDeleteListId === list.id && (
                      <View style={s.confirmDeleteBox}>
                        <Text style={{ fontSize: 12, color: t.text }}>Delete "{list.name}" and all its items? This can't be undone.</Text>
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                          <TouchableOpacity onPress={() => deleteList(list.id)} style={[s.smallBtn, { backgroundColor: t.danger, borderColor: t.danger }]}><Text style={[s.smallBtnText, { color: "#fff" }]}>Delete</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => setConfirmDeleteListId(null)} style={s.smallBtn}><Text style={s.smallBtnText}>Cancel</Text></TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                ))}
              </View>

            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== New list popup ===== */}
      <Modal visible={newListModalOpen} transparent animationType="fade" onRequestClose={() => setNewListModalOpen(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={s.modalBackdropCenter} onPress={() => setNewListModalOpen(false)}>
            <Pressable style={s.popupCard} onPress={() => {}}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={s.sheetTitle}>New list</Text>
                <TouchableOpacity onPress={() => setNewListModalOpen(false)}><X size={18} color={t.muted} /></TouchableOpacity>
              </View>
              <TextInput
                autoFocus
                value={newListName}
                maxLength={40}
                placeholder="New list name (e.g. Home Supplies)"
                placeholderTextColor={t.muted}
                onChangeText={(v) => { setNewListName(v); if (listNameError) setListNameError(""); }}
                onSubmitEditing={addList}
                style={[s.input, { borderColor: listNameError ? t.danger : t.border }]}
              />
              {listNameError ? <Text style={s.errorText}>{listNameError}</Text> : null}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                <TouchableOpacity onPress={() => setNewListModalOpen(false)} style={[s.smallBtn, { flex: 1, alignItems: "center", paddingVertical: 10 }]}>
                  <Text style={s.smallBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={addList} style={[s.addItemBtn, { flex: 1, justifyContent: "center", marginLeft: 0 }]}>
                  <Plus size={15} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Create</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== Currency modal: first-launch setup + later changes via the settings icon ===== */}
      <Modal
        visible={currencyModalOpen || needsCurrencySetup}
        transparent
        animationType="slide"
        onRequestClose={() => { if (!needsCurrencySetup) setCurrencyModalOpen(false); }}
      >
        <Pressable
          style={s.modalBackdrop}
          onPress={() => { if (!needsCurrencySetup) setCurrencyModalOpen(false); }}
        >
          <Pressable style={s.listsSheet} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Text style={s.sheetTitle}>{needsCurrencySetup ? "Pick your currency" : "Currency"}</Text>
                {!needsCurrencySetup && (
                  <TouchableOpacity onPress={() => setCurrencyModalOpen(false)}><X size={18} color={t.muted} /></TouchableOpacity>
                )}
              </View>
              <Text style={{ fontSize: 12.5, color: t.muted, marginBottom: 12 }}>
                {needsCurrencySetup
                  ? "This just sets which symbol shows next to prices — you can change it anytime from the settings icon up top."
                  : "Changing this only updates the symbol shown next to prices; existing amounts stay the same."}
              </Text>

              <TextInput
                value={currencySearch}
                onChangeText={setCurrencySearch}
                placeholder="Search currency (e.g. USD, Euro)"
                placeholderTextColor={t.muted}
                style={[s.input, { marginBottom: 10 }]}
              />

              <View style={{ gap: 6 }}>
                {filteredCurrencies.map((cur) => {
                  const isSelected = currency.code === cur.code;
                  return (
                    <TouchableOpacity
                      key={cur.code}
                      onPress={() => selectCurrency(cur)}
                      style={[s.listRow, { borderColor: isSelected ? t.accent : t.border, flexDirection: "row", alignItems: "center", gap: 10 }]}
                    >
                      <Text style={{ fontSize: 16, width: 34, textAlign: "center", color: t.text, fontWeight: "700" }}>{cur.symbol}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: t.text, fontWeight: "700", fontSize: 14 }}>{cur.code}</Text>
                        <Text style={{ color: t.muted, fontSize: 11.5 }}>{cur.name}</Text>
                      </View>
                      {isSelected && <Check size={16} color={t.accent} />}
                    </TouchableOpacity>
                  );
                })}
                {filteredCurrencies.length === 0 && (
                  <Text style={s.emptyText}>No currency matches "{currencySearch}".</Text>
                )}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== About modal: opened from the hamburger menu, same style as the settings/currency sheet ===== */}
      <Modal
        visible={aboutModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAboutModalOpen(false)}
      >
        <Pressable style={s.modalBackdrop} onPress={() => setAboutModalOpen(false)}>
          <Pressable style={s.listsSheet} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Text style={s.sheetTitle}>About</Text>
                <TouchableOpacity onPress={() => setAboutModalOpen(false)}>
                  <X size={18} color={t.muted} />
                </TouchableOpacity>
              </View>

              {/* Logo, name, tagline */}
              <View style={{ alignItems: "center", marginTop: 10, marginBottom: 18 }}>
                <Image
                  source={require("./src/assets/icon.png")}
                  style={{ width: 64, height: 64, borderRadius: 16, marginBottom: 10 }}
                />
                <Text style={{ fontSize: 18, fontWeight: "800", color: t.text }}>Shopping List</Text>
                <Text style={{ fontSize: 12.5, color: t.accent, fontWeight: "600", marginTop: 2 }}>
                  Never forget to buy
                </Text>
              </View>

              {/* Short description */}
              <Text style={{ fontSize: 13, color: t.muted, textAlign: "center", lineHeight: 19, marginBottom: 18 }}>
                Shopping List helps you plan your shopping trips with categorized items, quantities, prices, and reminders — 
                all saved on your device, so your lists are always ready when you need them.**
              </Text>

              {/* Version & developer */}
              <View style={{ gap: 6, marginBottom: 16 }}>
                <View style={[s.listRow, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
                  <Text style={{ color: t.text, fontSize: 13.5, fontWeight: "600" }}>App version</Text>
                  <Text style={{ color: t.muted, fontSize: 13 }}>{APP_VERSION}</Text>
                </View>
                {/* <View style={[s.listRow, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
                  <Text style={{ color: t.text, fontSize: 13.5, fontWeight: "600" }}>Developer</Text>
                  <Text style={{ color: t.muted, fontSize: 13 }}>{DEVELOPER_NAME}</Text>
                </View> */}
              </View>

              {/* Privacy policy & contact */}
              {/* <View style={{ gap: 6, marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={openPrivacyPolicy}
                  style={[s.listRow, { flexDirection: "row", alignItems: "center", gap: 10 }]}
                >
                  <ShieldCheck size={16} color={t.accent} />
                  <Text style={{ flex: 1, color: t.text, fontSize: 13.5, fontWeight: "600" }}>Privacy Policy</Text>
                  <ChevronRight size={16} color={t.muted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={openContactEmail}
                  style={[s.listRow, { flexDirection: "row", alignItems: "center", gap: 10 }]}
                >
                  <Mail size={16} color={t.accent} />
                  <Text style={{ flex: 1, color: t.text, fontSize: 13.5, fontWeight: "600" }}>Contact / Feedback</Text>
                  <ChevronRight size={16} color={t.muted} />
                </TouchableOpacity>
              </View> */}
              {/* <Text style={{ fontSize: 11, color: t.muted, textAlign: "center", marginTop: 10, marginBottom: 4 }}>
                Each library is used under its own open-source license.
              </Text> */}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== Barcode scanner =====
      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] }}
            onBarcodeScanned={scanLockRef.current ? undefined : onBarcodeScanned}
          />
          <TouchableOpacity
            onPress={() => setScannerOpen(false)}
            style={{ position: "absolute", top: 48, right: 20, backgroundColor: "rgba(0,0,0,0.6)", padding: 10, borderRadius: 20 }}
          >
            <X size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ position: "absolute", bottom: 60, left: 0, right: 0, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontSize: 13 }}>Point the camera at a barcode</Text>
          </View>
        </View>
      </Modal> */}

      {/* ===== Reminders settings ===== */}
      <Modal visible={reminderModalOpen} transparent animationType="slide" onRequestClose={() => setReminderModalOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setReminderModalOpen(false)}>
          <Pressable style={s.listsSheet} onPress={() => {}}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Text style={s.sheetTitle}>Shopping reminders</Text>
              <TouchableOpacity onPress={() => setReminderModalOpen(false)}><X size={18} color={t.muted} /></TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12.5, color: t.muted, marginBottom: 14 }}>
              Get notified if a list has gone quiet for a while. Any activity on a list (adding, checking off, or starting a new trip) resets its countdown.
            </Text>

            <TouchableOpacity
              onPress={() => toggleReminders(!reminderSettings.enabled)}
              style={[s.listRow, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
            >
              <Text style={{ color: t.text, fontWeight: "600", fontSize: 14 }}>Enable reminders</Text>
              <View style={{ width: 40, height: 22, borderRadius: 11, backgroundColor: reminderSettings.enabled ? t.accent : t.border, padding: 2, justifyContent: "center" }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff", marginLeft: reminderSettings.enabled ? 18 : 0 }} />
              </View>
            </TouchableOpacity>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 }}>
              <Text style={{ color: t.text, fontSize: 14 }}>Remind me after</Text>
              <TextInput
                keyboardType="number-pad"
                value={String(reminderSettings.days ?? 5)}
                onChangeText={updateReminderDays}
                style={[s.priceInput, { width: 50, textAlign: "center" }]}
              />
              <Text style={{ color: t.text, fontSize: 14 }}>days of no activity</Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Loader({ t }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounce = (dot, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ])
      ).start();
    bounce(dot1, 0);
    bounce(dot2, 150);
    bounce(dot3, 300);
    // eslint-disable-next-line
  }, []);

  const dotStyle = (anim) => ({
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: t.accent,
    marginHorizontal: 4,
    transform: [{ translateY: anim }],
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: "center", justifyContent: "center", gap: 14 }}>
      <View style={{ flexDirection: "row" }}>
        <Animated.View style={dotStyle(dot1)} />
        <Animated.View style={dotStyle(dot2)} />
        <Animated.View style={dotStyle(dot3)} />
      </View>
      <Text style={{ color: t.muted, fontSize: 13 }}>Loading…</Text>
    </View>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    screen: { flex: 1 },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 16, paddingTop: 12 },
    brand: { fontSize: 22, fontWeight: "800", color: t.text },
    listSwitcher: { marginTop: 4, flexDirection: "row", alignItems: "center", gap: 4 },
    listSwitcherText: { color: t.accent, fontSize: 13, fontWeight: "700" },
    iconBtn: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 999, width: 38, height: 38, alignItems: "center", justifyContent: "center" },
    notice: { marginHorizontal: 16, marginTop: 12, backgroundColor: `${t.accent2}22`, borderWidth: 1, borderColor: `${t.accent2}55`, borderRadius: 10, padding: 10 },
    undoRow: { marginHorizontal: 16, marginTop: 12, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    searchWrap: { marginHorizontal: 16, marginTop: 16, marginBottom: 8, position: "relative", justifyContent: "center" },
    searchIcon: { position: "absolute", left: 12, zIndex: 1 },
    searchInput: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingVertical: 9, paddingLeft: 34, paddingRight: 12, color: t.text, fontSize: 14 },
    summaryCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 16, marginTop: 4 },
    newTripBtn: { marginTop: 12, borderWidth: 1, borderColor: t.accent, borderRadius: 10, padding: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
    emptyText: { textAlign: "center", color: t.muted, fontSize: 13, paddingVertical: 20 },
    catHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4, paddingHorizontal: 2 },
    catHeaderText: { fontSize: 15, fontWeight: "700", color: t.accent },
    itemCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 10 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    itemName: { fontSize: 14, fontWeight: "600", color: t.text },
    itemUnit: { fontSize: 11.5, color: t.muted },
    qtyBtn: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: 6, width: 24, height: 24, alignItems: "center", justifyContent: "center" },
    qtyBtnText: { color: t.text, fontSize: 15, fontWeight: "700" },
    qtyValue: { minWidth: 20, textAlign: "center", fontSize: 13, fontWeight: "600", color: t.text },

    priceInput: { width: 56, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8, fontSize: 12.5, color: t.text },
    menuBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "flex-end", paddingTop: 58, paddingRight: 16, zIndex: 50, elevation: 10 },
    headerMenuCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingVertical: 6, minWidth: 170, elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
    headerMenuRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
    headerMenuText: { color: t.text, fontSize: 13.5, fontWeight: "600" },
    noteInput: { marginTop: 6, marginLeft: 32, borderBottomWidth: 1, borderColor: t.border, borderStyle: "dashed", color: t.muted, fontSize: 12, fontStyle: "italic", paddingVertical: 3 },
    addBackBtn: { borderWidth: 1, borderColor: t.accent, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
    addCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 16, marginTop: 14 },
    addHint: { fontSize: 13, color: t.muted, fontWeight: "600", marginBottom: 10 },
    input: { backgroundColor: t.surface2, borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, color: t.text, fontSize: 14 },
    errorText: { color: t.danger, fontSize: 11.5, marginTop: 4 },
    addItemBtn: { marginLeft: "auto", backgroundColor: t.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 6 },
    smallBtn: { borderWidth: 1, borderColor: t.border, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
    smallBtnText: { color: t.text, fontSize: 12, fontWeight: "600" },
    tabBar: { flexDirection: "row", borderTopWidth: 1, borderColor: t.border, backgroundColor: t.surface },
    tabBtn: { flex: 1, paddingVertical: 10, alignItems: "center", gap: 3 },
    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    modalBackdropCenter: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
    listsSheet: { backgroundColor: t.bg, borderWidth: 1, borderColor: t.border, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, maxHeight: "80%" },
    popupCard: { width: "100%", maxWidth: 420, backgroundColor: t.bg, borderWidth: 1, borderColor: t.border, borderRadius: 18, padding: 18 },
    sheetTitle: { fontSize: 18, fontWeight: "800", color: t.text },
    listRow: { backgroundColor: t.surface, borderWidth: 1, borderRadius: 12, padding: 12 },
    confirmDeleteBox: { marginTop: 8, padding: 8, backgroundColor: `${t.danger}18`, borderWidth: 1, borderColor: `${t.danger}55`, borderRadius: 8 },
  });
}
import React, { useState, useEffect, useRef, useMemo } from "react";
// import { CameraView, useCameraPermissions } from "expo-camera";
import * as Notifications from "expo-notifications";
import DateTimePicker from "@react-native-community/datetimepicker";
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
  AppState,
  LayoutAnimation,
  UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import {
  Plus, Trash2, Moon, SunMedium, Search, Settings, ChevronDown, Check,
  FileDown, Home, ListPlus, EyeOff, RotateCcw, Pencil, X, ListChecks,
  Barcode, Bell, Menu, BellRing, Info, Mail, ShieldCheck, FileText,
  ChevronRight, Users, Layers, UserCircle2, Eye,
  Cloud, Crown, Sparkles, LogOut, Palette, Wallet, BellDot,
  Zap, ArrowRight, Star, ShoppingBag, AlertCircle,
} from "lucide-react-native";

import { loadState, saveState, DEFAULT_CATEGORIES, makeId } from "./src/utils/storage";
import { getTheme, RADIUS } from "./src/utils/theme";
import { UNITS, getIcon, suggestCategory, validateListName, validateItemName, clampQty, clampPrice } from "./src/utils/helpers";
import { exportListPdf } from "./src/utils/exportpdf";
import CategorySelect from "./src/components/Categoryselect";
import SimpleSelect from "./src/components/Simpleselect";
import FamilySyncScreen from "./src/screens/FamilySyncScreen";
import { useAuth } from "./src/context/AuthContext";
import {
  fetchLists, createList as createListApi, renameList as renameListApi, deleteListApi,
  createItem as createItemApi, updateItemApi, deleteItemApi,
  sendInvite, fetchInvites, acceptInvite, declineInvite, revokeInvite,
  changeMemberRole as changeMemberRoleApi, removeMember as removeMemberApi,
  getPendingSyncListIds, onSyncDropped,
} from "./src/utils/api";
import { getSocket, joinListRoom } from "./src/utils/socket";
import { Share2 } from "lucide-react-native";
import notificationService, { PUSH_TYPES } from "./src/service/notificationService";
import * as Sentry from '@sentry/react-native';
import * as Updates from "expo-updates";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || "";

Sentry.init({
  dsn: DSN,

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

console.log("[Updates] isEnabled:", Updates.isEnabled);
console.log("[Updates] runtimeVersion:", Updates.runtimeVersion);
console.log("[Updates] updateId:", Updates.updateId);


// This app is local-first: everything lives in on-device storage (see
// storage.js) by default, so it works fully offline with no account.
// Signing in with Google (AuthContext) additionally syncs specific lists to
// the MindCart backend (Neon Postgres via Prisma) so they can be shared with
// family and stay live across devices. A list is a "cloud list" once it has
// a `role` field on it (OWNER/WRITE/READ, set when it's fetched from or
// created on the server) — local-only lists never get that field and are
// never sent anywhere.

// "just now" / "5m ago" / "3h ago" / "2d ago"
function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Toast helpers: setNotice(msg) stays the single entry point everywhere in
// the app; the type (error / success / info) and on-screen time are derived
// from the message so no call site has to change.
function noticeKind(msg) {
  if (/couldn't|didn't|can't|failed|no longer|only the owner|view-only|at least one/i.test(msg)) return "error";
  if (/^(added|invited|invite accepted|started a new trip|test notification sent)|is now shareable/i.test(msg)) return "success";
  return "info";
}
function noticeDuration(msg, kind) {
  const base = kind === "error" ? 5000 : kind === "success" ? 2500 : 3500;
  return Math.min(9000, base + Math.max(0, msg.length - 40) * 40); // longer text stays longer
}

// Collapse several validation messages into one short line.
function summarizeItemErrors(errors) {
  const uniq = [...new Set(errors)];
  const shown = uniq.slice(0, 2).join(" · ");
  return uniq.length > 2 ? `${shown} (+${uniq.length - 2} more)` : shown;
}

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
const APP_VERSION = "1.0.3";
const DEVELOPER_NAME = "Sameer Shaikh";
const PRIVACY_POLICY_URL = "https://example.com/privacy-policy";
const CONTACT_EMAIL = "support@example.com";
// Short, plain-language Privacy Policy shown in-app (condensed from the
// full policy). Edit this if your data practices change.
const PRIVACY_POLICY_TEXT = `MindCart uses your Google account to sign you in. Here is what the app handles:

Account: when you sign in with Google we receive your name, email address and profile picture, and use them to identify you and to let people you invite find you.

Your lists: your lists, items, quantities, prices, notes and categories are stored on your device and synced to our servers so they are available on your devices and can be shared. People you invite can see the lists you share with them (an "all my lists" family invite shares every list you own).
Notifications: if you allow notifications, your device's push token is stored so we can send you invitations and updates.

We do not sell your data or use it for advertising. Our hosting providers process it on our behalf only to run the app.

You can sign out at any time. To have your account and data deleted, contact us at the support email shown in the app.

Not intended for children under 13.`;
// Short, plain-language Terms of Use shown in-app. Edit this to match your
// actual terms before publishing — keep it brief, this isn't a substitute
// for proper legal text if your app needs one.
const TERMS_OF_USE_TEXT = `By using MindCart, you agree to use the app for personal, lawful purposes only.

Your lists are stored on your device and, while you are signed in, synced to our servers so they can be shared with the people you invite. You are responsible for who you share lists with. The app is provided "as is," without warranties of any kind, and we aren't liable for any loss of data.

We may update these terms from time to time. Continued use of the app means you accept the current terms.`;
const OPEN_SOURCE_LIBS = [
  { name: "React Native", note: "Core app framework" },
  { name: "Expo", note: "Build & runtime tooling" },
  { name: "expo-camera", note: "Barcode scanning" },
  { name: "expo-notifications", note: "Shopping reminders" },
  { name: "react-native-safe-area-context", note: "Safe area layout" },
  { name: "lucide-react-native", note: "Icon set" },
];

// ---------- Daily testing reminder (closed testing only) ----------
// A separate, much simpler reminder aimed at beta testers during closed
// testing: one local notification a day at a fixed time, cycling through
// 4 different messages so nobody sees the exact same line two days running.
// Opening the app at any point resets the cycle back to Day 1 for
// "tomorrow", so someone who actually uses the app daily never sees these.
const DAILY_TEST_MESSAGES = [
  "🛒 Kya lena hai bhai? Ya sab yaad rehta hai?",
  "Quick check-in 🙂 Try adding/editing a few items today.",
  "🛒 Kuch kharidna tha na… ya bhool gaye?",
  "🛒 Ghar se nikle? List toh le jao! 😂",
  "😂 Kuch bhool gaye toh screenshot mat lena, list dekh lena.",
  "🛒 Market mein khade hoke yaad karne ka plan hai kya? 😂"
];

const DAILY_TEST_LOOKAHEAD_DAYS = 60;

const DAILY_TEST_DEFAULT_HOUR = 20; // 8 PM, 24h device-local time
const DAILY_TEST_DEFAULT_MINUTE = 0;


if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
// Small helper so every "this changes the shape of the list" action gets
// the same gentle ease-in-ease-out slide/fade instead of an abrupt pop.
function animateListChange() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}
// Best-effort haptics — silently no-ops on web/unsupported devices.
function tapHaptic(style) {
  Haptics.impactAsync(style || Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function CurrencyGlyph({ symbol, color, size = 12 }) {
  return <Text style={{ color, fontSize: size, fontWeight: "800" }}>{symbol}</Text>;
}

// Converts an items array into the { itemId: item } map shape used by
// itemsByList. Used for the local-storage migration and anywhere a batch
// of items (e.g. from the server) needs folding into that map at once.
function arrayToItemMap(arr) {
  const map = {};
  for (const it of arr) map[it.id] = it;
  return map;
}


function describeDroppedOp(op, lists) {
  const listId = op.payload?.listId || op.payload?.id;
  const list = lists.find((l) => l.id === listId);
  const listLabel = list ? `"${list.name}"` : "a list";
  switch (op.type) {
    case "createList": return `create the list "${op.payload?.name || ""}"`;
    case "renameList": return `rename ${listLabel}`;
    case "deleteList": return `delete ${listLabel}`;
    case "createItem": return `add "${op.payload?.body?.name || "an item"}" to ${listLabel}`;
    case "updateItem": return `save an item change in ${listLabel}`;
    case "deleteItem": return `delete an item from ${listLabel}`;
    default: return `sync a change to ${listLabel}`;
  }
}

// A checkbox that gives a small satisfying "pop" (scale bounce) + a light
// haptic tap whenever it's toggled, instead of just flipping state instantly.
function AnimatedCheckbox({ checked, onPress, style }) {
  const scale = useRef(new Animated.Value(1)).current;
  function handlePress() {
    tapHaptic(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.75, duration: 70, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 140 }),
    ]).start();
    onPress();
  }
  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {checked && <Check size={13} color="#fff" />}
      </Animated.View>
    </TouchableOpacity>
  );
}


function SwipeDeleteAction({ t, onDelete }) {
  return (
    <TouchableOpacity
      onPress={() => { tapHaptic(Haptics.ImpactFeedbackStyle.Heavy); onDelete(); }}
      style={{
        backgroundColor: t.danger, justifyContent: "center", alignItems: "center",
        width: 76, borderRadius: RADIUS.md, marginLeft: 8, gap: 3,
      }}
    >
      <Trash2 size={17} color="#fff" />
      <Text style={{ color: "#fff", fontSize: 10.5, fontWeight: "700" }}>Delete</Text>
    </TouchableOpacity>
  );
}

const ROLE_RANK = { OWNER: 0, WRITE: 1, READ: 2 };

function pickListId(cur, cloudLists, localLists, excludedIds = []) {
  const excluded = new Set(excludedIds);
  const cloudIds = new Set(cloudLists.map((l) => l.id));
  const localKept = localLists.filter((l) => !cloudIds.has(l.id) && !excluded.has(l.id));
  const validIds = new Set([...cloudIds, ...localKept.map((l) => l.id)]);

  // Keep the selection only if it still points at a real list.
  if (cur && validIds.has(cur)) return cur;

  // Array.sort is stable, so ties keep the server's order.
  const rankedCloud = [...cloudLists].sort(
    (a, b) => (ROLE_RANK[a.role] ?? 3) - (ROLE_RANK[b.role] ?? 3)
  );
  const ownedCloud = rankedCloud.find((l) => l.role === "OWNER");

  if (ownedCloud) return ownedCloud.id;
  if (localKept.length) return localKept[0].id;
  if (rankedCloud.length) return rankedCloud[0].id;
  return null;
}

// Number(x) that never returns NaN/Infinity — a stray "." typed into a price
// box used to turn every total on screen into NaN.
function safeAmount(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const toLocalList = (cl) => ({
  id: cl.id, name: cl.name, ownerId: cl.ownerId, role: cl.role,
  createdAt: new Date(cl.createdAt).getTime(), cloudConfirmed: true,
});

// Pure merge used right after sign-in. Returns the next `lists` plus the id
// groups the caller needs for follow-up cleanup. Kept pure (no state, no
// side effects) so it can be run on listsRef.current for the side values and
// again inside a setState updater for the state itself.
function mergeCloudOnSignIn(prev, cloudLists) {
  const cloudIds = new Set(cloudLists.map((cl) => cl.id));
  const notInCloud = prev.filter((l) => !cloudIds.has(l.id));
  const staleSeedIds = (cloudLists.length
    ? notInCloud.filter((l) => l.isDefaultSeed && !l.cloudConfirmed)
    : []
  ).map((l) => l.id);
  const keepable = notInCloud.filter((l) => !staleSeedIds.includes(l.id));
  const legacyLocal = keepable.filter((l) => !l.cloudConfirmed);
  const lostAccessIds = keepable.filter((l) => l.cloudConfirmed).map((l) => l.id);
  const promoted = legacyLocal.map((l) => (l.role ? l : { ...l, role: "OWNER" }));
  return { next: [...cloudLists.map(toLocalList), ...promoted], legacyLocal, lostAccessIds, staleSeedIds };
}

// Pure merge used after accepting an invite: keep every list the server
// doesn't currently return unless it was previously cloud-confirmed (then
// access was lost).
function mergeCloudOnAccept(prev, cloudLists) {
  const cloudIds = new Set(cloudLists.map((cl) => cl.id));
  const notInCloud = prev.filter((l) => !cloudIds.has(l.id));
  const keepAsIs = notInCloud.filter((l) => !l.cloudConfirmed);
  const lostAccessIds = notInCloud.filter((l) => l.cloudConfirmed).map((l) => l.id);
  return { next: [...cloudLists.map(toLocalList), ...keepAsIs], lostAccessIds };
}

export default Sentry.wrap(function DmartApp() {
  const [appLoaded, setAppLoaded] = useState(false);
  const hydrated = useRef(false); // guards the very first save-effect run

  const [profile, setProfile] = useState({ name: "" });
  const [dark, setDark] = useState(true);

  const [lists, setLists] = useState([]);
  const listsRef = useRef(lists); // lets the sync-drop listener (registered once) read fresh list names without re-subscribing
  useEffect(() => { listsRef.current = lists; }, [lists]);
  const [selectedListId, setSelectedListId] = useState(null);
  const [itemsByList, setItemsByList] = useState({});
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);

  const [tab, setTab] = useState("home");
  const [homeFilter, setHomeFilter] = useState("all"); // "all" | "pending" | "bought"
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [pendingDelete, setPendingDelete] = useState(null); // { item, listId, timer }
  const pendingDeleteRef = useRef(null); // always the live entry, so back-to-back deletes can't miss it
  pendingDeleteRef.current = pendingDelete;
  const pendingSelectRef = useRef(null); // a list id (from a push tap) to select once it shows up in `lists`
  const [notice, setNotice] = useState("");

  const [exportingPdf, setExportingPdf] = useState(false);

  const [fName, setFName] = useState("");
  const [fUnit, setFUnit] = useState("packet");
  const [fCategory, setFCategory] = useState("Kitchen");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [itemNameError, setItemNameError] = useState("");
  const [noteDrafts, setNoteDrafts] = useState({});
  const [priceDrafts, setPriceDrafts] = useState({});

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
  // const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scanLockRef = useRef(false);

  const renameInputRef = useRef(null);
  const newListInputRef = useRef(null);
  const editItemInputRef = useRef(null);
  const currencySearchInputRef = useRef(null);

  // ---------- New sections (UI-only shells: Master Items) ----------
  const MASTER_ITEMS = [
    { name: "Basmati Rice", category: "Kitchen", unit: "kg" },
    { name: "Milk", category: "Dairy", unit: "litre" },
    { name: "Eggs", category: "Dairy", unit: "packet" },
    { name: "Bread", category: "Bakery", unit: "loaf" },
    { name: "Onions", category: "Produce", unit: "kg" },
    { name: "Tomatoes", category: "Produce", unit: "kg" },
    { name: "Cooking Oil", category: "Kitchen", unit: "litre" },
    { name: "Sugar", category: "Kitchen", unit: "kg" },
  ];

  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [dailyTestPickerOpen, setDailyTestPickerOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [confirmNewTripOpen, setConfirmNewTripOpen] = useState(false);

  // ---------- Cloud sync (Google sign-in + Neon backend) ----------
  const { user, authLoading, signingIn, signIn, signOut } = useAuth();
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudMembersByList, setCloudMembersByList] = useState({}); // listId -> members[] (from GET /lists)
  const [pendingInvitesByList, setPendingInvitesByList] = useState({}); // listId -> invites[] sent but not yet accepted
  const [receivedInvites, setReceivedInvites] = useState([]); // invites addressed TO me, not yet answered
  const [respondingInviteId, setRespondingInviteId] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false); // notifications panel (opened by the header bell)
  const [activity, setActivity] = useState([]); // non-actionable notifications: { id, kind, text, at, read }
  const notifAnim = useRef(new Animated.Value(0)).current;
  const [invitesOpen, setInvitesOpen] = useState(false); // "Pending invitations" popup (Family tab row)
  const invitesAnim = useRef(new Animated.Value(0)).current;
  const [makingShareable, setMakingShareable] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState(null);
  const [busyMemberId, setBusyMemberId] = useState(null); // userId currently being role-changed or removed
  const showSearch = tab === "home"||tab === "add";
  const badgeCount = receivedInvites.length + activity.filter((a) => !a.read).length;
  // Live mirrors so socket handlers can read current values synchronously
  // instead of smuggling them out of setState updaters (which React may run later).
  const receivedInvitesRef = useRef(receivedInvites);
  receivedInvitesRef.current = receivedInvites;
  const pendingInvitesRef = useRef(pendingInvitesByList);
  pendingInvitesRef.current = pendingInvitesByList;

  // Pull down every list this account owns or has been shared into, once
  // right after sign-in. Cloud lists are merged in alongside any local-only
  // lists (kept exactly as they were, untouched) rather than replacing them.
  // Callable by name (not just as an effect) so the foreground/reconnect
  // listeners below can trigger the exact same reconciliation that runs on
  // sign-in — e.g. picking up a member removal that happened while this
  // device was backgrounded or offline and missed the live socket event.
  const syncCloudLists = useRef(async () => {
    if (!user) return;
    setCloudSyncing(true);
    try {
      const { lists: cloudLists } = await fetchLists();
      const cloudIds = new Set(cloudLists.map((cl) => cl.id));

        // Derived values come from listsRef (synchronously) — never from a
        // side-effect inside a setState updater, which React is free to run later.
        const { legacyLocal, lostAccessIds, staleSeedIds } = mergeCloudOnSignIn(listsRef.current, cloudLists);
        setLists((prev) => mergeCloudOnSignIn(prev, cloudLists).next);
        if (lostAccessIds.length) {
          setItemsByList((p) => { const n = { ...p }; lostAccessIds.forEach((id) => delete n[id]); return n; });
          setCloudMembersByList((p) => { const n = { ...p }; lostAccessIds.forEach((id) => delete n[id]); return n; });
          setSelectedListId((cur) => (lostAccessIds.includes(cur) ? null : cur));
        }
        if (staleSeedIds.length) {
          setItemsByList((p) => { const n = { ...p }; staleSeedIds.forEach((id) => delete n[id]); return n; });
          setSelectedListId((cur) => (staleSeedIds.includes(cur) ? null : cur));
        }

        const neverMigrated = legacyLocal.filter((l) => !l.role);

        for (const l of neverMigrated) {
          let migrateResult;
          try {
            migrateResult = await createListApi(l.id, l.name);
          } catch (e) {
            setNotice(`Couldn't move "${l.name}" to the cloud: ${e?.message || "unknown error"}`);
            continue; // don't attempt its items against a list that never landed
          }

          if (!migrateResult?.queued) {
            setLists((prev) => prev.map((pl) => (pl.id === l.id ? { ...pl, cloudConfirmed: true } : pl)));
          }
          const existingItems = Object.values(itemsByList[l.id] || {});
          for (const it of existingItems) {
            try {
              await createItemApi(l.id, { id: it.id, name: it.name, category: it.category, unit: it.unit, price: it.price || null });
              if (it.checked || it.skipped || it.qty || it.note) {
                await updateItemApi(l.id, it.id, { checked: it.checked, skipped: it.skipped, qty: it.qty, note: it.note });
              }
            } catch (e) {
              setNotice(`Couldn't sync "${it.name}" from "${l.name}": ${e?.message || "unknown error"}`);
            }
          }
        }

        const pendingListIds = getPendingSyncListIds();
        setItemsByList((prev) => {
          const next = { ...prev };
          for (const cl of cloudLists) {
            if (pendingListIds.has(cl.id)) continue;
            next[cl.id] = arrayToItemMap(cl.items);
          }
          return next;
        });
        setCloudMembersByList((prev) => {
          const next = { ...prev };
          for (const cl of cloudLists) next[cl.id] = cl.members;
          return next;
        });
        // If nothing is selected yet (or the only thing selected was the
        // placeholder local default list) and cloud lists exist, land on one.
      setSelectedListId((cur) =>
        pickListId(cur, cloudLists, listsRef.current, [...lostAccessIds, ...staleSeedIds])
      );
      } catch (e) {
        setNotice(`Couldn't load your cloud lists: ${e?.message || "network error"}`);
      } finally {
        setCloudSyncing(false);
      }
      try {
        const { received } = await fetchInvites();
        setReceivedInvites(received || []);
      } catch { /* non-fatal — the invite banner just stays empty */ }
  }).current;

  useEffect(() => {
    if (!user || !appLoaded) return;
    syncCloudLists();
  }, [user?.id, appLoaded]);

  // Re-run the same cloud reconciliation whenever the app comes back to the
  // foreground — covers a member removal (or role change) that happened
  // while this device was backgrounded and missed the live socket event.
  useEffect(() => {
    if (!user) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") syncCloudLists();
    });
    return () => sub.remove();
  }, [user, syncCloudLists]);

  // One invitation card (avatar, who/what, permission chip, Decline / Accept).
  // Shared by the bell's notification panel and the Family tab's invitations popup.
  function renderInviteCard(invite) {
    const senderLabel = invite.sender?.name || invite.sender?.email || "Someone";
    const isResponding = respondingInviteId === invite.id;
    const canEdit = invite.role !== "READ";
    return (
      <View key={invite.id} style={[s.itemCard, { gap: 12 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={s.avatarCircle}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{senderLabel.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.itemName} numberOfLines={1}>{senderLabel}</Text>
            <Text style={s.itemUnit} numberOfLines={2}>
              {invite.inviteAllLists ? "invited you to join their family" : `invited you to "${invite.listName}"`}
            </Text>
          </View>
          <View style={[s.permBadge, { marginRight: 0, flexDirection: "row", alignItems: "center", gap: 4 }]}>
            {canEdit ? <Pencil size={11} color={t.accent} /> : <Eye size={11} color={t.accent} />}
            <Text style={{ color: t.accent, fontSize: 11, fontWeight: "700" }}>{canEdit ? "Can edit" : "Can view"}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={() => respondToInvite(invite, false)}
            disabled={isResponding}
            style={[s.smallBtn, { flex: 1, alignItems: "center", paddingVertical: 11, opacity: isResponding ? 0.5 : 1 }]}
          >
            <Text style={s.smallBtnText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => respondToInvite(invite, true)}
            disabled={isResponding}
            style={[s.addItemBtn, { flex: 2, marginLeft: 0, justifyContent: "center", opacity: isResponding ? 0.6 : 1 }]}
          >
            {isResponding ? <ActivityIndicator color="#fff" /> : (<><Check size={15} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Accept</Text></>)}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Adds a non-actionable entry to the notification panel (newest first).
  // kind: "accepted" | "declined" | "revoked" | "info". Any part of the app
  // can call this to surface a notification — it only touches a state setter.
  function pushActivity(kind, text) {
    setActivity((prev) => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind, text, at: Date.now(), read: false }, ...prev].slice(0, 30));
  }

  // Family tab's "Pending invitations" popup — a separate centred dialog that
  // only handles invites (the bell's panel is the general notification centre).
  function openInvites() {
    invitesAnim.setValue(0);
    setInvitesOpen(true);
    Animated.timing(invitesAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    fetchInvites()
      .then(({ received }) => setReceivedInvites(received || []))
      .catch(() => {});
  }
  function closeInvites() { setInvitesOpen(false); }

  // Once the last pending invite is answered there's nothing left to show.
  useEffect(() => {
    if (invitesOpen && receivedInvites.length === 0) setInvitesOpen(false);
  }, [invitesOpen, receivedInvites.length]);

  function closeNotifications() {
    setNotifOpen(false);
    setActivity((prev) => (prev.some((a) => !a.read) ? prev.map((a) => (a.read ? a : { ...a, read: true })) : prev));
  }

  // Opens the notifications panel (drops down from the top) and quietly
  // re-syncs invites from the server so the list is never stale (an invite
  // may have been revoked since it arrived).
  function openNotifications() {
    notifAnim.setValue(0);
    setNotifOpen(true);
    Animated.timing(notifAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    fetchInvites()
      .then(({ received }) => setReceivedInvites(received || []))
      .catch(() => {});
  }

  // Accept/decline an invite someone sent *to* me. Accepting immediately
  // pulls the newly-shared list(s) so they show up without a manual refresh.
  async function respondToInvite(invite, accept) {
    setRespondingInviteId(invite.id);
    try {
      if (accept) {
        await acceptInvite(invite.id);
        const { lists: cloudLists } = await fetchLists();
        const cloudIds = new Set(cloudLists.map((cl) => cl.id));
        const { lostAccessIds } = mergeCloudOnAccept(listsRef.current, cloudLists);
        setLists((prev) => mergeCloudOnAccept(prev, cloudLists).next);
        if (lostAccessIds.length) {
          setItemsByList((p) => { const n = { ...p }; lostAccessIds.forEach((id) => delete n[id]); return n; });
          setCloudMembersByList((p) => { const n = { ...p }; lostAccessIds.forEach((id) => delete n[id]); return n; });
          setSelectedListId((cur) => (lostAccessIds.includes(cur) ? null : cur));
        }


        const pendingListIds = getPendingSyncListIds();
        setItemsByList((prev) => {
          const next = { ...prev };
          for (const cl of cloudLists) {
            if (pendingListIds.has(cl.id)) continue;
            next[cl.id] = arrayToItemMap(cl.items);
          }
          return next;
        });
        setCloudMembersByList((prev) => { const next = { ...prev }; for (const cl of cloudLists) next[cl.id] = cl.members; return next; });
        cloudLists.forEach((cl) => joinListRoom(cl.id));
        setNotice("Invite accepted — the list is now in your list switcher.");
      } else {
        await declineInvite(invite.id);
      }
      setReceivedInvites((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (e) {
      setNotice(`Couldn't ${accept ? "accept" : "decline"} that invite: ${e?.message || "network error"}`);
      if (e?.status === 404) {
        // 404 here specifically means the invite can never be actioned
        // again (already resolved elsewhere, revoked, or its list/owner is
        // gone) — retrying is pointless, so don't leave a dead card that
        // just keeps failing every time it's tapped.
        setReceivedInvites((prev) => prev.filter((i) => i.id !== invite.id));
      }
    } finally {
      setRespondingInviteId(null);
    }
  }

  useEffect(() => {
    onSyncDropped((op, err) => {
      const action = describeDroppedOp(op, listsRef.current);
      setNotice(`Couldn't ${action} — you may no longer have access, or it was removed. (${err?.message || "sync failed"})`);
    });
  }, []);

  // Live updates: keep every open device in sync while signed in. Socket
  // connection itself is opened/closed by AuthContext on sign-in/out — this
  // effect only (un)subscribes the listeners while it's live.
  useEffect(() => {
    if (!user) return;
    // AuthContext opens the socket on sign-in, which can land a tick after
    // this effect first runs — retry briefly instead of silently never subscribing.
    let detach = null;
    let retryTimer = null;
    let tries = 0;
    const attach = () => {
    const socket = getSocket();
    if (!socket) {
      if (tries++ < 20) retryTimer = setTimeout(attach, 500);
      return;
    }

    // All three of these are id-keyed map operations now, so it doesn't
    // matter whether this socket event arrives before or after the local
    // optimistic update for the same change — upserting/removing by id is
    // idempotent either way.
    const onItemCreated = ({ listId, item }) => upsertItem(listId, item);
    const onItemUpdated = ({ listId, item }) => upsertItem(listId, item);
    const onItemDeleted = ({ listId, itemId }) => removeItemFromList(listId, itemId);
    const onListUpdated = ({ listId, name }) =>
      setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, name } : l)));
    const onListDeleted = ({ listId }) => {
      setLists((prev) => prev.filter((l) => l.id !== listId));
      setItemsByList((prev) => { const p = { ...prev }; delete p[listId]; return p; });
      setSelectedListId((cur) => (cur === listId ? null : cur));
    };
    const onMemberChange = () => {
      // Cheapest correct way to keep member lists (roles, who's on the
      // list) fresh after a join/leave/role-change without hand-rolling
      // three separate partial-update shapes.
      fetchLists().then(({ lists: cloudLists }) => {
        const cloudIds = new Set(cloudLists.map((cl) => cl.id));
        setCloudMembersByList((prev) => {
          const next = { ...prev };
          for (const cl of cloudLists) next[cl.id] = cl.members;
          return next;
        });

        const lostIds = listsRef.current
          .filter((l) => l.cloudConfirmed && !cloudIds.has(l.id))
          .map((l) => l.id); // was cloud-confirmed, now missing -> access revoked
        setLists((prev) => {
          const stillMine = [];
          for (const l of prev) {
            if (!l.cloudConfirmed) { stillMine.push(l); continue; }
            const fresh = cloudLists.find((cl) => cl.id === l.id);
            if (fresh) stillMine.push({ ...l, role: fresh.role, name: fresh.name });
          }
          return stillMine;
        });
        if (lostIds.length) {
          setItemsByList((p) => { const n = { ...p }; lostIds.forEach((id) => delete n[id]); return n; });
          setCloudMembersByList((p) => { const n = { ...p }; lostIds.forEach((id) => delete n[id]); return n; });
          setSelectedListId((cur) => (lostIds.includes(cur) ? null : cur));
          setNotice("You no longer have access to a list that was removed from your account.");
        }
      }).catch(() => {});
    };

    socket.on("item:created", onItemCreated);
    socket.on("item:updated", onItemUpdated);
    socket.on("item:deleted", onItemDeleted);
    socket.on("list:updated", onListUpdated);
    socket.on("list:deleted", onListDeleted);
    socket.on("list:memberJoined", onMemberChange);
    socket.on("list:memberRemoved", onMemberChange);
    socket.on("list:memberRoleChanged", onMemberChange);
    const onInviteReceived = ({ invite }) => {
      setReceivedInvites((prev) => (prev.some((i) => i.id === invite.id) ? prev : [invite, ...prev]));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setNotice(`${invite.sender?.name || invite.sender?.email || "Someone"} sent you an invitation — tap the bell.`);
    };
    socket.on("invite:received", onInviteReceived);

    // Push accept/decline back to the SENDER's Pending Invites panel live,

    const scrubSentInvite = (inviteId) => {
      let matched = null;
      for (const invites of Object.values(pendingInvitesRef.current || {})) {
        const found = invites.find((inv) => inv.id === inviteId);
        if (found) { matched = found; break; }
      }
      setPendingInvitesByList((prev) => {
        const next = {};
        for (const [listId, invites] of Object.entries(prev)) next[listId] = invites.filter((inv) => inv.id !== inviteId);
        return next;
      });
      return matched;
    };
    const onInviteAccepted = ({ inviteId }) => {
      const matched = scrubSentInvite(inviteId);
      if (matched) {
        const msg = `${matched.recipientEmail} accepted your invite${matched.list ? ` to "${matched.list.name}"` : ""}.`;
        setNotice(msg);
        pushActivity("accepted", msg);
      }
    };
    const onInviteDeclined = ({ inviteId }) => {
      const matched = scrubSentInvite(inviteId);
      if (matched) {
        const msg = `${matched.recipientEmail} declined your invite${matched.list ? ` to "${matched.list.name}"` : ""}.`;
        setNotice(msg);
        pushActivity("declined", msg);
      }
    };
    socket.on("invite:accepted", onInviteAccepted);
    socket.on("invite:declined", onInviteDeclined);

    // Push revoke back to the RECIPIENT live — previously they only found
    // out by tapping Accept/Decline and getting a stale "not found".
    const onInviteRevoked = ({ inviteId }) => {
      const existed = receivedInvitesRef.current.some((i) => i.id === inviteId);
      setReceivedInvites((prev) => prev.filter((i) => i.id !== inviteId));
      if (existed) {
        setNotice("An invitation was withdrawn by the sender.");
        pushActivity("revoked", "An invitation was withdrawn by the sender.");
      }
    };
    socket.on("invite:revoked", onInviteRevoked);

    // A standing family member (accepted an "all my lists" invite) gets
    // this the instant the owner creates a NEW list — no separate
    // invite/accept round-trip needed for lists that come later.
    const onListGranted = ({ list }) => {
      setLists((prev) => {
        if (prev.some((l) => l.id === list.id)) return prev; // already have it somehow — don't duplicate
        return [...prev, { id: list.id, name: list.name, ownerId: list.ownerId, role: list.role, createdAt: new Date(list.createdAt).getTime(), cloudConfirmed: true }];
      });
      setItemsByList((prev) => (prev[list.id] ? prev : { ...prev, [list.id]: arrayToItemMap(list.items) }));
      setCloudMembersByList((prev) => ({ ...prev, [list.id]: list.members }));
      joinListRoom(list.id);
      const ownerMember = list.members.find((m) => m.role === "OWNER");
      const grantedMsg = `${ownerMember?.name || ownerMember?.email || "A family member"} added you to "${list.name}".`;
      setNotice(grantedMsg);
      pushActivity("info", grantedMsg);
    };
    socket.on("list:granted", onListGranted);
    // Picks up anything missed (e.g. a removal) while this socket was
    // disconnected — same reconciliation the sign-in/foreground paths use.
    socket.on("connect", syncCloudLists);

    detach = () => {
      socket.off("item:created", onItemCreated);
      socket.off("item:updated", onItemUpdated);
      socket.off("item:deleted", onItemDeleted);
      socket.off("list:updated", onListUpdated);
      socket.off("list:deleted", onListDeleted);
      socket.off("list:memberJoined", onMemberChange);
      socket.off("list:memberRemoved", onMemberChange);
      socket.off("list:memberRoleChanged", onMemberChange);
      socket.off("invite:received", onInviteReceived);
      socket.off("invite:accepted", onInviteAccepted);
      socket.off("invite:declined", onInviteDeclined);
      socket.off("invite:revoked", onInviteRevoked);
      socket.off("list:granted", onListGranted);
      socket.off("connect", syncCloudLists);
    };
    };
    attach();
    return () => { clearTimeout(retryTimer); if (detach) detach(); };
  }, [user]);

      useEffect(() => {
    if (!user) return;

    const handle = ({ type, data }) => {
      switch (type) {
        case PUSH_TYPES.INVITE_RECEIVED:
          // Refresh from the server rather than trusting the payload —
          // the invite may already have been revoked since it was sent.
          openInvites(); // re-fetches the invites itself
          break;

        case PUSH_TYPES.INVITE_ACCEPTED:
        case PUSH_TYPES.INVITE_DECLINED:
          setTab("family");
          break;

        case PUSH_TYPES.LIST_GRANTED:
          // Only ever select a list we actually have. If it hasn't loaded yet
          // (cold start), remember it and select it the moment it appears.
          if (typeof data?.listId === "string") {
            if (listsRef.current.some((l) => l.id === data.listId)) { setSelectedListId(data.listId); setTab("home"); }
            else pendingSelectRef.current = data.listId;
          }
          break;
          case PUSH_TYPES.MEMBER_REMOVED:
          refreshMembership();
          break;

        default:
          break;
      }
    };

    const unsubscribe = notificationService.onTap(handle);
    notificationService.getInitialTap().then((tap) => { if (tap) handle(tap); });
    return unsubscribe;
  }, [user]);

  // ---------- Load everything from local storage once, on mount ----------
  useEffect(() => {
    (async () => {
      const state = await loadState();
      setProfile(state.profile || { name: "" });
      setDark(state.theme !== "light");
      setLists(state.lists);
      setSelectedListId(state.selectedListId);
      // One-time migration: itemsByList used to store `listId -> item[]`.
      // It's now `listId -> { itemId: item }`. Anyone with existing local
      // data would otherwise get `Object.values`/map ops on an array,
      // which happens to work by accident for reads but breaks writes —
      // so convert once on load and never touch this shape again.
      const rawItemsByList = state.itemsByList || {};
      const migrated = {};
      for (const listId of Object.keys(rawItemsByList)) {
        const value = rawItemsByList[listId];
        migrated[listId] = Array.isArray(value) ? arrayToItemMap(value) : value;
      }
      setItemsByList(migrated);
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
      })  
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

  // On unmount, don't drop a delete that's still inside its undo window —
  // send it to the server now instead of just cancelling its timer.
  useEffect(() => {
    return () => {
      const pd = pendingDeleteRef.current;
      if (pd) { clearTimeout(pd.timer); deleteItemApi(pd.listId, pd.item.id).catch(() => {}); }
    };
  }, []);

  // const dailyTestSettings = profile.dailyTest || { hour: DAILY_TEST_DEFAULT_HOUR, minute: DAILY_TEST_DEFAULT_MINUTE, notifIds: [] };

  // Floating toast driven by `notice`: fades in, auto-dismisses (errors stay
  // longest), tap to dismiss, and never shifts the layout.
  const [toast, setToast] = useState(null); // { msg, kind } — kept during fade-out
  const toastAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!notice) {
      Animated.timing(toastAnim, { toValue: 0, duration: 160, useNativeDriver: true })
        .start(({ finished }) => { if (finished) setToast(null); });
      return;
    }
    const kind = noticeKind(notice);
    setToast({ msg: notice, kind });
    if (kind === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    Animated.timing(toastAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const timer = setTimeout(() => setNotice(""), noticeDuration(notice, kind));
    return () => clearTimeout(timer);
  }, [notice]);

  // Daily testing reminder: re-lays the batch on every app load, whenever
  // the time changes, or when the app comes to the foreground — i.e. any
  // sign of the tester actually being here. Must stay above the
  // `if (!appLoaded)` early return below, like every other hook in this
  // component — hooks can't be called conditionally.

// One-time cleanup of the old daily testing reminders still queued in the OS.
// Remove after a few app releases.
useEffect(() => {
  if (!appLoaded) return;
  (async () => {
    try {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      for (const n of all) {
        const isDailyTest =
          n.content?.title === "MindCart" ||
          DAILY_TEST_MESSAGES.includes(n.content?.body);
        if (isDailyTest) {
          await Notifications.cancelScheduledNotificationAsync(n.identifier);
        }
      }
    } catch {}
  })();
}, [appLoaded]);

  // useEffect(() => {
  //   if (!appLoaded) return;
  //   const hour = Number(dailyTestSettings.hour) ?? DAILY_TEST_DEFAULT_HOUR;
  //   const minute = Number(dailyTestSettings.minute) ?? DAILY_TEST_DEFAULT_MINUTE;
  //   scheduleDailyTestReminders(hour, minute, dailyTestSettings.notifIds);
  //   const sub = AppState.addEventListener("change", (nextState) => {
  //     if (nextState === "active") scheduleDailyTestReminders(hour, minute, dailyTestSettings.notifIds);
  //   });
  //   return () => sub.remove();
  //   // eslint-disable-next-line
  // }, [appLoaded, dailyTestSettings.hour, dailyTestSettings.minute]);

  const t = useMemo(() => getTheme(dark), [dark]);
  const s = useMemo(() => makeStyles(t), [t]);

  // Currency lives on the profile object, which is already persisted and
  // loaded as one blob (see the load/save effects above), so no changes
  // to storage.js are needed for this to survive a restart. A profile
  // saved before this feature existed simply has no `currency` yet —
  // that's exactly the signal used below to show the first-launch picker.
  const currency = profile.currency || DEFAULT_CURRENCY;
  const needsCurrencySetup = appLoaded && !profile.currency;
  const reminderSettings = profile.reminders || { enabled: false, days: 5 };
  // Undefined (a profile saved before this setting existed) means "on" —
  // only an explicit `false` hides the tab, so nobody's bottom nav
  // silently changes shape on their next app update.
  const showMasterTab = profile.showMasterTab !== false;

  // items/selectedList and the useMemo below must stay ABOVE the
  // `if (!appLoaded)` early return — hooks can't be called conditionally,
  // and useMemo is a hook, so it has to run on every render regardless of
  // whether the loader is about to be shown instead.
  //
  // ---------- Items storage: a map keyed by id, per list ----------
  // itemsByList[listId] is { [itemId]: item }, NOT an array. A map can't
  // hold two entries under the same key, so "the same item got added
  // twice" (from a REST response and a socket broadcast both trying to
  // add it) becomes structurally impossible instead of something every
  // call site has to remember to guard against.
  // `items` (below) is the sorted array view used everywhere else in the
  // component — nothing downstream of `items` needs to know storage is a
  // map at all.
  // selectedList first, and `items` keyed on ITS id: when selectedListId is
  // null/stale the header shows lists[0], so the items must come from
  // lists[0] too (they used to come from itemsByList[null] = empty).
  const selectedList = lists.find((l) => l.id === selectedListId) || lists[0];
  const items = useMemo(() => {
    const map = itemsByList[selectedList?.id] || {};
    return Object.values(map).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [itemsByList, selectedList?.id]);

  // Keep selectedListId pointing at a real list, so every action that reads
  // it (add / edit / delete item, new trip…) targets the list on screen.
  useEffect(() => {
    if (!appLoaded || lists.length === 0) return;
    if (!lists.some((l) => l.id === selectedListId)) {
      const best = lists.find((l) => l.role === "OWNER") || lists.find((l) => !l.role) || lists[0];
      setSelectedListId(best.id);
    }
  }, [appLoaded, lists, selectedListId]);

  // Refresh pending invites for a list right when its Family tab is opened,
  // rather than polling constantly in the background. (Lives below the
  // `selectedList` declaration on purpose — above it, the dependency array
  // read `selectedList` before it existed, so it was always `undefined` and
  // switching lists while on the Family tab never refreshed.)
  useEffect(() => {
    if (tab === "family" && selectedList?.role) refreshInvitesForList(selectedList.id);
    // eslint-disable-next-line
  }, [tab, selectedList?.id]);

  // A list tapped from a push notification before it had loaded.
  useEffect(() => {
    const want = pendingSelectRef.current;
    if (want && lists.some((l) => l.id === want)) {
      pendingSelectRef.current = null;
      setSelectedListId(want);
      setTab("home");
    }
  }, [lists]);

  // Signing out (or switching accounts) must not leave the previous account's
  // invites, activity or member lists in memory for the next person.
  useEffect(() => {
    if (user) return;
    setReceivedInvites([]);
    setPendingInvitesByList({});
    setCloudMembersByList({});
    setActivity([]);
    setNotifOpen(false);
    setInvitesOpen(false);
  }, [user]);
  // A READ-only collaborator could otherwise tap every add/check/edit/delete
  // control in the UI (none of them are currently disabled for that role) —
  // the server would correctly reject the write, but only after the local
  // state was already optimistically changed, leaving their screen showing
  // something that silently never saved. Local-only lists have no role and
  // are always writable.
  const canWrite = !selectedList?.role || selectedList.role !== "READ";

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
    const boughtTotal = boughtItems.reduce((sum, i) => sum + safeAmount(i.price), 0);
    const pendingTotal = pendingItems.reduce((sum, i) => sum + safeAmount(i.price), 0);
    return { filtered, searchMatch, itemCategories, boughtItems, pendingItems, skippedItems, boughtTotal, pendingTotal };
    // eslint-disable-next-line
  }, [items, debouncedSearch]);
  const { filtered, searchMatch, itemCategories, boughtItems, pendingItems, skippedItems, boughtTotal, pendingTotal } = derived;
  const noSearchResults = debouncedSearch.trim() && filtered.length === 0;

  // "Start new trip" resets every item back to { checked:false, skipped:false,
  // note:"", qty:0, price:"" }. The button should only be enabled when at
  // least one item is NOT already sitting in that exact reset position —
  // i.e. when pressing it would actually change something.
  const tripDirty = items.some((i) => {
    const hasNote = !!(i.note && i.note.trim());
    const hasPrice = !(i.price === "" || i.price === null || i.price === undefined);
    return i.checked || i.skipped || hasNote || hasPrice || Number(i.qty) !== 0;
  });

  if (!appLoaded || authLoading) return <Loader t={{ bg: "#12141A", muted: "#8B92A3", accent: "#1FAD5C" }} />;

  // Sign-in is mandatory: no user, no app. This check re-runs on every
  // render, so it also covers sign-out — the moment signOut() clears
  // `user`, this becomes true again and the login screen comes back,
  // without any extra "redirect" logic needed.
  if (!user) {
    return (
      <OnboardingScreen
        t={t} dark={dark} signingIn={signingIn}
        onGetStarted={signIn}
      />
    );
  }

  // setListItems' updater now receives/returns the { itemId: item } map for
  // this list, not an array. upsertItem/removeItemFromList/patchItem below
  // are the only primitives the rest of the component should need — every
  // one of them is safe to call twice with the same item/id, which is the
  // whole point (REST responses and socket broadcasts can both fire for
  // the same change, in either order).
  function setListItems(listId, updater) {
    setItemsByList((prev) => ({ ...prev, [listId]: updater(prev[listId] || {}) }));
  }
  function upsertItem(listId, item) {
    setListItems(listId, (map) => ({ ...map, [item.id]: item }));
  }
  function upsertItems(listId, itemsArr) {
    setListItems(listId, (map) => ({ ...map, ...arrayToItemMap(itemsArr) }));
  }
  function removeItemFromList(listId, itemId) {
    setListItems(listId, (map) => {
      if (!(itemId in map)) return map;
      const next = { ...map };
      delete next[itemId];
      return next;
    });
  }
  function patchItem(listId, itemId, patch) {
    setListItems(listId, (map) => (map[itemId] ? { ...map, [itemId]: { ...map[itemId], ...patch } } : map));
  }
  // Replaces a locally-generated optimistic id with the server's
  // authoritative item once the create request resolves. If the backend
  // happens to honor the client-supplied id, oldId === newItem.id and this
  // is just a plain upsert; if the backend generates its own id instead,
  // this still leaves exactly one copy of the item under the right key.
  function reconcileOptimisticItem(listId, oldId, newItem) {
    setListItems(listId, (map) => {
      const next = { ...map };
      delete next[oldId];
      next[newItem.id] = newItem;
      return next;
    });
  }

  // ---------- List management ----------
  function openNewListModal() {
    setNewListName("");
    setListNameError("");
    setNewListModalOpen(true);
  }
  async function addList() {
    const err = validateListName(newListName, lists);
    setListNameError(err);
    if (err) return;
    const name = newListName.trim();

    // Every list is a cloud list from creation now, under a permanent
    // client-generated id (see makeId/storage.js). createListApi tries
    // the network immediately; if there's no connection it queues the
    // create instead of failing, so this succeeds either way — the list
    // just shows as `pending` until the queue flushes and the real
    // server copy comes back over the socket.
    const id = makeId("list");
    const createdAt = Date.now();
    let queued = false;
    try {
      const result = await createListApi(id, name);
      queued = !!result.queued;
    } catch (e) {
      setListNameError(e?.message || "Couldn't create this list.");
      return;
    }

    setLists((prev) => [...prev, { id, name, role: "OWNER", createdAt, lastActivityAt: Date.now(), pending: queued }]);
    setItemsByList((prev) => ({ ...prev, [id]: {} }));
    setCloudMembersByList((prev) => ({ ...prev, [id]: [{ ...user, role: "OWNER" }] }));
    joinListRoom(id);
    setSelectedListId(id);
    setNewListName("");
    setListNameError("");
    setNewListModalOpen(false);
    if (reminderSettings.enabled) scheduleReminderForList({ id, name }, Number(reminderSettings.days) || 5);
  }
  function startRenameList(list) {
    setRenamingListId(list.id);
    setRenameDraft(list.name);
    setListNameError("");
  }
  function commitRenameList() {
    const err = validateListName(renameDraft, lists, renamingListId);
    if (err) { setListNameError(err); return; }
    const name = renameDraft.trim();
    const target = lists.find((l) => l.id === renamingListId);
    if (target?.role && target.role !== "OWNER" && target.role !== "WRITE") {
      setNotice("You have view-only access to this list.");
      setRenamingListId(null);
      return;
    }
    setLists((prev) => prev.map((l) => (l.id === renamingListId ? { ...l, name } : l)));
    setRenamingListId(null);
    setRenameDraft("");
    setListNameError("");
    renameListApi(renamingListId, name).catch((e) => {
      if (target) setLists((prev) => prev.map((l) => (l.id === target.id ? { ...l, name: target.name } : l)));
      setNotice(`Rename didn't save, so it's been undone: ${e?.message || "network error"}`);
    });
  }
  function deleteList(listId) {
    const removed = lists.find((l) => l.id === listId);
    if (!removed) { setConfirmDeleteListId(null); return; }
    // Only the owner can delete a shared list — the server rejects it for
    // anyone else and the list would just reappear on the next sync.
    if (removed.role && removed.role !== "OWNER") {
      setNotice("Only the owner can delete a shared list.");
      setConfirmDeleteListId(null);
      return;
    }
    if (lists.length <= 1) {
      setNotice("You need at least one list — create another before deleting this one.");
      setConfirmDeleteListId(null);
      return;
    }
    const remaining = lists.filter((l) => l.id !== listId);
    const removedItems = itemsByList[listId];
    if (removed.reminderNotifId) { Notifications.cancelScheduledNotificationAsync(removed.reminderNotifId).catch(() => {}); }
    setLists(remaining);
    setItemsByList((prev) => { const p = { ...prev }; delete p[listId]; return p; });
    setCloudMembersByList((prev) => { const p = { ...prev }; delete p[listId]; return p; });
    if (selectedListId === listId) setSelectedListId(remaining[0].id);
    setConfirmDeleteListId(null);
    deleteListApi(listId).catch((e) => {
      // A real failure (an offline delete is queued, not thrown): the list
      // still exists on the server, so bring it back instead of letting it
      // silently vanish here and reappear on the next sync.
      setLists((prev) => (prev.some((l) => l.id === removed.id) ? prev : [...prev, removed]));
      if (removedItems) setItemsByList((prev) => ({ ...prev, [listId]: removedItems }));
      setNotice(`Couldn't delete "${removed.name}", so it's back: ${e?.message || "network error"}`);
    });
  }

  // ---------- Family sharing ----------
  // Every list gets created in the cloud from the start now (see addList),
  // so in normal use this never has anything to do. It only matters for
  // lists that predate this change and are still sitting around without a
  // `role` (the mount-time migration below promotes those automatically,
  // but this is a manual fallback for the same case). Since the list and
  // its items already own their permanent ids, this just pushes the
  // EXISTING ids to the server — no more re-creating everything under new
  // ids, which is also what makes it safe to retry if it's interrupted.
  async function makeListShareable(list) {
    if (!user) { signIn(); return; }
    setMakingShareable(true);
    try {
      const result = await createListApi(list.id, list.name);
      const existing = Object.values(itemsByList[list.id] || {});
      for (const it of existing) {
        await createItemApi(list.id, { id: it.id, name: it.name, category: it.category, unit: it.unit, price: it.price || null });
        if (it.checked || it.skipped || it.qty || it.note) {
          await updateItemApi(list.id, it.id, { checked: it.checked, skipped: it.skipped, qty: it.qty, note: it.note });
        }
      }
      // Only mark it cloudConfirmed if the create actually reached the
      // server — if it got queued offline instead, the sign-in sync's
      // cloudIds check (and the socket handlers' cloudConfirmed check)
      // need to keep treating it as "not yet on the server" until the
      // queue actually flushes it, or it'd risk being swept up by the
      // member-change/accept-invite cleanup logic before it's really there.
      setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, role: "OWNER", cloudConfirmed: !result?.queued } : l)));
      setCloudMembersByList((prev) => ({ ...prev, [list.id]: [{ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, role: "OWNER" }] }));
      joinListRoom(list.id);
      setNotice(`"${list.name}" is now shareable.`);
    } catch (e) {
      setNotice(`Couldn't move this list to the cloud: ${e?.message || "network error"}`);
    } finally {
      setMakingShareable(false);
    }
  }

  async function refreshInvitesForList(listId) {
    try {
      const { sent } = await fetchInvites();
      const mine = sent.filter((inv) => inv.status === "PENDING" && (inv.listId === listId || inv.inviteAllLists));
      setPendingInvitesByList((prev) => ({ ...prev, [listId]: mine }));
    } catch { /* best-effort — the members list still works without this */ }
  }

  // role: "READ" | "WRITE". allLists=true invites as a standing family
  // member across every list the owner has (and will create) instead of
  // just this one — the better option for an actual household, not just a
  // one-off shared list.
  async function inviteFamilyMember(list, { email, role, allLists }) {
    try {
      await sendInvite({ recipientEmail: email, role, listId: allLists ? undefined : list.id, allLists: !!allLists });
      setNotice(allLists ? `Invited ${email} as a family member — they'll get every list you own.` : `Invited ${email} to "${list.name}".`);
      refreshInvitesForList(list.id);
    } catch (e) {
      setNotice(`Invite failed: ${e?.message || "network error"}`);
    }
  }
  async function revokeFamilyInvite(inviteId, listId) {
    setRevokingInviteId(inviteId);
    try { await revokeInvite(inviteId); refreshInvitesForList(listId); }
    catch (e) { setNotice(`Couldn't revoke invite: ${e?.message || "network error"}`); }
    finally { setRevokingInviteId(null); }
  }
  async function changeFamilyMemberRole(listId, userId, role) {
    setBusyMemberId(userId);
    try {
      await changeMemberRoleApi(listId, userId, role);
      setCloudMembersByList((prev) => ({ ...prev, [listId]: (prev[listId] || []).map((m) => (m.id === userId ? { ...m, role } : m)) }));
    } catch (e) {
      setNotice(`Couldn't change that member's role: ${e?.message || "network error"}`);
    } finally {
      setBusyMemberId(null);
    }
  }
  async function removeFamilyMember(listId, userId) {
    setBusyMemberId(userId);
    try {
      await removeMemberApi(listId, userId);
      setCloudMembersByList((prev) => ({ ...prev, [listId]: (prev[listId] || []).filter((m) => m.id !== userId) }));
    } catch (e) {
      setNotice(`Couldn't remove that member: ${e?.message || "network error"}`);
    } finally {
      setBusyMemberId(null);
    }
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
        trigger: { type: Notifications.SchedulableTriggerInputTypes?.TIME_INTERVAL, seconds: Math.min(365, Math.max(1, Number(days) || 5)) * 24 * 60 * 60, channelId: "default" },
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
  // ---------- Master tab visibility ----------
  // Lets someone who doesn't use the quick-add "Master Items" shelf hide
  // it from their bottom nav. Toggling it off while it's the active tab
  // bounces back to Home so the app never leaves a hidden tab selected.
  function toggleMasterTab(nextShown) {
    setProfile((prev) => ({ ...prev, showMasterTab: nextShown }));
    if (!nextShown && tab === "master") setTab("home");
  }
  async function updateReminderDays(value) {
    setProfile((prev) => ({ ...prev, reminders: { ...(prev.reminders || {}), enabled: prev.reminders?.enabled || false, days: value } }));
    if (reminderSettings.enabled) {
      const days = Number(value) || 5;
      for (const l of lists) await scheduleReminderForList(l, days);
    }
  }
  // ---------- Daily testing reminder ----------
  // Always on (no user toggle) — runs for every install during closed
  // testing. Manually remove this feature/effect once testing ends.
  async function cancelDailyTestNotifications(ids) {
    for (const id of ids || []) {
      try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
    }
  }
  // Wipes any previously-scheduled batch and lays down a fresh
  // DAILY_TEST_LOOKAHEAD_DAYS run starting tomorrow, Day 1 of the cycle, at
  // the given hour:minute. Calling this on every app open is what keeps
  // daily users from ever seeing these — their "tomorrow" keeps getting
  // pushed forward. Requests notification permission on the fly since
  // there's no separate enable toggle to trigger the prompt.
  // async function scheduleDailyTestReminders(hour, minute, currentIds) {
  //   let perm = await Notifications.getPermissionsAsync();
  //   if (!perm.granted) {
  //     try { perm = await Notifications.requestPermissionsAsync(); } catch {}
  //   }
  //   if (!perm.granted) return; // no permission — nothing to schedule yet, will retry next app open
  //   await cancelDailyTestNotifications(currentIds);
  //   const ids = [];
  //   const now = new Date();
  //   for (let dayOffset = 1; dayOffset <= DAILY_TEST_LOOKAHEAD_DAYS; dayOffset++) {
  //     const fireDate = new Date(now);
  //     fireDate.setDate(fireDate.getDate() + dayOffset);
  //     fireDate.setHours(hour, minute, 0, 0);
  //     const message = DAILY_TEST_MESSAGES[(dayOffset - 1) % DAILY_TEST_MESSAGES.length];
  //     try {
  //       const id = await Notifications.scheduleNotificationAsync({
  //         content: { title: "MindCart", body: message },
  //         trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate, channelId: "default" },
  //       });
  //       ids.push(id);
  //     } catch {
  //       // scheduling can fail without permission — safe to skip that day
  //     }
  //   }
  //   setProfile((prev) => ({ ...prev, dailyTest: { ...(prev.dailyTest || {}), hour, minute, notifIds: ids } }));
  // }
  function updateDailyTestTime(hour, minute) {
    setProfile((prev) => ({ ...prev, dailyTest: { ...(prev.dailyTest || {}), hour, minute } }));
  }
  // Display-only helper — storage/scheduling still use 24h hour/minute
  // numbers throughout; this just formats them as "8:00 PM" for the UI.
  function formatTime12h(hour, minute) {
    const h = Number(hour);
    const m = Number(minute);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
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
        trigger: { type: Notifications.SchedulableTriggerInputTypes?.TIME_INTERVAL, seconds: 3, channelId: "default" },
      });
      setNotice("Test notification sent — it should appear in about 3 seconds.");
    } catch (e) {
      setNotice(`Couldn't send the test notification: ${e?.message || "unknown error"}`);
    }
  }

  // ---------- Item management ----------
  async function addItem() {
    if (!canWrite) { setNotice("You have view-only access to this list."); return; }
    if (!fName.trim()) {
      tapHaptic(Haptics.ImpactFeedbackStyle.Light);
      setItemNameError("Type an item name first.");
      return;
    }
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
      tapHaptic(Haptics.ImpactFeedbackStyle.Light);
      setItemNameError(summarizeItemErrors(errors) || "Enter a valid item name.");
      return;
    }
    setItemNameError("");

    animateListChange();

    // Optimistic: show the item immediately under its permanent,
    // client-generated id (this is the SAME id the server will store it
    // under, online or not — see makeId/storage.js). createItemApi tries
    // the network right away; if that fails only because there's no
    // connection, it queues the write and resolves anyway (queued: true)
    // instead of throwing, so the item just stays on screen marked
    // `pending` until the real server copy arrives over the socket once
    // the queue flushes. A genuine failure (bad request, no permission)
    // still throws and gets rolled back below.
    for (const name of toAdd) {
      const id = makeId("item");
      upsertItem(selectedListId, {
        id, name, category, qty: 0, unit: fUnit, price: fPrice || "",
        checked: false, skipped: false, note: "", createdAt: Date.now(), pending: true,
      });
      try {
        const { item, queued } = await createItemApi(selectedListId, { id, name, category, unit: fUnit, price: fPrice || null });
        // reconcileOptimisticItem (not upsertItem): if the server ever
        // returns a different id than the one we optimistically rendered
        // under, this removes the stale local-id copy instead of leaving
        // two entries on screen for one saved row.
        if (!queued) reconcileOptimisticItem(selectedListId, id, item); // clears pending; if queued it stays pending until the socket confirms it later
      } catch (e) {
        if (e?.status === 404) {
          // The list looks synced locally (it has a role) but doesn't
          // actually exist on the server — most likely an earlier create
          // for the list itself never landed. Recreating is a safe no-op
          // if it already exists (the backend treats a repeat id as
          // success), so just retry once instead of dropping the item.
          try {
            await createListApi(selectedListId, selectedList.name);
            const { item, queued } = await createItemApi(selectedListId, { id, name, category, unit: fUnit, price: fPrice || null });
            if (!queued) reconcileOptimisticItem(selectedListId, id, item);
            continue;
          } catch (e2) {
            removeItemFromList(selectedListId, id);
            setNotice(`Couldn't add "${name}": ${e2?.message || "something went wrong"}`);
            continue;
          }
        }
        removeItemFromList(selectedListId, id);
        setNotice(`Couldn't add "${name}": ${e?.message || "something went wrong"}`);
      }
    }

    setFName("");
    setFPrice("");
    setCategoryTouched(false);
    if (errors.length) setItemNameError(`Added ${toAdd.length}, skipped ${errors.length}: ${summarizeItemErrors(errors)}`);
    bumpActivity(selectedListId);
  }

  function updateItem(id, patch) {
    if (!canWrite) { setNotice("You have view-only access to this list."); return; }
    if (patch.qty !== undefined) patch = { ...patch, qty: clampQty(patch.qty) };
    if (patch.price !== undefined) patch = { ...patch, price: clampPrice(patch.price) };
    if (patch.checked !== undefined || patch.skipped !== undefined) animateListChange();
    const listId = selectedListId;
    const previous = items.find((i) => i.id === id);
    patchItem(listId, id, patch);
    if (patch.checked !== undefined) bumpActivity(listId);
    // Optimistic: local state already updated above for a snappy UI; this
    // just persists it. Other members see it live via the socket once it
    // actually reaches the server. If offline, api.js queues this instead
    // of rejecting — nothing to undo. A real failure (not a connectivity
    // one) still undoes the local change so this device doesn't silently
    // drift from what's actually saved.
    updateItemApi(listId, id, patch).catch((e) => {
      if (previous) upsertItem(listId, previous);
      setNotice(`Change didn't save, so it's been undone: ${e?.message || "network error"}`);
    });
  }

  // optimistic delete with a 5s "Undo" window. For cloud lists the actual
  // server delete only fires once that window closes without an Undo —
  // that's the real point of no return, so it doubles as the sync trigger.
  function commitPendingDelete(pd) {
    clearTimeout(pd.timer);
    deleteItemApi(pd.listId, pd.item.id).catch((e) => {
      // A real (non-connectivity) failure — the item never actually left the
      // server, so don't let it silently vanish from just this device. An
      // offline delete queues instead of rejecting.
      upsertItem(pd.listId, pd.item);
      setNotice(`Delete didn't sync, so "${pd.item.name}" is back: ${e?.message || "network error"}`);
    });
  }
  function deleteItem(item) {
    if (!canWrite) { setNotice("You have view-only access to this list."); return; }
    // Deleting a second item inside the first one's undo window used to cancel
    // the first server delete outright (its timer was cleared and never
    // re-armed), so that item came back on the next sync. Commit it now.
    const previous = pendingDeleteRef.current;
    if (previous) commitPendingDelete(previous);
    animateListChange();
    const listId = selectedListId;
    removeItemFromList(listId, item.id);
    const entry = { item, listId, timer: null };
    entry.timer = setTimeout(() => {
      if (pendingDeleteRef.current === entry) pendingDeleteRef.current = null;
      setPendingDelete((cur) => (cur === entry ? null : cur));
      commitPendingDelete(entry);
    }, 5000);
    pendingDeleteRef.current = entry;
    setPendingDelete(entry);
  }
  function undoDelete() {
    const pd = pendingDeleteRef.current;
    if (!pd) return;
    clearTimeout(pd.timer);
    animateListChange();
    upsertItem(pd.listId, pd.item); // the list it was deleted from, even if you've switched lists since
    pendingDeleteRef.current = null;
    setPendingDelete(null);
  }


  function toggleCollapse(cat) { setCollapsed((p) => ({ ...p, [cat]: !p[cat] })); }


  async function exportPDF() {
    if (exportingPdf) return; // guard against double taps while one export is in flight
     if (pendingItems.length === 0 && boughtItems.length === 0) {
    setNotice("No items to export.");
    return;
  }
    setExportingPdf(true);
    try {
      await exportListPdf({
        listName: selectedList ? selectedList.name : "MindCart",
        profileName: profile.name || user?.name || "",
        pendingItems,
        boughtItems,
        pendingTotal,
        boughtTotal,
        currencySymbol: currency.symbol,
      });
    } catch (e) {
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

  // Price works like notes: keep the raw text the user is typing in local
  // state and only run it through clampPrice() on blur. Piping every
  // keystroke through updateItem -> clampPrice and back into a controlled
  // TextInput let the clamp "fight" the user's typing (snapping the value
  // back to a reformatted string on every character), which showed up as
  // the input flickering/jumping while editing a price.
  function priceValue(item) { return priceDrafts[item.id] !== undefined ? priceDrafts[item.id] : String(item.price ?? ""); }
  function commitPrice(item) {
    const draft = priceDrafts[item.id];
    setPriceDrafts((prev) => { const p = { ...prev }; delete p[item.id]; return p; });
    if (draft === undefined || draft === String(item.price ?? "")) return;
    updateItem(item.id, { price: draft });
  }

function startNewTrip() {
  if (!canWrite) { setNotice("You have view-only access to this list."); return; }
  const listId = selectedListId;
  const isCloudList = !!selectedList?.role;
  const resetItems = items.map((i) => ({ ...i, checked: false, skipped: false, note: "", qty: 0, price: "" }));
  setListItems(listId, () => arrayToItemMap(resetItems));
  setNoteDrafts({});
  setPriceDrafts({});
  setNotice(`Started a new trip for "${selectedList.name}".`);
  bumpActivity(listId);
  if (isCloudList) {
    // This previously only reset local state — on a shared list, every
    // other member (and this device, on its next refresh) would still see
    // the old checked/qty/price/note values, since the server was never
    // told anything changed.
    Promise.allSettled(
      resetItems.map((i) => updateItemApi(listId, i.id, { checked: false, skipped: false, note: "", qty: 0, price: "" }))
    ).then((results) => {
      if (results.some((r) => r.status === "rejected")) {
        setNotice(`"${selectedList.name}" reset locally, but some items didn't sync to the cloud.`);
      }
    });
  }
}
// Called from the button — only ever opens the confirmation popup when
// there's actually something to reset (button is disabled otherwise).
function requestNewTrip() {
  if (!tripDirty) return;
  setConfirmNewTripOpen(true);
}
// Called when the user taps "Yes" in the confirmation popup.
function confirmStartNewTrip() {
  setConfirmNewTripOpen(false);
  startNewTrip();
}

  function addCategory(name) {
    const trimmed = name.trim().slice(0, 30);
    if (!trimmed) return;
    setCategories((prev) => (prev.some((c) => c.toLowerCase() === trimmed.toLowerCase()) || prev.length >= 60 ? prev : [...prev, trimmed]));
  }

  // ---------- Master items: quick-add a common item straight into the current list ----------
  async function addMasterItem(mi) {
    if (!canWrite) { setNotice("You have view-only access to this list."); return; }
    const dup = items.some((i) => i.name.toLowerCase() === mi.name.toLowerCase());
    if (dup) { setNotice(`"${mi.name}" is already on this list.`); return; }
    animateListChange();
    const listId = selectedListId;
    const id = makeId("item");
    upsertItem(listId, {
      id, name: mi.name, category: mi.category, qty: 0, unit: mi.unit,
      price: "", checked: false, skipped: false, note: "", createdAt: Date.now(), pending: true,
    });
    try {
      const { item, queued } = await createItemApi(listId, { id, name: mi.name, category: mi.category, unit: mi.unit, price: null });
      if (!queued) reconcileOptimisticItem(listId, id, item);
    } catch (e) {
      if (e?.status === 404) {
        try {
          await createListApi(listId, selectedList.name);
          const { item, queued } = await createItemApi(listId, { id, name: mi.name, category: mi.category, unit: mi.unit, price: null });
          if (!queued) reconcileOptimisticItem(listId, id, item);
          setNotice(`Added "${mi.name}" to ${selectedList ? selectedList.name : "your list"}.`);
          return;
        } catch (e2) {
          removeItemFromList(listId, id);
          setNotice(`Couldn't add "${mi.name}": ${e2?.message || "something went wrong"}`);
          return;
        }
      }
      removeItemFromList(listId, id);
      setNotice(`Couldn't add "${mi.name}": ${e?.message || "something went wrong"}`);
      return;
    }
    setNotice(`Added "${mi.name}" to ${selectedList ? selectedList.name : "your list"}.`);
    bumpActivity(listId);
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
    const subject = encodeURIComponent("MindCart feedback");
    Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${subject}`).catch(() =>
      setNotice("Couldn't open your mail app.")
    );
  }

  const filteredCurrencies = CURRENCIES.filter((c) => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return true;
    return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <View style={{ flex: 1, backgroundColor: t.bg }}>
    <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} backgroundColor={t.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {/* ===== Header ===== */}
        <View style={s.headerRow}>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 30, height: 30, borderRadius: RADIUS.sm, backgroundColor: t.accentSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <Image source={require("./src/assets/icon.png")} style={{ width: 22, height: 22 }} />
              </View>
              <Text style={s.brand}>MindCart</Text>
            </View>
            <TouchableOpacity onPress={() => setListsModalOpen(true)} style={s.listSwitcher}>
            <ListChecks size={12} color={t.accent} />
            <Text style={s.listSwitcherText}>
              {selectedList ? selectedList.name : "Select list"}
              {selectedList && !!selectedList.role && (cloudMembersByList[selectedList.id]?.length || 0) > 1 ? " · Shared" : ""}
            </Text>
            <ChevronDown size={12} color={t.accent} />
          </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {!!user && (
              <TouchableOpacity onPress={openNotifications} style={s.iconBtn} accessibilityLabel="Notifications">
                {badgeCount > 0 ? <BellRing size={17} color={t.accent} /> : <Bell size={17} color={t.text} />}
                {badgeCount > 0 && (
                  <View style={s.bellBadge}>
                    <Text style={s.bellBadgeText}>{badgeCount > 9 ? "9+" : badgeCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={exportPDF} style={s.iconBtn} disabled={exportingPdf}>
              {exportingPdf ? (
                <ActivityIndicator size="small" color={t.text} />
              ) : (
                <Share2 size={16} color={t.text} />
              )}
            </TouchableOpacity>
            {/* <TouchableOpacity onPress={() => setHeaderMenuOpen(true)} style={s.iconBtn}>
              <Menu size={16} color={t.text} />
            </TouchableOpacity> */}
          </View>
        </View>

        {pendingDelete ? (
          <View style={s.undoRow}>
            <Text style={{ color: t.text, fontSize: 12.5 }}>Deleted "{pendingDelete.item.name}"</Text>
            <TouchableOpacity onPress={undoDelete}>
              <Text style={{ color: t.accent, fontWeight: "700", fontSize: 12.5 }}>Undo</Text>
            </TouchableOpacity>
          </View>
        ) : null}

          {showSearch && (
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
          )}

        {/* ===== Pinned header (does NOT scroll): summary + All/Pending/Bought ===== */}
        {tab === "home" && (
          <View style={{ paddingHorizontal: 16 }}>
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

                <TouchableOpacity
                  onPress={requestNewTrip}
                  disabled={!tripDirty}
                  style={[s.newTripBtn, !tripDirty && { borderColor: t.border, opacity: 0.5 }]}
                >
                  <RotateCcw size={13} color={tripDirty ? t.accent : t.muted} />
                  <Text style={{ color: tripDirty ? t.accent : t.muted, fontWeight: "600", fontSize: 12.5 }}>Start new trip</Text>
                </TouchableOpacity>
              </View>
            <View style={s.stickyFilterWrap}>
              <View style={s.segmentWrap}>
                {[
                  { id: "all", label: `All (${items.length})` },
                  { id: "pending", label: `Pending (${pendingItems.length})` },
                  { id: "bought", label: `Bought (${boughtItems.length})` },
                ].map((seg) => (
                  <TouchableOpacity
                    key={seg.id}
                    onPress={() => { animateListChange(); setHomeFilter(seg.id); }}
                    style={[s.segmentBtn, homeFilter === seg.id && s.segmentBtnActive]}
                  >
                    <Text style={[s.segmentText, homeFilter === seg.id && s.segmentTextActive]}>{seg.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ===== Pinned "Add item" card (does NOT scroll) ===== */}
        {tab === "add" && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8, zIndex: 10 }}>
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
                {itemNameError ? (
                  <View style={s.inlineError} accessibilityLiveRegion="polite">
                    <AlertCircle size={14} color={t.danger} style={{ marginTop: 1 }} />
                    <Text style={s.inlineErrorText}>{itemNameError}</Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" }}>
                  <SimpleSelect value={fUnit} options={UNITS} onChange={setFUnit} title="Unit" t={t} />
                  <TouchableOpacity onPress={addItem} style={s.addItemBtn}>
                    <Plus size={15} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
          </View>
        )}

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {tab === "home" && (
            <>
              {items.length === 0 && (
                <View style={s.emptyStateWrap}>
                  <View style={s.emptyStateIconWrap}>
                    <ShoppingBag size={28} color={t.accent} />
                  </View>
                  <Text style={s.emptyStateTitle}>"{selectedList ? selectedList.name : "This list"}" is empty</Text>
                  <Text style={s.emptyStateSub}>Nothing here yet — add your first item and MindCart will remember it for next time.</Text>
                  <TouchableOpacity onPress={() => setTab("add")} style={s.emptyStateBtn}>
                    <Plus size={16} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13.5 }}>Add your first item</Text>
                  </TouchableOpacity>
                </View>
              )}
              {items.length > 0 && noSearchResults && (
                <View style={s.emptyStateWrap}>
                  <View style={s.emptyStateIconWrap}><Search size={26} color={t.accent} /></View>
                  <Text style={s.emptyStateTitle}>No matches for "{debouncedSearch}"</Text>
                  <Text style={s.emptyStateSub}>Try a different search, or clear it to see everything on this list.</Text>
                </View>
              )}

              {itemCategories.map((cat) => {
                const catItems = filtered.filter((i) => {
                  if (i.category !== cat || i.skipped) return false;
                  if (homeFilter === "pending") return !i.checked;
                  if (homeFilter === "bought") return i.checked;
                  return true;
                });
                if (catItems.length === 0) return null;
                const isCollapsed = collapsed[cat];
                return (
                  <View key={cat} style={{ marginTop: 14 }}>
                    <TouchableOpacity onPress={() => { animateListChange(); toggleCollapse(cat); }} style={s.catHeader}>
                      <Text style={s.catHeaderText}>{cat}</Text>
                      <ChevronDown size={15} color={t.muted} style={{ transform: [{ rotate: isCollapsed ? "-90deg" : "0deg" }] }} />
                    </TouchableOpacity>
                    {!isCollapsed && (
                      <View style={{ gap: 8, marginTop: 6 }}>
                        {catItems.map((item) => (
                          <Swipeable
                            key={item.id}
                            overshootRight={false}
                            renderRightActions={() => <SwipeDeleteAction t={t} onDelete={() => deleteItem(item)} />}
                          >
                          <View style={[s.itemCard, { opacity: item.checked ? 0.55 : 1 }]}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                              <AnimatedCheckbox
                                checked={item.checked}
                                onPress={() => updateItem(item.id, { checked: !item.checked })}
                                style={[s.checkbox, { borderColor: item.checked ? t.accent : t.border, backgroundColor: item.checked ? t.accent : "transparent" }]}
                              />
                              <Text style={{ fontSize: 17 }}>{getIcon(item.name)}</Text>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={[s.itemName, item.checked && { textDecorationLine: "line-through" }]}>{item.name}</Text>
                                <Text style={s.itemUnit}>{item.unit}</Text>
                              </View>
                             <TouchableOpacity
                              onPress={() => {
                                    tapHaptic(Haptics.ImpactFeedbackStyle.Light);
                                    updateItem(item.id, { qty: Math.max(0, Number(item.qty) - 1) });
                                   }}
                                  disabled={Number(item.qty) <= 0}
                                  style={[
                                    s.qtyBtn,
                                    Number(item.qty) <= 0 && { opacity: 0.5 }
                                  ]}
                                >
                                <Text style={s.qtyBtnText}>−</Text>
                              </TouchableOpacity>
                              <Text style={s.qtyValue}>{item.qty}</Text>
                              <TouchableOpacity
                                onPress={() => {
                                  tapHaptic(Haptics.ImpactFeedbackStyle.Light);
                                  updateItem(item.id, { qty: Math.min(999, Number(item.qty) + 1) });
                                }}
                                disabled={Number(item.qty) >= 999}
                                style={[s.qtyBtn, Number(item.qty) >= 999 && { opacity: 0.5 }]}
                              >
                                <Text style={s.qtyBtnText}>+</Text>
                              </TouchableOpacity>
                           <TextInput
                            keyboardType="decimal-pad"
                            placeholder={currency.symbol}
                            placeholderTextColor={t.muted}
                            value={priceValue(item)}
                            editable={Number(item.qty) > 0}
                            onChangeText={(v) => {
                              const numericValue = v.replace(/[^0-9.]/g, "");

                              // Allow only one decimal point
                              const parts = numericValue.split(".");
                              const cleanedValue =
                                parts.length > 2
                                  ? parts[0] + "." + parts.slice(1).join("")
                                  : numericValue;

                              setPriceDrafts((prev) => ({
                                ...prev,
                                [item.id]: cleanedValue,
                              }));
                            }}
                            onBlur={() => commitPrice(item)}
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
                          </Swipeable>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}

              {skippedItems.length > 0 && homeFilter !== "bought" && (
                <View style={{ marginTop: 10 }}>
                  <TouchableOpacity onPress={() => toggleCollapse("__skipped__")} style={s.catHeader}>
                    <Text style={[s.catHeaderText, { color: t.muted }]}>Not buying this time ({skippedItems.length})</Text>
                    <ChevronDown size={15} color={t.muted} style={{ transform: [{ rotate: collapsed["__skipped__"] ? "-90deg" : "0deg" }] }} />
                  </TouchableOpacity>
                  {!collapsed["__skipped__"] && (
                    <View style={{ gap: 8, marginTop: 6 }}>
                      {skippedItems.map((item) => (
                        <Swipeable
                          key={item.id}
                          overshootRight={false}
                          renderRightActions={() => <SwipeDeleteAction t={t} onDelete={() => deleteItem(item)} />}
                        >
                        <View style={[s.itemCard, { flexDirection: "row", alignItems: "center", gap: 10, opacity: 0.6 }]}>
                          <Text style={{ fontSize: 17 }}>{getIcon(item.name)}</Text>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={s.itemName}>{item.name}</Text>
                            <Text style={s.itemUnit}>{item.qty} {item.unit}</Text>
                          </View>
                          <TouchableOpacity onPress={() => updateItem(item.id, { skipped: false })} style={s.addBackBtn}>
                            <Text style={{ color: t.accent, fontWeight: "600", fontSize: 11.5 }}>Add back</Text>
                          </TouchableOpacity>
                        </View>
                        </Swipeable>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          {tab === "add" && (
            <>
              <View style={{ marginTop: 4, gap: 8 }}>
                {filtered.length === 0 && (
                  <View style={s.emptyStateWrap}>
                    <View style={s.emptyStateIconWrap}>
                      {items.length === 0 ? <ListPlus size={26} color={t.accent} /> : <Search size={26} color={t.accent} />}
                    </View>
                    <Text style={s.emptyStateTitle}>{items.length === 0 ? "No items yet" : `No items match "${debouncedSearch}"`}</Text>
                    <Text style={s.emptyStateSub}>
                      {items.length === 0
                        ? "Type a name above and tap Add to build out this list."
                        : "Try a different search or add it as a brand-new item."}
                    </Text>
                  </View>
                )}
                {filtered.map((item) => (
                  <Swipeable
                    key={item.id}
                    overshootRight={false}
                    renderRightActions={() => <SwipeDeleteAction t={t} onDelete={() => deleteItem(item)} />}
                  >
                  <View style={s.itemCard}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Text style={{ fontSize: 17 }}>{getIcon(item.name)}</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.itemName}>{item.name}</Text>
                        <Text style={s.itemUnit}>
                          {item.category} · {item.unit}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => startEditItem(item)} style={{ padding: 4 }}><Pencil size={15} color={t.muted} /></TouchableOpacity>
                    </View>
                  </View>
                  </Swipeable>
                ))}
              </View>
            </>
          )}

          {tab === "master" && (
            <View style={{ gap: 10 }}>
              <View style={[s.summaryCard, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
                <View style={[s.tabIconWrap, s.tabIconWrapActive, { width: 44, height: 44 }]}>
                  <Layers size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "800", fontSize: 15 }}>Master Items</Text>
                  <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>Your household's frequently bought items — tap + to drop one into "{selectedList ? selectedList.name : "this list"}".</Text>
                </View>
              </View>

              {MASTER_ITEMS.map((mi) => {
                const already = items.some((i) => i.name.toLowerCase() === mi.name.toLowerCase());
                return (
                  <View key={mi.name} style={[s.itemCard, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
                    <Text style={{ fontSize: 18 }}>{getIcon(mi.name)}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.itemName}>{mi.name}</Text>
                      <Text style={s.itemUnit}>{mi.category} · {mi.unit} · Master Item</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => addMasterItem(mi)}
                      disabled={already}
                      style={[s.masterAddBtn, already && { opacity: 0.4 }]}
                    >
                      {already ? <Check size={16} color={t.accent2} /> : <Plus size={16} color="#fff" />}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {tab === "family" && (
            <>
            {receivedInvites.length > 0 && (
              <TouchableOpacity onPress={openInvites} activeOpacity={0.85} style={[s.inviteEntry, { marginBottom: 14 }]}>
                <View style={s.inviteEntryIcon}>
                  <Mail size={18} color="#fff" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.itemName}>Pending invitations</Text>
                  <Text style={s.itemUnit}>
                    {receivedInvites.length === 1
                      ? `${receivedInvites[0].sender?.name || receivedInvites[0].sender?.email || "Someone"} is waiting for your reply`
                      : `${receivedInvites.length} people are waiting for your reply`}
                  </Text>
                </View>
                <View style={s.countPill}><Text style={s.countPillText}>{receivedInvites.length}</Text></View>
                <ChevronRight size={18} color={t.muted} />
              </TouchableOpacity>
            )}
            <FamilySyncScreen
              t={t} s={s}
              selectedList={selectedList}
              items={items}
              isSignedIn={!!user}
              signingIn={signingIn}
              isCloudList={!!selectedList?.role}
              isOwner={selectedList?.role === "OWNER"}
              members={cloudMembersByList[selectedList?.id] || []}
              pendingInvites={pendingInvitesByList[selectedList?.id] || []}
              makingShareable={makingShareable}
              revokingInviteId={revokingInviteId}
              busyMemberId={busyMemberId}
              onSignIn={signIn}
              onMakeShareable={() => makeListShareable(selectedList)}
              onInvite={(payload) => inviteFamilyMember(selectedList, payload)}
              onRevokeInvite={(inviteId) => revokeFamilyInvite(inviteId, selectedList.id)}
              onChangeRole={(userId, role) => changeFamilyMemberRole(selectedList.id, userId, role)}
              onRemoveMember={(userId) => removeFamilyMember(selectedList.id, userId)}
            />
            </>
          )}

          {tab === "profile" && (
            <View style={{ gap: 14 }}>
              <View style={[s.summaryCard, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
                <View style={s.avatarCircleLg}>
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 20 }}>{(profile.name || user.name || "U").slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: t.text, fontWeight: "800", fontSize: 16 }}>
                  {user?.name || "Enter your name"}
                </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                    <Crown size={12} color={t.accent2} />
                    <Text style={{ color: t.accent2, fontSize: 11.5, fontWeight: "700" }}>Family Plan Manager</Text>
                  </View>
                </View>
              </View>

              <Text style={s.sectionLabel}>Preferences</Text>
              <View style={{ gap: 8 }}>
                <View style={s.settingsRow}>
                  <View style={[s.settingsIconWrap, { backgroundColor: t.accentSoft }]}><Palette size={16} color={t.accent} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName}>Dark Mode</Text>
                    <Text style={s.itemUnit}>Switch light and dark theme</Text>
                  </View>
                  <TouchableOpacity onPress={() => setDark((d) => !d)} style={[s.toggleTrack, dark && s.toggleTrackOn]}>
                    <View style={[s.toggleThumb, dark && s.toggleThumbOn]} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={s.settingsRow} onPress={() => setCurrencyModalOpen(true)}>
                  <View style={[s.settingsIconWrap, { backgroundColor: t.accent2Soft }]}><Wallet size={16} color={t.accent2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName}>Currency</Text>
                    <Text style={s.itemUnit}>List total calculations</Text>
                  </View>
                  <Text style={{ color: t.muted, fontSize: 12.5, fontWeight: "700", marginRight: 4 }}>{currency.code}</Text>
                  <ChevronRight size={16} color={t.muted} />
                </TouchableOpacity>

                <View style={s.settingsRow}>
                  <View style={[s.settingsIconWrap, { backgroundColor: t.accentSoft }]}><BellDot size={16} color={t.accent} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName}>Store Reminders</Text>
                    <Text style={s.itemUnit}>Nudge me if a list goes quiet</Text>
                  </View>
                  {/* <TouchableOpacity onPress={() => toggleReminders(!reminderSettings.enabled)} style={[s.toggleTrack, reminderSettings.enabled && s.toggleTrackOn]}>
                    <View style={[s.toggleThumb, reminderSettings.enabled && s.toggleThumbOn]} />
                  </TouchableOpacity> */}
                  <Text style={{ color: user ? t.danger : t.accent2, fontSize: 11.5, fontWeight: "700" }}>
                     Coming Soon
                    </Text>
                </View>

                {/* <View style={s.settingsRow}>
                  <View style={[s.settingsIconWrap, { backgroundColor: t.accent2Soft }]}><Layers size={16} color={t.accent2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName}>Master Tab</Text>
                    <Text style={s.itemUnit}>Show the Master Items shelf in the bottom nav</Text>
                  </View>
                  <TouchableOpacity onPress={() => toggleMasterTab(!showMasterTab)} style={[s.toggleTrack, showMasterTab && s.toggleTrackOn]}>
                    <View style={[s.toggleThumb, showMasterTab && s.toggleThumbOn]} />
                  </TouchableOpacity>
                </View> */}
              </View>

              <Text style={s.sectionLabel}>Data & Cloud</Text>
              <View style={{ gap: 8 }}>
                {/* <TouchableOpacity style={s.settingsRow} onPress={exportPDF} disabled={exportingPdf}>
                  <View style={[s.settingsIconWrap, { backgroundColor: t.accentSoft }]}><FileDown size={16} color={t.accent} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName}>Export Shopping Data</Text>
                    <Text style={s.itemUnit}>Download this list as a PDF</Text>
                  </View>
                  {exportingPdf ? <ActivityIndicator size="small" color={t.accent} /> : <ChevronRight size={16} color={t.muted} />}
                </TouchableOpacity> */}
                <TouchableOpacity
                  style={s.settingsRow}
                  disabled={authLoading || signingIn}
                  onPress={() => (user ? signOut() : signIn())}
                >
                  <View style={[s.settingsIconWrap, { backgroundColor: t.accent2Soft }]}><Cloud size={16} color={t.accent2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName}>Cloud Sync & Sharing</Text>
                    <Text style={s.itemUnit}>
                      {user ? `Signed in as ${user.name}` : "Sign in with Google to sync & share lists"}
                    </Text>
                  </View>
                  {authLoading || signingIn ? (
                    <ActivityIndicator size="small" color={t.accent2} />
                  ) : (
                    <Text style={{ color: user ? t.danger : t.accent2, fontSize: 11.5, fontWeight: "700" }}>
                      {user ? "Sign out" : "Sign in"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={s.sectionLabel}>Support & Legal</Text>
              <View style={{ gap: 8 }}>
                <TouchableOpacity style={s.settingsRow} onPress={() => setPrivacyModalOpen(true)}>
                  <View style={[s.settingsIconWrap, { backgroundColor: t.surface2 }]}><ShieldCheck size={16} color={t.text} /></View>
                  <Text style={[s.itemName, { flex: 1 }]}>Privacy Policy</Text>
                  <ChevronRight size={16} color={t.muted} />
                </TouchableOpacity>
                <TouchableOpacity style={s.settingsRow} onPress={() => setTermsModalOpen(true)}>
                  <View style={[s.settingsIconWrap, { backgroundColor: t.surface2 }]}><FileText size={16} color={t.text} /></View>
                  <Text style={[s.itemName, { flex: 1 }]}>Terms of Use</Text>
                  <ChevronRight size={16} color={t.muted} />
                </TouchableOpacity>
                <TouchableOpacity style={s.settingsRow} onPress={() => setAboutModalOpen(true)}>
                  <View style={[s.settingsIconWrap, { backgroundColor: t.surface2 }]}><Info size={16} color={t.text} /></View>
                  <Text style={[s.itemName, { flex: 1 }]}>About MindCart</Text>
                  <ChevronRight size={16} color={t.muted} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>

        {/* ===== Floating toast (overlays, never pushes content) ===== */}
        {toast ? (() => {
          const tone = toast.kind === "error" ? t.danger : toast.kind === "success" ? t.accent : t.accent2;
          const Icon = toast.kind === "error" ? AlertCircle : toast.kind === "success" ? Check : Info;
          return (
            <Animated.View
              pointerEvents="box-none"
              style={[s.toastWrap, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }]}
            >
              <Pressable
                onPress={() => setNotice("")}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[s.toast, { borderColor: `${tone}66` }]}
              >
                <View style={[s.toastIcon, { backgroundColor: `${tone}22` }]}>
                  <Icon size={15} color={tone} />
                </View>
                <Text style={s.toastText}>{toast.msg}</Text>
                <X size={14} color={t.muted} />
              </Pressable>
            </Animated.View>
          );
        })() : null}
      </KeyboardAvoidingView>

      {/* ===== Bottom tab bar (outside KeyboardAvoidingView so it stays
          pinned to the bottom of the screen, not the top of the keyboard) ===== */}
      <View style={s.tabBar}>
        {[
          { id: "home", label: "Home", icon: Home },
          { id: "add", label: "Add", icon: ListPlus },
          // showMasterTab && { id: "master", label: "Master", icon: Layers },
          { id: "family", label: "Family", icon: Users },
          { id: "profile", label: "Profile", icon: UserCircle2 },
        ].filter(Boolean).map(({ id, label, icon: Icon }) => (
          <TouchableOpacity key={id} onPress={() => setTab(id)} style={s.tabBtn}>
            <View style={[s.tabIconWrap, tab === id && s.tabIconWrapActive]}>
              <Icon size={18} color={tab === id ? "#fff" : t.muted} />
              {id === "family" && receivedInvites.length > 0 && tab !== "family" && <View style={s.tabDot} />}
            </View>
            <Text style={{ fontSize: 10.5, fontWeight: "700", color: tab === id ? t.accent : t.muted, marginTop: 2 }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ===== Lists modal (create / rename / delete / switch) =====
          In-tree overlay instead of RN's <Modal> — see the header-menu
          comment below for why: native <Modal> creates a separate Android
          window on open/close, and that window transition is what was
          showing up as a flash/flicker every time a popup opened. */}
      {listsModalOpen && (
        <KeyboardAvoidingView style={[s.overlayFill, { zIndex: 40, elevation: 20 }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      {/* <TouchableOpacity onPress={() => { setSelectedListId(list.id); setListsModalOpen(false); }} style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "700", fontSize: 14.5, color: t.text }}>{list.name}{list.id === selectedListId ? " · current" : ""}</Text>
                        <Text style={{ fontSize: 11.5, color: t.muted }}>{Object.keys(itemsByList[list.id] || {}).length} items</Text>
                      </TouchableOpacity> */}
                      <TouchableOpacity onPress={() => { setSelectedListId(list.id); setListsModalOpen(false); }} style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "700", fontSize: 14.5, color: t.text }}>
                          {list.name}
                          {list.id === selectedListId ? "" : ""}
                          {!!list.role && (cloudMembersByList[list.id]?.length || 0) > 1 ? "(Shared)" : ""}
                        </Text>
                        <Text style={{ fontSize: 11.5, color: t.muted }}>{Object.keys(itemsByList[list.id] || {}).length} items</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => startRenameList(list)} style={{ padding: 4 }}><Pencil size={15} color={t.muted} /></TouchableOpacity>
                      <TouchableOpacity onPress={() => setConfirmDeleteListId(list.id)} style={{ padding: 4 }}><Trash2 size={15} color={t.danger} /></TouchableOpacity>
                    </View>
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
        </KeyboardAvoidingView>
      )}

      {/* ===== Rename list popup — its own screen instead of an inline row,
          so it never overlaps with other list rows in the sheet above. ===== */}
      {renamingListId !== null && (
        <KeyboardAvoidingView
          style={[s.overlayFill, { zIndex: 41, elevation: 21 }]}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={s.modalBackdropCenter} onPress={() => { setRenamingListId(null); setListNameError(""); }}>
            <Pressable style={s.popupCard} onPress={() => {}}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={s.sheetTitle}>Rename list</Text>
                <TouchableOpacity onPress={() => { setRenamingListId(null); setListNameError(""); }}><X size={18} color={t.muted} /></TouchableOpacity>
              </View>
              <TextInput
                ref={renameInputRef}
                autoFocus
                value={renameDraft}
                maxLength={40}
                placeholder="List name"
                placeholderTextColor={t.muted}
                onChangeText={(v) => { setRenameDraft(v); if (listNameError) setListNameError(""); }}
                onSubmitEditing={commitRenameList}
                style={[s.input, { borderColor: listNameError ? t.danger : t.border }]}
              />
              {listNameError ? <Text style={s.errorText}>{listNameError}</Text> : null}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                <TouchableOpacity onPress={() => { setRenamingListId(null); setListNameError(""); }} style={[s.smallBtn, { flex: 1, alignItems: "center", paddingVertical: 10 }]}>
                  <Text style={s.smallBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={commitRenameList} style={[s.addItemBtn, { flex: 1, justifyContent: "center", marginLeft: 0 }]}>
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Save</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      )}

      {/* ===== New list popup ===== */}
      {newListModalOpen && (
        <KeyboardAvoidingView
          style={[s.overlayFill, { zIndex: 42, elevation: 22 }]}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={s.modalBackdropCenter} onPress={() => setNewListModalOpen(false)}>
            <Pressable style={s.popupCard} onPress={() => {}}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={s.sheetTitle}>New list</Text>
                <TouchableOpacity onPress={() => setNewListModalOpen(false)}><X size={18} color={t.muted} /></TouchableOpacity>
              </View>
              <TextInput
                ref={newListInputRef}
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
      )}

      {/* ===== Edit item popup — a plain in-tree overlay (like "New list")
          instead of a real Modal, wrapped in KeyboardAvoidingView so the
          keyboard never covers the input. ===== */}
      {editingItemId !== null && (
        <KeyboardAvoidingView
          style={[s.overlayFill, { zIndex: 43, elevation: 23 }]}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={s.modalBackdropCenter} onPress={cancelEditItem}>
            <Pressable style={s.popupCard} onPress={() => {}}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={s.sheetTitle}>Edit item</Text>
                <TouchableOpacity onPress={cancelEditItem}><X size={18} color={t.muted} /></TouchableOpacity>
              </View>
              <TextInput
                ref={editItemInputRef}
                autoFocus
                value={eName}
                maxLength={40}
                onChangeText={(v) => { setEName(v); if (editNameError) setEditNameError(""); }}
                placeholder="Item name"
                placeholderTextColor={t.muted}
                style={[s.input, { borderColor: editNameError ? t.danger : t.border }]}
              />
              {editNameError ? <Text style={s.errorText}>{editNameError}</Text> : null}
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <CategorySelect value={eCategory} categories={categories} onChange={setECategory} onAddCategory={addCategory} t={t} style={{ flex: 1, minWidth: 100 }} />
                <SimpleSelect value={eUnit} options={UNITS} onChange={setEUnit} title="Unit" t={t} style={{ flex: 1, minWidth: 90 }} />
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                <TouchableOpacity onPress={cancelEditItem} style={[s.smallBtn, { flex: 1, alignItems: "center", paddingVertical: 10 }]}>
                  <Text style={s.smallBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveEditItem} style={[s.addItemBtn, { flex: 1, justifyContent: "center", marginLeft: 0 }]}>
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Save</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      )}

      {/* ===== Confirm "Start new trip" popup ===== */}
      {/* ===== Pending invitations popup — centred dialog opened from the Family tab row.
          Invites only (the header bell opens the full Notifications panel instead). ===== */}
      {invitesOpen && (
        <View style={[s.overlayFill, { zIndex: 46, elevation: 26 }]}>
          <Pressable style={s.modalBackdropCenter} onPress={closeInvites}>
            <Animated.View style={{ width: "100%", alignItems: "center", opacity: invitesAnim, transform: [{ scale: invitesAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }}>
              <Pressable style={s.popupCard} onPress={() => {}}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <View style={s.inviteEntryIcon}><Mail size={18} color="#fff" /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.sheetTitle}>Pending invitations</Text>
                    <Text style={{ color: t.muted, fontSize: 12.5, marginTop: 1 }}>
                      {receivedInvites.length === 1 ? "1 person is waiting for your reply" : `${receivedInvites.length} people are waiting for your reply`}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={closeInvites} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <X size={18} color={t.muted} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {receivedInvites.map(renderInviteCard)}
                </ScrollView>
                <TouchableOpacity onPress={closeInvites} style={{ alignSelf: "center", marginTop: 14, paddingVertical: 4, paddingHorizontal: 10 }}>
                  <Text style={{ color: t.muted, fontSize: 12.5, fontWeight: "700" }}>Decide later</Text>
                </TouchableOpacity>
              </Pressable>
            </Animated.View>
          </Pressable>
        </View>
      )}

      {/* ===== Notifications panel — drops down from the top, right under the header bell.
          Opened by the bell and by the Family tab's "Pending invitations" row.
          In-tree overlay (not <Modal>) like the other popups, to avoid the Android flicker. ===== */}
      {notifOpen && (
        <View style={[s.overlayFill, { zIndex: 45, elevation: 25 }]}>
          <Pressable style={s.notifBackdrop} onPress={closeNotifications}>
            <Animated.View style={{ opacity: notifAnim, transform: [{ translateY: notifAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }}>
              <Pressable style={s.notifPanel} onPress={() => {}}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Text style={s.sheetTitle}>Notifications</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                    {activity.length > 0 && (
                      <TouchableOpacity onPress={() => setActivity([])} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Text style={{ color: t.accent, fontSize: 12.5, fontWeight: "700" }}>Clear</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={closeNotifications} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <X size={18} color={t.muted} />
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {receivedInvites.length === 0 && activity.length === 0 && (
                    <View style={s.emptyStateWrap}>
                      <View style={s.emptyStateIconWrap}><Bell size={26} color={t.accent} /></View>
                      <Text style={s.emptyStateTitle}>You're all caught up</Text>
                      <Text style={s.emptyStateSub}>Invitations and updates from your family lists will show up here.</Text>
                    </View>
                  )}

                  {receivedInvites.length > 0 && (
                    <Text style={s.sectionLabel}>Invitations · {receivedInvites.length}</Text>
                  )}
                  {receivedInvites.map(renderInviteCard)}

                  {activity.length > 0 && (
                    <Text style={[s.sectionLabel, receivedInvites.length > 0 && { marginTop: 10 }]}>Recent activity</Text>
                  )}
                  {activity.map((a) => {
                    const good = a.kind === "accepted";
                    const bad = a.kind === "declined" || a.kind === "revoked";
                    const Icon = good ? Check : bad ? X : Bell;
                    const tint = good ? t.accent2 : bad ? t.danger : t.accent;
                    const tintBg = good ? t.accent2Soft : bad ? t.dangerSoft : t.accentSoft;
                    return (
                      <View key={a.id} style={s.activityRow}>
                        <View style={[s.activityIcon, { backgroundColor: tintBg }]}><Icon size={15} color={tint} /></View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: t.text, fontSize: 13, fontWeight: a.read ? "500" : "700", lineHeight: 18 }}>{a.text}</Text>
                          <Text style={s.itemUnit}>{timeAgo(a.at)}</Text>
                        </View>
                        {!a.read && <View style={s.unreadDot} />}
                        <TouchableOpacity onPress={() => setActivity((prev) => prev.filter((x) => x.id !== a.id))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                          <X size={14} color={t.muted} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              </Pressable>
            </Animated.View>
          </Pressable>
        </View>
      )}

      {confirmNewTripOpen && (
        <View style={[s.overlayFill, { zIndex: 44, elevation: 24 }]}>
        <Pressable style={s.modalBackdropCenter} onPress={() => setConfirmNewTripOpen(false)}>
          <Pressable style={s.popupCard} onPress={() => {}}>
            <Text style={s.sheetTitle}>Start a new trip?</Text>
            <Text style={{ color: t.muted, fontSize: 13, marginTop: 8, lineHeight: 19 }}>
              This clears checked items, notes, prices and quantities for "{selectedList ? selectedList.name : ""}". This can't be undone.
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setConfirmNewTripOpen(false)} style={[s.smallBtn, { flex: 1, alignItems: "center", paddingVertical: 10 }]}>
                <Text style={s.smallBtnText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmStartNewTrip} style={[s.addItemBtn, { flex: 1, justifyContent: "center", marginLeft: 0 }]}>
                <RotateCcw size={14} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Yes, reset</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
        </View>
      )}

      <Modal
        visible={currencyModalOpen || needsCurrencySetup}
        animationType="slide"
        statusBarTranslucent
        onShow={() => { if (!needsCurrencySetup) setTimeout(() => currencySearchInputRef.current?.focus(), 60); }}
        onRequestClose={() => { if (!needsCurrencySetup) setCurrencyModalOpen(false); }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
          <StatusBar barStyle={dark ? "light-content" : "dark-content"} backgroundColor={t.bg} />
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <View style={{ paddingHorizontal: 18, paddingTop: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Text style={s.sheetTitle}>{needsCurrencySetup ? "Pick your currency" : "Currency"}</Text>
                {!needsCurrencySetup && (
                  <TouchableOpacity onPress={() => setCurrencyModalOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X size={20} color={t.muted} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={{ fontSize: 12.5, color: t.muted, marginBottom: 12 }}>
                {needsCurrencySetup
                  ? "This just sets which symbol shows next to prices — you can change it anytime from Profile → Currency."
                  : "Changing this only updates the symbol shown next to prices; existing amounts stay the same."}
              </Text>

              <TextInput
                ref={currencySearchInputRef}
                value={currencySearch}
                onChangeText={setCurrencySearch}
                placeholder="Search currency (e.g. USD, Euro)"
                placeholderTextColor={t.muted}
                style={[s.input, { marginBottom: 10 }]}
              />
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24, gap: 6 }}
              keyboardShouldPersistTaps="handled"
            >
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
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ===== About modal: opened from the hamburger menu, same style as the settings/currency sheet ===== */}
      <Modal
        visible={aboutModalOpen}
        transparent
        statusBarTranslucent
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
                <Text style={{ fontSize: 18, fontWeight: "800", color: t.text }}>MindCart</Text>
                <Text style={{ fontSize: 12.5, color: t.accent, fontWeight: "600", marginTop: 2 }}>
                  Never forget to buy
                </Text>
              </View>

              {/* Short description */}
              <Text style={{ fontSize: 13, color: t.muted, textAlign: "center", lineHeight: 19, marginBottom: 18 }}>
                MindCart helps you plan your shopping trips with categorized items, quantities, prices, and reminders — 
                saved on your device and synced to your account, so your lists are always ready when you need them.
              </Text>

              {/* Version & developer */}
              <View style={{ gap: 6, marginBottom: 16 }}>
                <View style={[s.listRow, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
                  <Text style={{ color: t.text, fontSize: 13.5, fontWeight: "600" }}>App version</Text>
                  <Text style={{ color: t.muted, fontSize: 13 }}>{APP_VERSION}</Text>
                </View>
              </View>

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
      <Modal visible={reminderModalOpen} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setReminderModalOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setReminderModalOpen(false)}>
          <Pressable style={s.listsSheet} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Text style={s.sheetTitle}>Shopping reminders</Text>
              {/* <TouchableOpacity onPress={() => setReminderModalOpen(false)}><X size={18} color={t.muted} /></TouchableOpacity> */}
            </View>
            <Text style={{ fontSize: 12.5, color: t.muted, marginBottom: 14 }}>
              Get notified if a list has gone quiet for a while. Any activity on a list (adding, checking off, or starting a new trip) resets its countdown.
            </Text>

            {/* <TouchableOpacity
              onPress={() => toggleReminders(!reminderSettings.enabled)}
              style={[s.listRow, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
            > 
              <Text style={{ color: t.text, fontWeight: "600", fontSize: 14 }}>Enable reminders</Text>
              <View style={{ width: 40, height: 22, borderRadius: 11, backgroundColor: reminderSettings.enabled ? t.accent : t.border, padding: 2, justifyContent: "center" }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff", marginLeft: reminderSettings.enabled ? 18 : 0 }} />
              </View>
            </TouchableOpacity>*/}

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

            {/* <View style={{ marginTop: 22, paddingTop: 16, borderTopWidth: 1, borderColor: t.border }}>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 14, marginBottom: 4 }}>Daily testing reminder</Text>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ color: t.text, fontSize: 14 }}>Send at</Text>
                <TouchableOpacity
                  onPress={() => setDailyTestPickerOpen(true)}
                  style={[s.smallBtn, { paddingHorizontal: 14, paddingVertical: 8 }]}
                >
                  <Text style={{ color: t.text, fontWeight: "700", fontSize: 14 }}>
                    {formatTime12h(dailyTestSettings.hour ?? DAILY_TEST_DEFAULT_HOUR, dailyTestSettings.minute ?? DAILY_TEST_DEFAULT_MINUTE)}
                  </Text>
                </TouchableOpacity>
                <Text style={{ color: t.muted, fontSize: 12 }}>device time — default 8:00 PM</Text>
              </View>

              {dailyTestPickerOpen && (
                <View style={{ marginTop: 10, alignItems: Platform.OS === "ios" ? "center" : "flex-start" }}>
                  <DateTimePicker
                    value={(() => {
                      const d = new Date();
                      d.setHours(Number(dailyTestSettings.hour ?? DAILY_TEST_DEFAULT_HOUR));
                      d.setMinutes(Number(dailyTestSettings.minute ?? DAILY_TEST_DEFAULT_MINUTE));
                      d.setSeconds(0);
                      d.setMilliseconds(0);
                      return d;
                    })()}
                    mode="time"
                    is24Hour={false}
                    display={Platform.OS === "android" ? "clock" : "spinner"}
                    onChange={(event, selectedDate) => {
                      // Android's dialog closes itself after a pick or a
                      // cancel — hide our wrapper either way. iOS's spinner
                      // stays open inline until the "Done" button below.
                      if (Platform.OS === "android") setDailyTestPickerOpen(false);
                      if (event.type === "dismissed") return;
                      if (selectedDate) updateDailyTestTime(selectedDate.getHours(), selectedDate.getMinutes());
                    }}
                  />
                  {Platform.OS === "ios" && (
                    <TouchableOpacity
                      onPress={() => setDailyTestPickerOpen(false)}
                      style={[s.addItemBtn, { marginTop: 8, marginLeft: 0 }]}
                    >
                      <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Done</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View> */}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== Privacy Policy ===== */}
      <Modal visible={privacyModalOpen} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setPrivacyModalOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setPrivacyModalOpen(false)}>
          <Pressable style={s.listsSheet} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={s.sheetTitle}>Privacy Policy</Text>
                <TouchableOpacity onPress={() => setPrivacyModalOpen(false)}>
                  <X size={18} color={t.muted} />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 13, color: t.muted, lineHeight: 20 }}>
                {PRIVACY_POLICY_TEXT}
              </Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== Terms of Use ===== */}
      <Modal visible={termsModalOpen} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setTermsModalOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setTermsModalOpen(false)}>
          <Pressable style={s.listsSheet} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={s.sheetTitle}>Terms of Use</Text>
                <TouchableOpacity onPress={() => setTermsModalOpen(false)}>
                  <X size={18} color={t.muted} />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 13, color: t.muted, lineHeight: 20 }}>
                {TERMS_OF_USE_TEXT}
              </Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>

    {/* ===== Header overflow menu =====
        Rendered as a plain in-tree overlay (not RN's <Modal>) so it never
        creates a separate native window on Android — that's what was
        causing the stray dark edge/shadow border around the screen. It
        sits as a sibling of the SafeAreaView, inside the same top-level
        flex:1 View, so it still paints over the *entire* device screen
        (including the status bar area), just without a native Dialog. */}
    {headerMenuOpen && (
      <Pressable style={s.menuBackdrop} onPress={() => setHeaderMenuOpen(false)}>
        <Pressable style={s.headerMenuCard} onPress={() => {}}>
          <View style={s.headerMenuTitleRow}>
            <Text style={s.headerMenuTitle}>Menu</Text>
            <TouchableOpacity onPress={() => setHeaderMenuOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} color={t.muted} />
            </TouchableOpacity>
          </View>
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
          <TouchableOpacity
            onPress={() => { setHeaderMenuOpen(false); setPrivacyModalOpen(true); }}
            style={s.headerMenuRow}
          >
            <ShieldCheck size={16} color={t.text} />
            <Text style={s.headerMenuText}>Privacy Policy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setHeaderMenuOpen(false); setTermsModalOpen(true); }}
            style={s.headerMenuRow}
          >
            <FileText size={16} color={t.text} />
            <Text style={s.headerMenuText}>Terms of Use</Text>
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
    </View>
    </GestureHandlerRootView>
  );
});

// ---------- First-run onboarding ----------
// Marketing copy below is placeholder — edit the description and feature
// chips to match your actual app before publishing.
function OnboardingScreen({ t, dark, onGetStarted, signingIn }) {
  const features = [
    { icon: Zap, label: "1-Handed Fast", note: "Quick tap shopping" },
    { icon: Users, label: "Family Sync", note: "Live permissions" },
    { icon: Layers, label: "Master Pantry", note: "Reusable items" },
  ];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} backgroundColor={t.bg} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 26, paddingTop: 20, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 34, height: 34, borderRadius: RADIUS.sm, backgroundColor: t.accentSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <Image source={require("./src/assets/icon.png")} style={{ width: 24, height: 24 }} />
            </View>
            <Text style={{ fontSize: 19, fontWeight: "800", color: t.text }}>Mind<Text style={{ color: t.accent }}>Cart</Text></Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: t.accent2Soft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.pill }}>
            <Users size={12} color={t.accent2} />
            <Text style={{ fontSize: 11, fontWeight: "700", color: t.accent2 }}>Family Ready</Text>
          </View>
        </View>

        <View style={{ alignItems: "center", marginTop: 36, marginBottom: 30 }}>
          <View style={{
            width: 108, height: 108, borderRadius: RADIUS.xl, backgroundColor: t.accentSoft,
            alignItems: "center", justifyContent: "center",
          }}>
            <ShoppingBag size={48} color={t.accent} />
          </View>
        </View>

        <Text style={{ fontSize: 27, fontWeight: "800", color: t.text, lineHeight: 34 }}>
          Remember what To buy.
        </Text>
        <Text style={{ fontSize: 27, fontWeight: "800", color: t.accent, lineHeight: 34, marginBottom: 14 }}>
          Shop smarter. Together.
        </Text>
        <Text style={{ fontSize: 14, color: t.muted, lineHeight: 21 }}>
          Effortless collaborative lists with real-time family syncing, smart units, and instant budget tracking.
        </Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 26 }}>
          {features.map(({ icon: Icon, label, note }) => (
            <View key={label} style={{
              flex: 1, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
              borderRadius: RADIUS.md, padding: 12, alignItems: "flex-start", gap: 6,
            }}>
              <Icon size={17} color={t.accent} />
              <Text style={{ fontSize: 11.5, fontWeight: "800", color: t.text }}>{label}</Text>
              <Text style={{ fontSize: 10, color: t.muted }}>{note}</Text>
            </View>
          ))}
        </View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          onPress={onGetStarted}
          disabled={signingIn}
          style={{
            marginTop: 30, backgroundColor: t.accent, borderRadius: RADIUS.md, paddingVertical: 15,
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: signingIn ? 0.7 : 1,
          }}
        >
          {signingIn ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Image source={{ uri: "https://developers.google.com/identity/images/g-logo.png" }} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff" }} />
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>
        <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4, marginTop: 16 }}>
          <Star size={12} color={t.accent2} fill={t.accent2} />
          <Text style={{ fontSize: 11.5, color: t.muted, fontWeight: "600" }}>Synced securely with your Google account</Text>
        </View>
      </ScrollView>
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
      );
    const loops = [bounce(dot1, 0), bounce(dot2, 150), bounce(dot3, 300)];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
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
  const cardShadow = { shadowColor: t.shadow, shadowOpacity: 1, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 };
  return StyleSheet.create({
    screen: { flex: 1 },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 18, paddingTop: 12 },
    brand: { fontSize: 21, fontWeight: "800", color: t.text, letterSpacing: -0.3 },
    listSwitcher: { marginTop: 5, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: t.accentSoft, alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.pill },
    listSwitcherText: { color: t.accent, fontSize: 12.5, fontWeight: "700" },
    iconBtn: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.pill, width: 40, height: 40, alignItems: "center", justifyContent: "center", ...cardShadow },
    notice: { marginHorizontal: 18, marginTop: 12, backgroundColor: t.accent2Soft, borderWidth: 1, borderColor: `${t.accent2}45`, borderRadius: RADIUS.md, padding: 12 },
    undoRow: { marginHorizontal: 18, marginTop: 12, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.md, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    searchWrap: { marginHorizontal: 18, marginTop: 16, marginBottom: 8, position: "relative", justifyContent: "center" },
    searchIcon: { position: "absolute", left: 14, zIndex: 1 },
    searchInput: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.md, paddingVertical: 11, paddingLeft: 38, paddingRight: 12, color: t.text, fontSize: 14 },
    summaryCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.lg, padding: 18, marginTop: 4, ...cardShadow },
    newTripBtn: { marginTop: 14, backgroundColor: t.accentSoft, borderRadius: RADIUS.md, padding: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
    emptyText: { textAlign: "center", color: t.muted, fontSize: 13, paddingVertical: 24 },
    catHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, paddingHorizontal: 2 },
    catHeaderText: { fontSize: 14.5, fontWeight: "800", color: t.accent, textTransform: "uppercase", letterSpacing: 0.3 },
    itemCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.md, padding: 12, ...cardShadow },
    checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    itemName: { fontSize: 14, fontWeight: "700", color: t.text },
    itemUnit: { fontSize: 11.5, color: t.muted, marginTop: 1 },
    qtyBtn: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: 8, width: 24, height: 24, alignItems: "center", justifyContent: "center" },
    qtyBtnText: { color: t.text, fontSize: 15, fontWeight: "700" },
    qtyValue: { minWidth: 20, textAlign: "center", fontSize: 13, fontWeight: "700", color: t.text },

    priceInput: { width: 58, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.sm, paddingVertical: 6, paddingHorizontal: 8, fontSize: 12.5, color: t.text },
    menuBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "transparent", alignItems: "flex-end", paddingTop: 58, paddingRight: 16, zIndex: 50, elevation: 10 },
    overlayFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    headerMenuCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.md, paddingVertical: 6, minWidth: 180, elevation: 8, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
    headerMenuTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: t.border, marginBottom: 2 },
    headerMenuTitle: { fontSize: 12.5, fontWeight: "700", color: t.muted, textTransform: "uppercase", letterSpacing: 0.4 },
    headerMenuRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
    headerMenuText: { color: t.text, fontSize: 13.5, fontWeight: "600" },
    noteInput: { marginTop: 8, marginLeft: 32, borderBottomWidth: 1, borderColor: t.border, borderStyle: "dashed", color: t.muted, fontSize: 12, fontStyle: "italic", paddingVertical: 3 },
    addBackBtn: { borderWidth: 1, borderColor: t.accent, borderRadius: RADIUS.sm, paddingVertical: 5, paddingHorizontal: 10 },
    addCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.lg, padding: 18, marginTop: 14, ...cardShadow },
    addHint: { fontSize: 13, color: t.muted, fontWeight: "600", marginBottom: 10 },
    input: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 12, color: t.text, fontSize: 14 },
    errorText: { color: t.danger, fontSize: 11.5, marginTop: 4 },
    toastWrap: { position: "absolute", top: 70, left: 16, right: 16, zIndex: 100, elevation: 12 },
    toast: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: t.surface, borderWidth: 1, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 12, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
    toastIcon: { width: 26, height: 26, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
    toastText: { flex: 1, color: t.text, fontSize: 13, lineHeight: 18, fontWeight: "600" },
    inlineError: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 8 },
    inlineErrorText: { flex: 1, color: t.danger, fontSize: 12.5, lineHeight: 17, fontWeight: "600" },
    addItemBtn: { marginLeft: "auto", backgroundColor: t.accent, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 6 },
    smallBtn: { borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.sm, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: t.surface },
    smallBtnText: { color: t.text, fontSize: 12, fontWeight: "700" },
    tabBar: { flexDirection: "row", borderTopWidth: 1, borderColor: t.border, backgroundColor: t.surface, paddingTop: 6, paddingBottom: 4 },
    tabBtn: { flex: 5, paddingVertical: 8, alignItems: "center", gap: 2 },
    tabIconWrap: { width: 60, height: 40, borderRadius: 1000, alignItems: "center", justifyContent: "center" },
    tabIconWrapActive: { backgroundColor: t.accent ,borderRadius: 20,},
    modalBackdrop: { flex: 1, backgroundColor: "rgba(15,17,30,0.55)", justifyContent: "flex-end" },
    modalBackdropCenter: { flex: 1, backgroundColor: "rgba(15,17,30,0.55)", justifyContent: "center", alignItems: "center", padding: 20 },
    listsSheet: { backgroundColor: t.bg, borderWidth: 1, borderColor: t.border, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: 20, maxHeight: "80%" },
    popupCard: { width: "100%", maxWidth: 420, backgroundColor: t.bg, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.lg, padding: 20 },
    sheetTitle: { fontSize: 18, fontWeight: "800", color: t.text },
    listRow: { backgroundColor: t.surface, borderWidth: 1, borderRadius: RADIUS.md, padding: 12, ...cardShadow },
    confirmDeleteBox: { marginTop: 8, padding: 10, backgroundColor: t.dangerSoft, borderWidth: 1, borderColor: `${t.danger}55`, borderRadius: RADIUS.sm },

    // ---- New sections: Master Items / Family / Profile ----
    masterAddBtn: { width: 34, height: 34, borderRadius: RADIUS.pill, backgroundColor: t.accent2, alignItems: "center", justifyContent: "center" },
    permChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.md, paddingVertical: 9, backgroundColor: t.surface2 },
    permChipActive: { borderColor: t.accent, backgroundColor: t.accentSoft },
    permBadge: { backgroundColor: t.accentSoft, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5, marginRight: 4 },
    avatarCircle: { width: 34, height: 34, borderRadius: RADIUS.pill, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
    avatarCircleLg: { width: 54, height: 54, borderRadius: RADIUS.pill, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
    sectionLabel: { color: t.muted, fontSize: 11.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6, marginBottom: 2 },
    settingsRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.md, padding: 12, ...cardShadow },
    settingsIconWrap: { width: 34, height: 34, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
    toggleTrack: { width: 42, height: 24, borderRadius: RADIUS.pill, backgroundColor: t.border, padding: 2, justifyContent: "center" },
    toggleTrackOn: { backgroundColor: t.accent },
    toggleThumb: { width: 20, height: 20, borderRadius: RADIUS.pill, backgroundColor: "#fff" },
    toggleThumbOn: { transform: [{ translateX: 18 }] },

    // ---- Segmented filter (Home: All / Pending / Bought) ----
    stickyFilterWrap: { backgroundColor: t.bg, marginHorizontal: -16, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: t.border },
    segmentWrap: { flexDirection: "row", backgroundColor: t.surface2, borderRadius: RADIUS.pill, padding: 3, gap: 2 },
    segmentBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, borderRadius: RADIUS.pill },
    segmentBtnActive: { backgroundColor: t.accent, ...cardShadow },
    segmentText: { fontSize: 12, fontWeight: "700", color: t.muted },
    segmentTextActive: { color: "#fff" },

    // ---- Invitations (bell, sheet, Family entry) ----
    bellBadge: { position: "absolute", top: -3, right: -3, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: t.danger, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: t.bg },
    bellBadgeText: { color: "#fff", fontSize: 9.5, fontWeight: "800" },
    tabDot: { position: "absolute", top: 6, right: 17, width: 9, height: 9, borderRadius: 5, backgroundColor: t.danger, borderWidth: 1.5, borderColor: t.surface },
    notifBackdrop: { flex: 1, backgroundColor: "rgba(15,17,30,0.45)", paddingTop: 60, paddingHorizontal: 14 },
    notifPanel: { backgroundColor: t.bg, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.lg, padding: 16, elevation: 8, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
    activityRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.md, padding: 11 },
    activityIcon: { width: 30, height: 30, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.accent },
    inviteEntry: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: t.accentSoft, borderWidth: 1, borderColor: `${t.accent}40`, borderRadius: RADIUS.lg, padding: 14 },
    inviteEntryIcon: { width: 38, height: 38, borderRadius: RADIUS.pill, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
    countPill: { minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: 12, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
    countPillText: { color: "#fff", fontSize: 12, fontWeight: "800" },

    // ---- Empty states ----
    emptyStateWrap: { alignItems: "center", paddingVertical: 36, paddingHorizontal: 20, gap: 10 },
    emptyStateIconWrap: { width: 64, height: 64, borderRadius: RADIUS.pill, backgroundColor: t.accentSoft, alignItems: "center", justifyContent: "center", marginBottom: 4 },
    emptyStateTitle: { color: t.text, fontSize: 15, fontWeight: "800", textAlign: "center" },
    emptyStateSub: { color: t.muted, fontSize: 12.5, textAlign: "center", lineHeight: 18 },
    emptyStateBtn: { marginTop: 6, backgroundColor: t.accent, borderRadius: RADIUS.md, paddingVertical: 11, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 6 },
  });
}
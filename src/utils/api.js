// api.js — thin REST client for the MindCart backend (Neon-backed).
// This is the cloud counterpart to storage.js: storage.js still owns purely
// local preferences (theme, currency, reminder settings), while this file
// owns anything shared with other people — lists, items, and sharing/invites.
//
// OFFLINE MODEL: every list is a cloud list from the moment it's created —
// there's no more "local-only" list. The client generates a permanent id
// for every list/item up front (see makeId in storage.js), so an item's
// identity never changes whether it was created online or offline. Every
// mutating call below (create/rename/delete a list, create/update/delete
// an item) tries the network immediately; if that fails because there's no
// connection, it's handed to syncQueue.js instead of being thrown away,
// and syncQueue replays it — in order — the moment connectivity returns.
// Reads (fetchLists, fetchInvites, etc.) are NOT queued: there's nothing
// useful to "replay" for a read, the local cache already covers offline
// viewing (see App.js's persisted itemsByList/lists state).

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerExecutors, enqueue, startSync, subscribe, getPendingCount, getPendingListIds, setOnDropped } from "./syncQueue";

// ============================================================
// BACKEND URL — the #1 reason "nothing works" is this pointing
// at the wrong place. Fill in the two lines below.
// ============================================================
//
// 1) PROD_API_URL — your deployed backend (Railway/Render/etc), e.g.
//      "https://mindcart-backend.up.railway.app"
//    Used automatically for release/production builds.
//
// 2) DEV_LAN_IP — required if you're testing on a PHYSICAL phone (not
//    an emulator/simulator) with a local backend. Set it to your
//    computer's LAN IP, e.g. "192.168.1.23" (find it with `ipconfig`
//    on Windows or `ifconfig`/`ipconfig getifaddr en0` on Mac — must
//    be the same Wi-Fi network as the phone, and must match the
//    backend's PORT in .env, default 4000).
//
// If you leave DEV_LAN_IP blank, dev builds fall back to the emulator
// loopback addresses below, which do NOT work on a real device:
//   - Android emulator -> 10.0.2.2 (maps to your computer's localhost)
//   - iOS simulator     -> localhost (shares your computer's network stack)


const DEV_LAN_IP = process.env.EXPO_PUBLIC_DEV_LAN_IP;
const PROD_API_URL = process.env.EXPO_PUBLIC_PROD_API_URL;
const ENV = process.env.EXPO_PUBLIC_ENV;


export function resolveApiBaseUrl() {
  if (ENV === "prod") {
    console.log("[api.js] Environment: PROD");
    console.log("[api.js] API:", PROD_API_URL);

    return PROD_API_URL;
  }

  if (ENV === "dev") {
    console.log("[api.js] Environment: DEV");
    console.log("[api.js] API:", DEV_LAN_IP);

    return `http://${DEV_LAN_IP}:4000`;
  }

  throw new Error(`[api.js] Unknown environment: ${ENV}`);
}

export const API_BASE_URL = resolveApiBaseUrl();
console.log(`[api.js] API_BASE_URL = ${API_BASE_URL}`);
const TOKEN_KEY = "mindcart_session_token_v1";

console.log(`[api.js] API_BASE_URL = ${API_BASE_URL}`);
let cachedToken = null;

export async function getToken() {
  if (cachedToken) return cachedToken;
  cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  return cachedToken;
}
export async function setToken(token) {
  cachedToken = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  // console.log(`API request: ${method} ${path}`);
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    // RN's fetch throws a generic "Network request failed" for anything
    // from "server not running" to "wrong IP for this device" to "phone
    // is actually offline". We can't tell those apart here, but for every
    // mutating call the caller treats this the same way regardless: queue
    // it and retry later rather than losing the change.
    const err = new Error(
      `Couldn't reach the backend at ${API_BASE_URL} — check it's running and that this device can reach that address (see the comment at the top of src/utils/api.js).`
    );
    err.isOffline = true;
    throw err;
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- Offline-aware mutation wrapper ----------
// Tries the network first. If it fails for connectivity reasons, the
// mutation is queued instead of rejected, and this resolves with a
// best-effort optimistic result (queued: true) so callers don't need a
// separate offline code path — the same optimistic UI update they already
// do for the online case just... stays, until the real server copy arrives
// over the socket once the queue flushes.
async function attemptOrQueue({ type, entityKey, run, queuedPayload, optimisticResult }) {
  try {
    return await run();
  } catch (e) {
    if (e.isOffline) {
      await enqueue({ type, entityKey, payload: queuedPayload });
      return { ...optimisticResult, queued: true };
    }
    throw e; // real server rejection (validation, permission, etc.) — surface it
  }
}

// Executors: the actual network call for each queued operation type, used
// when syncQueue replays a pending write after reconnecting.
registerExecutors({
  createList: (p) => request("/lists", { method: "POST", body: { id: p.id, name: p.name } }),
  renameList: (p) => request(`/lists/${p.listId}`, { method: "PATCH", body: { name: p.name } }),
  deleteList: (p) => request(`/lists/${p.listId}`, { method: "DELETE" }),
  createItem: (p) => request(`/lists/${p.listId}/items`, { method: "POST", body: p.body }),
  updateItem: (p) => {
    const { listId, itemId, ...patch } = p;
    return request(`/lists/${listId}/items/${itemId}`, { method: "PATCH", body: patch });
  },
  deleteItem: (p) => request(`/lists/${p.listId}/items/${p.itemId}`, { method: "DELETE" }),
});

// Surfaces ops that couldn't be replayed for a real (non-network) reason —
// e.g. someone else deleted the list this item belonged to while you were
// offline. App.js can subscribe via onSyncDropped to show a notice.
let dropListener = null;
export function onSyncDropped(fn) { dropListener = fn; }
setOnDropped((op, err) => { if (dropListener) dropListener(op, err); });

// Optional UI hook: subscribe to { pending, flushing } to show something
// like "3 changes pending" while offline.
export const onSyncStatusChange = subscribe;
export const getPendingSyncCount = getPendingCount;
export const getPendingSyncListIds = getPendingListIds;

// Call once (e.g. from App.js on mount) to start watching connectivity and
// auto-flushing the outbox. Safe to call more than once — also called
// automatically below so this works even if nothing calls it explicitly.
export function initSync() {
  startSync();
}
initSync();

// ---------- Auth ----------
export const signInWithGoogle = (idToken) =>
  request("/auth/google", { method: "POST", body: { idToken }, auth: false });
export const fetchMe = () => request("/auth/me");

// ---------- Lists & items ----------
export const fetchLists = () => request("/lists");

// id is client-generated (makeId('list')) and permanent from creation —
// see storage.js. That's what lets this be queued offline: there's no
// "swap the temp id for the server id later" step to worry about.
export const createList = (id, name) => attemptOrQueue({
  type: "createList",
  entityKey: id,
  run: () => request("/lists", { method: "POST", body: { id, name } }),
  queuedPayload: { id, name },
  optimisticResult: { list: { id, name, createdAt: new Date().toISOString() } },
});

export const renameList = (listId, name) => attemptOrQueue({
  type: "renameList",
  entityKey: listId,
  run: () => request(`/lists/${listId}`, { method: "PATCH", body: { name } }),
  queuedPayload: { listId, name },
  optimisticResult: { list: { id: listId, name } },
});

export const deleteListApi = (listId) => attemptOrQueue({
  type: "deleteList",
  entityKey: listId,
  run: () => request(`/lists/${listId}`, { method: "DELETE" }),
  queuedPayload: { listId },
  optimisticResult: {},
});

// item.id must already be set by the caller (makeId('item')) before this
// is called — same reasoning as createList above.
export const createItem = (listId, item) => attemptOrQueue({
  type: "createItem",
  entityKey: item.id,
  run: () => request(`/lists/${listId}/items`, { method: "POST", body: item }),
  queuedPayload: { listId, body: item },
  optimisticResult: { item: { ...item } },
});

export const updateItemApi = (listId, itemId, patch) => attemptOrQueue({
  type: "updateItem",
  entityKey: itemId,
  run: () => request(`/lists/${listId}/items/${itemId}`, { method: "PATCH", body: patch }),
  queuedPayload: { listId, itemId, ...patch },
  optimisticResult: { item: { id: itemId, ...patch } },
});

export const deleteItemApi = (listId, itemId) => attemptOrQueue({
  type: "deleteItem",
  entityKey: itemId,
  run: () => request(`/lists/${listId}/items/${itemId}`, { method: "DELETE" }),
  queuedPayload: { listId, itemId },
  optimisticResult: {},
});

// ---------- Sharing / invites ----------
// Not offline-queued on purpose: an invite/role-change is a live,
// interactive action involving another person and a confirmation step —
// queuing it silently for hours would be surprising, not helpful. These
// still fail loudly (existing try/catch in App.js) when offline.
// role: "READ" | "WRITE". Pass { allLists: true } instead of listId to
// invite someone as a family member across every list you own.
export const sendInvite = ({ recipientEmail, role, listId, allLists }) =>
  request("/sharing/invites", { method: "POST", body: { recipientEmail, role, listId, allLists } });
export const fetchInvites = () => request("/sharing/invites");
export const acceptInvite = (inviteId) => request(`/sharing/invites/${inviteId}/accept`, { method: "POST" });
export const declineInvite = (inviteId) => request(`/sharing/invites/${inviteId}/decline`, { method: "POST" });
export const revokeInvite = (inviteId) => request(`/sharing/invites/${inviteId}/revoke`, { method: "POST" });
export const changeMemberRole = (listId, userId, role) =>
  request(`/sharing/lists/${listId}/members/${userId}`, { method: "PATCH", body: { role } });
export const removeMember = (listId, userId) =>
  request(`/sharing/lists/${listId}/members/${userId}`, { method: "DELETE" });
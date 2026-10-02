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
import { log } from "./logger";
import { registerExecutors, enqueue, startSync, subscribe, getPendingCount, getPendingListIds, setOnDropped, setOnSynced, getPendingEntityKeys, flushAndWait } from "./syncQueue";

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
    // SECURITY: the session JWT is sent on every request, so a production
    // build must never talk to the backend over cleartext http.
    if (!PROD_API_URL || !/^https:\/\//i.test(PROD_API_URL)) {
      throw new Error("[api.js] EXPO_PUBLIC_PROD_API_URL must be set to an https:// URL for production builds");
    }
    // log("[api.js] Environment: PROD");
    return PROD_API_URL;
  }

  if (ENV === "dev") {
    // log("[api.js] Environment: DEV");
    return DEV_LAN_IP;
  }

  throw new Error(`[api.js] Unknown environment: ${ENV}`);
}

export const API_BASE_URL = resolveApiBaseUrl();
// Ids end up inside URL paths. Encoding them means a malformed/hostile id
// (e.g. one containing "/" or "..") can never change which endpoint is hit.
const enc = (v) => encodeURIComponent(String(v));

const TOKEN_KEY = "mindcart_session_token_v1";

let cachedToken = null;

// SECURITY: the session JWT is the key to the whole account, so it should
// live in the OS keystore (Android Keystore / iOS Keychain) rather than in
// AsyncStorage, which is plain unencrypted storage readable on rooted
// devices and in backups. expo-secure-store is used when installed
// (`npx expo install expo-secure-store`); until then this falls back to
// AsyncStorage exactly as before, so nothing breaks. A token already sitting
// in AsyncStorage is moved into the keystore the first time it's read.
let SecureStore = null;
try {
  // eslint-disable-next-line global-require
  SecureStore = require("expo-secure-store");
} catch {
  // Not installed — AsyncStorage fallback below.
}

async function readStoredToken() {
  if (SecureStore) {
    try {
      const secure = await SecureStore.getItemAsync(TOKEN_KEY);
      if (secure) return secure;
      const legacy = await AsyncStorage.getItem(TOKEN_KEY);
      if (legacy) {
        await SecureStore.setItemAsync(TOKEN_KEY, legacy);
        await AsyncStorage.removeItem(TOKEN_KEY);
        return legacy;
      }
      return null;
    } catch {
      // Keystore unavailable on this device — fall through to AsyncStorage.
    }
  }
  return AsyncStorage.getItem(TOKEN_KEY);
}

async function writeStoredToken(token) {
  if (SecureStore) {
    try {
      if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
      else await SecureStore.deleteItemAsync(TOKEN_KEY);
      // Never leave a stale copy behind in the unencrypted store.
      await AsyncStorage.removeItem(TOKEN_KEY);
      return;
    } catch {
      // Keystore unavailable — fall through to AsyncStorage.
    }
  }
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getToken() {
  if (cachedToken) return cachedToken;
  cachedToken = await readStoredToken();
  return cachedToken;
}
export async function setToken(token) {
  cachedToken = token;
  await writeStoredToken(token);
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res;
  // Render's free tier (see start.sh) can take a good while to wake a
  // cold container, and RN's fetch has no built-in timeout — without one,
  // a slow/cold backend leaves this call hanging indefinitely instead of
  // failing, which is exactly what stalls anything gated on it (e.g. the
  // post-signin loader). 15s is generous for a warm backend and still
  // bounded for a cold one; callers already treat any rejection here the
  // same way (offline/queue-and-retry for writes, error notice for reads).
  const REQUEST_TIMEOUT_MS = 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
try {
  const fullUrl = `${API_BASE_URL}${path}`;

  res = await fetch(fullUrl, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: controller.signal,
  });
} catch (networkError) {
    // RN's fetch throws a generic "Network request failed" for anything
    // from "server not running" to "wrong IP for this device" to "phone
    // is actually offline". We can't tell those apart here, but for every
    // mutating call the caller treats this the same way regardless: queue
    // it and retry later rather than losing the change.
    const isTimeout = networkError?.name === "AbortError";
    const err = new Error(
      isTimeout
        ? "The server is taking too long to respond. Changes will sync when it's reachable."
        : `Offline. Changes will sync when you’re back online`);
    err.isOffline = true;
    err.isTimeout = isTimeout;
    throw err;
  } finally {
    clearTimeout(timeoutId);
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
  renameList: (p) => request(`/lists/${enc(p.listId)}`, { method: "PATCH", body: { name: p.name } }),
  deleteList: (p) => request(`/lists/${enc(p.listId)}`, { method: "DELETE" }),
  createItem: (p) => request(`/lists/${enc(p.listId)}/items`, { method: "POST", body: p.body }),
  updateItem: (p) => {
    const { listId, itemId, ...patch } = p;
    return request(`/lists/${enc(listId)}/items/${enc(itemId)}`, { method: "PATCH", body: patch });
  },
  deleteItem: (p) => request(`/lists/${enc(p.listId)}/items/${enc(p.itemId)}`, { method: "DELETE" }),
});

// Surfaces ops that couldn't be replayed for a real (non-network) reason —
// e.g. someone else deleted the list this item belonged to while you were
// offline. App.js can subscribe via onSyncDropped to show a notice.
let dropListener = null;
export function onSyncDropped(fn) { dropListener = fn; }
setOnDropped((op, err) => { if (dropListener) dropListener(op, err); });

// Optional UI hook: subscribe to { pending, flushing } to show something
// like "3 changes pending" while offline.
export function onSyncSucceeded(fn) { setOnSynced(fn); }
export const getPendingSyncKeys = getPendingEntityKeys;
export const flushSyncQueue = flushAndWait;
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
// Sign-in is the very first network call after a cold app start, which is
// exactly when a Render free-tier backend is most likely to be asleep
// (spins down after ~15 min idle, takes ~30-50s to wake on the next
// request). Every other request either goes through attemptOrQueue
// (which queues on failure) or is a background refresh where "try again
// later" is fine — but sign-in is the one place a user is sitting there
// watching it fail with no recourse but to keep tapping. Retry a few
// times with backoff so a cold start resolves itself instead of looking
// like a broken login.
async function withColdStartRetry(fn, { attempts = 4, delaysMs = [3000, 6000, 10000], onRetry } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      // Only retry actual connectivity failures (cold start looks
      // identical to "offline" from fetch's point of view) — a real 4xx/5xx
      // from an awake server (bad token, validation, etc.) should surface
      // immediately instead of being retried pointlessly.
      if (!e.isOffline || i === attempts - 1) throw e;
      onRetry?.(i + 1, attempts);
      await new Promise((r) => setTimeout(r, delaysMs[i] ?? delaysMs[delaysMs.length - 1]));
    }
  }
  throw lastErr;
}

// onRetry(attempt, maxAttempts) lets the caller show "Waking up the
// server…" instead of a flat failure while this quietly retries.
export const signInWithGoogle = (idToken, onRetry) =>
  withColdStartRetry(
    () => request("/auth/google", { method: "POST", body: { idToken }, auth: false }),
    { onRetry }
  );
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
  run: () => request(`/lists/${enc(listId)}`, { method: "PATCH", body: { name } }),
  queuedPayload: { listId, name },
  optimisticResult: { list: { id: listId, name } },
});

export const deleteListApi = (listId) => attemptOrQueue({
  type: "deleteList",
  entityKey: listId,
  run: () => request(`/lists/${enc(listId)}`, { method: "DELETE" }),
  queuedPayload: { listId },
  optimisticResult: {},
});

// item.id must already be set by the caller (makeId('item')) before this
// is called — same reasoning as createList above.
export const createItem = (listId, item) => attemptOrQueue({
  type: "createItem",
  entityKey: item.id,
  run: () => request(`/lists/${enc(listId)}/items`, { method: "POST", body: item }),
  queuedPayload: { listId, body: item },
  optimisticResult: { item: { ...item } },
});

export const updateItemApi = (listId, itemId, patch) => attemptOrQueue({
  type: "updateItem",
  entityKey: itemId,
  run: () => request(`/lists/${enc(listId)}/items/${enc(itemId)}`, { method: "PATCH", body: patch }),
  queuedPayload: { listId, itemId, ...patch },
  optimisticResult: { item: { id: itemId, ...patch } },
});

export const deleteItemApi = (listId, itemId) => attemptOrQueue({
  type: "deleteItem",
  entityKey: itemId,
  run: () => request(`/lists/${enc(listId)}/items/${enc(itemId)}`, { method: "DELETE" }),
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
export const acceptInvite = (inviteId) => request(`/sharing/invites/${enc(inviteId)}/accept`, { method: "POST" });
export const declineInvite = (inviteId) => request(`/sharing/invites/${enc(inviteId)}/decline`, { method: "POST" });
export const revokeInvite = (inviteId) => request(`/sharing/invites/${enc(inviteId)}/revoke`, { method: "POST" });
export const changeMemberRole = (listId, userId, role) =>
  request(`/sharing/lists/${enc(listId)}/members/${enc(userId)}`, { method: "PATCH", body: { role } });
export const removeMember = (listId, userId) =>
  request(`/sharing/lists/${enc(listId)}/members/${enc(userId)}`, { method: "DELETE" });

// ---------- Devices / push ----------
// Not offline-queued: a push token is only useful while online anyway, and
// notificationService re-registers on the next successful launch.
export const registerPushToken = ({ token, platform, deviceName, appVersion }) =>
  request("/devices/push-token", {
    method: "POST",
    body: { token, platform, deviceName, appVersion },
  });

export const unregisterPushToken = (token) =>
  request(`/devices/push-token/${encodeURIComponent(token)}`, { method: "DELETE" });
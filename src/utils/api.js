// api.js — thin REST client for the MindCart backend (Neon-backed).
// This is the cloud counterpart to storage.js: storage.js still owns purely
// local preferences (theme, currency, reminder settings), while this file
// owns anything shared with other people — lists, items, and sharing/invites.

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
const PROD_API_URL = ""; // e.g. "https://mindcart-backend.up.railway.app"
const DEV_LAN_IP = ""; // e.g. "192.168.1.23" — required for a physical device

function resolveApiBaseUrl() {
  if (!__DEV__) {
    if (!PROD_API_URL) {
      console.warn(
        "[api.js] PROD_API_URL is empty in a production build — every request will fail. Set it before publishing."
      );
    }
    return PROD_API_URL || "http://localhost:4000";
  }
  if (DEV_LAN_IP) return `http://${DEV_LAN_IP}:4001`;
  if (Platform.OS === "android") return "http://10.0.2.2:4001"; // Android emulator only
  return "http://localhost:4000"; // iOS simulator only
}

export const API_BASE_URL = resolveApiBaseUrl();
const TOKEN_KEY = "mindcart_session_token_v1";

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
  console.log(`API request: ${method} ${path}`);
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
    // from "server not running" to "wrong IP for this device" — surface
    // the URL it tried so it's obvious what to fix.
    throw new Error(
      `Couldn't reach the backend at ${API_BASE_URL} — check it's running and that this device can reach that address (see the comment at the top of src/utils/api.js).`
    );
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// ---------- Auth ----------
export const signInWithGoogle = (idToken) =>
  request("/auth/google", { method: "POST", body: { idToken }, auth: false });
export const fetchMe = () => request("/auth/me");

// ---------- Lists & items ----------
export const fetchLists = () => request("/lists");
export const createList = (name) => request("/lists", { method: "POST", body: { name } });
export const renameList = (listId, name) => request(`/lists/${listId}`, { method: "PATCH", body: { name } });
export const deleteListApi = (listId) => request(`/lists/${listId}`, { method: "DELETE" });

export const createItem = (listId, item) => request(`/lists/${listId}/items`, { method: "POST", body: item });
export const updateItemApi = (listId, itemId, patch) =>
  request(`/lists/${listId}/items/${itemId}`, { method: "PATCH", body: patch });
export const deleteItemApi = (listId, itemId) =>
  request(`/lists/${listId}/items/${itemId}`, { method: "DELETE" });

// ---------- Sharing / invites ----------
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

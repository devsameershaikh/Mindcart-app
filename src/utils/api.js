// api.js — thin REST client for the MindCart backend (Neon-backed).
// This is the cloud counterpart to storage.js: storage.js still owns purely
// local preferences (theme, currency, reminder settings), while this file
// owns anything shared with other people — lists, items, and sharing/invites.

import AsyncStorage from "@react-native-async-storage/async-storage";

// Set this to your deployed backend URL (Railway/Render), e.g.
// "https://mindcart-backend.up.railway.app"
export const API_BASE_URL = "http://10.0.2.2:4001";
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
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
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

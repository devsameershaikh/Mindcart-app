// syncQueue.js — the offline outbox.
//
// Every mutation (create/update/delete a list or item) is applied to local
// state instantly, no matter what. If the network call for it can't
// complete right now, the mutation is recorded here instead of being lost.
// The queue is persisted to disk, so it survives an app kill mid-flight.
// It auto-drains the moment connectivity comes back (NetInfo) or the app
// comes to the foreground (AppState), in the original order writes
// happened — so a device that was offline for a day and made 40 changes
// replays all 40, in order, once it reconnects.
//
// api.js is the only thing that talks to this file directly: it registers
// one "executor" per operation type (the real fetch call for that op), and
// calls enqueue() when a request fails for network/offline reasons. Nothing
// else in the app needs to know this exists, except optionally subscribing
// to status updates to show a "3 changes pending" indicator.

import AsyncStorage from "@react-native-async-storage/async-storage";

const QUEUE_KEY = "mindcart_sync_queue_v1";

let queue = []; // in-memory mirror of what's persisted
let loaded = false;
let flushing = false;
let executors = {}; // opType -> async (payload) => void   (throws on failure)
const listeners = new Set(); // status subscribers: (status) => void

function notify() {
  const status = { pending: queue.length, flushing };
  listeners.forEach((fn) => {
    try { fn(status); } catch { /* a bad subscriber shouldn't break sync */ }
  });
}

async function persist() {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // If disk write fails, the in-memory queue is still correct for this
    // session — worst case we lose the outbox on a crash, not on a normal
    // app switch.
  }
}

async function ensureLoaded() {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    queue = raw ? JSON.parse(raw) : [];
  } catch {
    queue = [];
  }
  loaded = true;
}

// ---------- Public setup ----------

// Called once from api.js at module load, with the real network call for
// each operation type. e.g. registerExecutors({ createItem: (payload) =>
// rawCreateItem(payload.listId, payload.body), ... })
export function registerExecutors(map) {
  executors = { ...executors, ...map };
}

export function subscribe(fn) {
  listeners.add(fn);
  fn({ pending: queue.length, flushing });
  return () => listeners.delete(fn);
}

export function getPendingCount() {
  return queue.length;
}

// ---------- Enqueue, with collapsing ----------
//
// entityKey identifies "the same thing" across ops so we can collapse
// redundant work instead of blindly appending — e.g. editing a note three
// times while offline should replay as ONE update, not three, and deleting
// something that was created offline and never synced should replay as
// NOTHING at all (it never has to exist on the server).
export async function enqueue({ type, entityKey, payload }) {
  await ensureLoaded();

  if (type === "deleteItem" || type === "deleteList") {
    // If the thing being deleted was created in this same offline session
    // and hasn't synced yet, its create/update ops are still sitting in
    // the queue — just drop all of them, nothing ever needs to reach the
    // server.
    const createType = type === "deleteItem" ? "createItem" : "createList";
    const hadUnsyncedCreate = queue.some((op) => op.entityKey === entityKey && op.type === createType);
    queue = queue.filter((op) => op.entityKey !== entityKey);
    if (!hadUnsyncedCreate) {
      queue.push({ id: makeOpId(), type, entityKey, payload, createdAt: Date.now() });
    }
  } else if (type === "updateItem" || type === "renameList") {
    // Merge into any existing not-yet-sent update for the same entity
    // instead of piling up separate patches.
    const existing = queue.find((op) => op.entityKey === entityKey && op.type === type);
    if (existing) {
      existing.payload = { ...existing.payload, ...payload };
      existing.createdAt = Date.now();
    } else {
      queue.push({ id: makeOpId(), type, entityKey, payload, createdAt: Date.now() });
    }
  } else {
    // createItem / createList — always its own op, and it must stay
    // ahead of any later update/delete for the same entityKey, which
    // holds true automatically since we only ever push to the end.
    queue.push({ id: makeOpId(), type, entityKey, payload, createdAt: Date.now() });
  }

  await persist();
  notify();
  // Fire-and-forget: try immediately in case this was a one-off blip
  // rather than a real offline stretch.
  flush();
}

function makeOpId() {
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------- Flushing ----------

// Processes the queue strictly in order. Stops (without dropping anything)
// the moment an op fails for network reasons — those ops are still valid,
// the network just isn't there right now. An op that fails for a real
// server reason (bad request, item genuinely gone, etc.) is dropped so one
// bad op can't jam the whole queue forever; that failure is reported back
// through onDropped so the UI can tell the user something didn't make it.
let onDropped = null;
export function setOnDropped(fn) { onDropped = fn; }

export async function flush() {
  await ensureLoaded();
  if (flushing) return;
  if (queue.length === 0) return;
  flushing = true;
  notify();
  try {
    while (queue.length > 0) {
      const op = queue[0];
      const executor = executors[op.type];
      if (!executor) { queue.shift(); continue; } // unknown op type — nothing we can do with it
      try {
        await executor(op.payload);
        queue.shift();
        await persist();
        notify();
      } catch (e) {
        if (isNetworkError(e)) {
          // Leave it at the front of the queue and stop; we'll retry on
          // the next reconnect/foreground/enqueue trigger.
          break;
        }
        // Real server-side rejection (validation, permissions, 404 after
        // someone else deleted it, etc.) — this op can never succeed as
        // written, so drop it rather than blocking everything behind it.
        queue.shift();
        await persist();
        if (onDropped) { try { onDropped(op, e); } catch { /* noop */ } }
      }
    }
  } finally {
    flushing = false;
    notify();
  }
}

function isNetworkError(e) {
  return !!e && (e.isOffline || e.name === "TypeError" || /network|offline/i.test(e?.message || ""));
}

// ---------- Connectivity wiring ----------
//
// Kept dependency-light: if @react-native-community/netinfo is installed
// we use it for instant reconnect detection; if not, we still catch up via
// AppState (foreground) and the periodic nudge below. Either way nothing
// is ever lost — worst case is "synced a bit later than the millisecond
// wifi came back" instead of "synced instantly".
let started = false;
export function startSync() {
  if (started) return;
  started = true;

  ensureLoaded().then(flush);

  try {
    // eslint-disable-next-line global-require
    const NetInfo = require("@react-native-community/netinfo").default;
    NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) flush();
    });
  } catch {
    // Package not installed — AppState + the interval below still cover it.
  }

  try {
    // eslint-disable-next-line global-require
    const { AppState } = require("react-native");
    AppState.addEventListener("change", (next) => { if (next === "active") flush(); });
  } catch { /* noop */ }

  // Belt-and-suspenders: catches the case where connectivity returned but
  // neither listener fired for some reason (flaky OS event, no NetInfo).
  setInterval(flush, 30000);
}
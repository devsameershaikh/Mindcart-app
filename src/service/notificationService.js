// notificationService.js — the single place the app talks to notifications.
//
// Covers three things that used to be scattered across App.js:
//   1. PUSH  — registering this device's Expo push token with the backend,
//              so the server can reach the user when the app is closed.
//   2. LOCAL — scheduling/cancelling on-device notifications (reminders).
//   3. TAPS  — one handler for "user tapped a notification", with the
//              payload routed by `data.type`.
//
// Usage anywhere in the app:
//
//   import notificationService from "../services/notificationService";
//
//   await notificationService.init();                 // after sign-in
//   await notificationService.teardown();             // on sign-out
//   notificationService.onTap(({ type, data }) => {}) // returns unsubscribe
//   await notificationService.notifyLocal({ title, body, data });
//   await notificationService.getPermissionStatus();
//
// The server never sends a push to a device that hasn't registered, so a
// user who declines the permission prompt simply keeps getting the
// existing socket + in-app notices and nothing breaks.

import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { registerPushToken, unregisterPushToken } from "../utils/api";
import { captureError, addBreadcrumb } from "../utils/sentry";

// Last token we successfully sent to the backend. Persisted so a relaunch
// doesn't re-POST the same token on every cold start — Expo tokens are
// stable for a given install, so re-registering every launch is pure noise.
const TOKEN_KEY = "mindcart_push_token_v1";

// Android needs channels declared before anything is posted, or the OS
// silently drops the notification. One channel per category so the user can
// mute reminders without muting invites (Android Settings exposes these
// individually).
export const CHANNELS = {
  DEFAULT: "default",
  INVITES: "invites",
  LISTS: "lists",
};

// Every push we send carries a `type` in its data payload. Keep this in sync
// with PushNotificationService.java on the backend.
export const PUSH_TYPES = {
  INVITE_RECEIVED: "invite:received",
  INVITE_ACCEPTED: "invite:accepted",
  INVITE_DECLINED: "invite:declined",
  LIST_GRANTED: "list:granted",
};

// ---------------------------------------------------------------------------
// Foreground presentation
// ---------------------------------------------------------------------------
// Without this, a push arriving while the app is open is delivered to JS but
// never shown. We DO want it shown — the socket-driven in-app notice only
// covers the screen the user is currently looking at.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    // Kept for older expo-notifications typings; harmless on SDK 54.
    shouldShowAlert: true,
  }),
});

let receivedSub = null;
let responseSub = null;
let initialised = false;
const tapHandlers = new Set();

function resolveProjectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId ??
    null
  );
}

async function ensureAndroidChannels() {
  if (Platform.OS !== "android") return;
  await Promise.all([
    Notifications.setNotificationChannelAsync(CHANNELS.DEFAULT, {
      name: "Shopping reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    }),
    Notifications.setNotificationChannelAsync(CHANNELS.INVITES, {
      name: "Family invites",
      // HIGH so an invite actually heads-up — it's a person waiting on you,
      // not a background sync event.
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    }),
    Notifications.setNotificationChannelAsync(CHANNELS.LISTS, {
      name: "Shared list activity",
      importance: Notifications.AndroidImportance.DEFAULT,
    }),
  ]).catch((e) => captureError(e, { scope: "notifications.channels" }));
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

async function requestPermission() {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  // iOS returns `canAskAgain: false` once the user has hard-denied; asking
  // again there is a silent no-op, so don't bother.
  if (!existing.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return !!asked.granted;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const notificationService = {
  /**
   * Call once the user is signed in (AuthContext does this). Safe to call
   * repeatedly — subsequent calls are a no-op unless teardown() ran.
   *
   * Never throws: notifications are an enhancement, and a failure here must
   * not block sign-in or leave the app on a loading screen.
   */
  async init({ force = false } = {}) {
    console.log("[PUSH] Initialising notification service...");
    if (initialised && !force) return { ok: true, alreadyInitialised: true };

    try {
      console.log("[PUSH] Requesting permission...");
      await ensureAndroidChannels();
      this._attachListeners();
      initialised = true;
 
      const result = await this.registerDevice();
      console.log("[PUSH] Device registration result:", result);
      return { ok: true, ...result };
    } catch (e) {
      captureError(e, { scope: "notifications.init" });
      return { ok: false, error: e };
    }
  },

  /**
   * Asks for permission (if needed), fetches the Expo push token and sends it
   * to the backend. Split out from init() so a settings screen can offer a
   * "turn on notifications" button that re-runs just this part.
   */
  async registerDevice() {
    // Push tokens only exist on real hardware. Simulators get local
    // notifications but never a push token.
    // if (!Device.isDevice) {
    //   return { registered: false, reason: "simulator" };
    // }

  //   const granted = await requestPermission();
  //   if (!granted) {
  //     addBreadcrumb("push permission denied");
  //     return { registered: false, reason: "permission-denied" };
  //   }

  //   const projectId = resolveProjectId();
  //   if (!projectId) {
  //     // Without the EAS projectId, getExpoPushTokenAsync throws in bare/dev
  //     // builds. Surface it to Sentry — it means app.json lost extra.eas.
  //     captureError(new Error("Missing EAS projectId for push token"), {
  //       scope: "notifications.registerDevice",
  //     });
  //     return { registered: false, reason: "missing-project-id" };
  //   }

  //   const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  //   if (!token) return { registered: false, reason: "no-token" };

  //   const previous = await AsyncStorage.getItem(TOKEN_KEY);
  //   if (previous === token) {
  //     return { registered: true, token, cached: true };
  //   }

  //   await registerPushToken({
  //     token,
  //     platform: Platform.OS,
  //     deviceName: Device.deviceName || null,
  //     appVersion: Constants?.expoConfig?.version || null,
  //   });
  //   await AsyncStorage.setItem(TOKEN_KEY, token);
  //   addBreadcrumb("push token registered");
  //   return { registered: true, token };
  // },
  console.log("[PUSH] Starting device registration");

const granted = await requestPermission();

console.log("[PUSH] Permission result:", granted);

if (!granted) {
  console.log("[PUSH] ❌ Permission denied");
  addBreadcrumb("push permission denied");
  return { registered: false, reason: "permission-denied" };
}

console.log("[PUSH] ✅ Notification permission granted");

const projectId = resolveProjectId();

console.log("[PUSH] EAS projectId:", projectId);

if (!projectId) {
  console.log("[PUSH] ❌ Missing EAS projectId");

  captureError(new Error("Missing EAS projectId for push token"), {
    scope: "notifications.registerDevice",
  });

  return { registered: false, reason: "missing-project-id" };
}

console.log("[PUSH] Requesting Expo push token...");

try {
  const { data: token } =
    await Notifications.getExpoPushTokenAsync({
      projectId,
    });

  console.log("[PUSH] Expo push token:", token);

  if (!token) {
    console.log("[PUSH] ❌ No Expo push token returned");
    return { registered: false, reason: "no-token" };
  }

  console.log("[PUSH] ✅ Expo push token received");

  const previous = await AsyncStorage.getItem(TOKEN_KEY);

  console.log("[PUSH] Previous cached token:", previous);

  if (previous === token) {
    console.log("[PUSH] ✅ Token already registered/cached");

    return {
      registered: true,
      token,
      cached: true,
    };
  }

  console.log("[PUSH] Registering token with backend...");

  await registerPushToken({
    token,
    platform: Platform.OS,
    deviceName: Device.deviceName || null,
    appVersion: Constants?.expoConfig?.version || null,
  });

  console.log("[PUSH] ✅ Backend registration successful");

  await AsyncStorage.setItem(TOKEN_KEY, token);

  console.log("[PUSH] ✅ Token saved locally");

  addBreadcrumb("push token registered");

  console.log("[PUSH] 🎉 Device push registration completed");

  return {
    registered: true,
    token,
  };
} catch (error) {
  console.log("[PUSH] ❌ Push registration failed:", error);

  captureError(error, {
    scope: "notifications.registerDevice",
  });

  return {
    registered: false,
    reason: "registration-failed",
    error,
  };
}},

  /**
   * Call on sign-out. Removes the token server-side so the next person to
   * sign in on this device doesn't inherit the previous user's pushes —
   * this is the bug you get for free if you skip it.
   */
  async teardown() {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token) {
        // Best-effort: if the network is down the row is still cleaned up
        // server-side the first time Expo reports DeviceNotRegistered.
        await unregisterPushToken(token).catch(() => {});
        await AsyncStorage.removeItem(TOKEN_KEY);
      }
    } catch (e) {
      captureError(e, { scope: "notifications.teardown" });
    } finally {
      this._detachListeners();
      initialised = false;
    }
  },

  /**
   * Subscribe to notification taps. Returns an unsubscribe function, so a
   * screen can do:  useEffect(() => notificationService.onTap(fn), [])
   *
   * Handler receives { type, data, notification }.
   */
  onTap(handler) {
    tapHandlers.add(handler);
    return () => tapHandlers.delete(handler);
  },

  /**
   * If the app was launched (cold start) by tapping a notification, the
   * response listener above never fires — it only covers taps that happen
   * while JS is already running. Call this once on mount to catch that case.
   */
  async getInitialTap() {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (!response) return null;
    const data = response.notification?.request?.content?.data || {};
    return { type: data.type || null, data, notification: response.notification };
  },

  /** Fire a notification from the device itself (no server round-trip). */
  async notifyLocal({ title, body, data = {}, channelId = CHANNELS.DEFAULT, trigger = null }) {
    try {
      return await Notifications.scheduleNotificationAsync({
        content: { title, body, data, ...(Platform.OS === "android" ? { channelId } : {}) },
        trigger,
      });
    } catch (e) {
      captureError(e, { scope: "notifications.notifyLocal" });
      return null;
    }
  },

  async cancelLocal(notificationId) {
    if (!notificationId) return;
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch {
      // Already fired or already cancelled — nothing to do.
    }
  },

  async getPermissionStatus() {
    const perm = await Notifications.getPermissionsAsync();
    return { granted: !!perm.granted, canAskAgain: !!perm.canAskAgain, status: perm.status };
  },

  async setBadgeCount(count) {
    try {
      await Notifications.setBadgeCountAsync(Math.max(0, count | 0));
    } catch {
      // Unsupported on some Android launchers — not worth reporting.
    }
  },

  // ---- internals ----

  _attachListeners() {
    this._detachListeners();

    // Arrived while the app is in the foreground.
    receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification?.request?.content?.data || {};
      addBreadcrumb(`push received: ${data.type || "unknown"}`);
    });

    // User tapped it (foreground, background, or from the tray).
    responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const notification = response?.notification;
      const data = notification?.request?.content?.data || {};
      const payload = { type: data.type || null, data, notification };
      for (const handler of tapHandlers) {
        try {
          handler(payload);
        } catch (e) {
          captureError(e, { scope: "notifications.tapHandler", type: payload.type });
        }
      }
    });
  },

  _detachListeners() {
    receivedSub?.remove?.();
    responseSub?.remove?.();
    receivedSub = null;
    responseSub = null;
  },
};

export default notificationService;
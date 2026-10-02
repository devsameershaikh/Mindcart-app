// AuthContext.js — Native Google Sign-In + MindCart session management.

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  getToken,
  setToken,
  signInWithGoogle,
  fetchMe,
} from "../utils/api";

import {
  disconnectSocket,
} from "../utils/socket";

import notificationService from "../service/notificationService";
import { setSentryUser, captureError } from "../utils/sentry";
import { log, warn } from "../utils/logger";

const AuthContext = createContext(null);

// A cached copy of the last-known user profile, kept alongside the JWT so
// the app can render the signed-in UI immediately on launch — including
// with no network at all — instead of blocking on a fetchMe() call. This
// is a convenience cache, never the source of truth: the JWT is what
// actually authorizes anything, and every server request still carries it
// and can still be rejected by the backend regardless of what's cached
// here.
const CACHED_USER_KEY = "mindcart_cached_user_v1";

async function getCachedUser() {
  try {
    const raw = await AsyncStorage.getItem(CACHED_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setCachedUser(user) {
  try {
    if (user) await AsyncStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    else await AsyncStorage.removeItem(CACHED_USER_KEY);
  } catch {
    // Non-fatal — worst case the next launch falls back to fetchMe().
  }
}

// Distinguishes "the server told us this token is no good" from "we
// couldn't reach the server at all." Only the former should ever log
// someone out — the latter should leave a valid cached session alone so
// the app keeps working with no signal (e.g. inside a store). Adjust this
// if your utils/api.js throws errors in a different shape.
function isAuthRejection(error) {
  const status = error?.status ?? error?.response?.status;
  return status === 401 || status === 403;
}

export const useAuth = () => useContext(AuthContext);

// IMPORTANT:
// This must be your Google OAuth "Web application" client ID.
// Do NOT use the Android client ID here.


const GOOGLE_WEB_CLIENT_ID =process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

// Configure Google Sign-In once.
GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
  offlineAccess: false,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  // Non-null while a cold-start retry is in flight, e.g. "Waking up the
  // server… (2/4)" — lets the sign-in screen show real status instead of
  // the button just sitting there through 3 silent retries.
  const [signInStatus, setSignInStatus] = useState(null);

  // --------------------------------------------------
  // Restore existing MindCart session
  // --------------------------------------------------

  useEffect(() => {
    log("Restoring MindCart session...");

    (async () => {
      let token = null;
      try {
        token = await getToken();
      } catch (error) {
        warn("Session restore error (reading token):", error?.message);
        captureError(error, { scope: "auth.restore.readToken" });
      }

      if (!token) {
        setAuthLoading(false);
        return;
      }

      // Show a signed-in UI immediately from the cached profile — this is
      // what lets the app open straight to the lists with zero network
      // (e.g. at a store with no signal), instead of waiting on fetchMe().
      const cachedUser = await getCachedUser();
      if (cachedUser) setUser(cachedUser);
      setAuthLoading(false);

      // NOTE: the socket is intentionally NOT connected here. It's only
      // needed for pushing live changes from OTHER devices/members — every
      // read/write the user does themselves goes through plain REST calls
      // and works with no socket at all. App.js connects it lazily, only
      // once syncCloudLists() finds the user actually has a shared list
      // (see maybeConnectForSharedLists in socket.js) — a first-time
      // signup with no shared lists never opens a socket connection at all.
       notificationService.init();

      // Validate/refresh in the background. Only an explicit auth
      // rejection from the server (401/403 — token really is invalid or
      // revoked) clears the session. Any other failure — no network, a
      // timeout, a 5xx — leaves the cached session exactly as it is, so a
      // dead connection never logs someone out.
      try {
        const { user } = await fetchMe();
        setUser(user);
        await setCachedUser(user);
      } catch (error) {
        if (isAuthRejection(error)) {
          log("Stored token rejected by server — signing out");
          await setToken(null);
          await setCachedUser(null);
          setUser(null);
          disconnectSocket();
        } else {
          log("Couldn't reach server to refresh session (offline?):", error?.message);
        }
      }
    })();
  }, []);

  // --------------------------------------------------
  // Google Sign-In
  // --------------------------------------------------

  const signIn = useCallback(async () => {
    if (signingIn) return;

    setSigningIn(true);

    try {
      log("Starting Google Sign-In...");

      // Re-assert config right before use instead of trusting it landed at
      // module-import time. On Android the native bridge call behind
      // configure() isn't guaranteed to have finished by the time a user
      // taps the button a split-second after a cold launch (e.g. right
      // after "clear data"), so hasPlayServices()/signIn() can throw with
      // nothing ever reaching the backend — which is why those failures
      // show zero server-side logs. configure() is safe to call repeatedly.
      GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        offlineAccess: false,
      });

      // The native call itself (not the backend call) gets its own short
      // retry for the same cold-launch race — a couple hundred ms is
      // usually enough for the bridge to settle, so this is quick, not a
      // long backend-style backoff.
      let result;
      let lastNativeErr;
      for (let i = 0; i < 3; i++) {
        try {
          await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
          log("Google Play Services available");
          result = await GoogleSignin.signIn();
          lastNativeErr = null;
          break;
        } catch (nativeErr) {
          lastNativeErr = nativeErr;
          // A real user action (cancel) or a real unavailability should
          // surface immediately — only retry the ambiguous "something
          // wasn't ready yet" cases.
          if (
            nativeErr?.code === statusCodes.SIGN_IN_CANCELLED ||
            nativeErr?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE ||
            i === 2
          ) {
            throw nativeErr;
          }
          log(`Google Sign-In native call not ready yet, retrying (${i + 1}/3)...`);
          await new Promise((r) => setTimeout(r, 400 * (i + 1)));
        }
      }
      if (lastNativeErr) throw lastNativeErr;
    
      // New versions of the library return user data inside `data`
      const idToken = result?.data?.idToken;

      if (!idToken) {
        throw new Error("Google ID token was not returned");
      }

      // Send Google ID token to MindCart backend — retries a few times with
      // backoff if the backend is cold-starting (see withColdStartRetry in
      // api.js) instead of failing on the first hit.
      const response = await signInWithGoogle(idToken, (attempt, max) => {
        setSignInStatus(`Waking up the server… (${attempt}/${max})`);
      });

      const { token, user } = response;

      if (!token) {
        throw new Error("MindCart JWT was not returned by backend");
      }

      // Save MindCart JWT
      await setToken(token);

      // Update application state
      setUser(user);
      await setCachedUser(user);

      // Socket connection is deferred to App.js (see the session-restore
      // effect above for why) — a brand new signup with no shared lists
      // yet never opens one.

      // setSentryUser(user);
      // Fire-and-forget: if the user denies the permission prompt, sign-in
      // still completes normally and they just don't get pushes.
      notificationService.init().catch((e) =>
        captureError(e, { scope: "auth.signIn.notifications" })
      );

      log("MindCart Google Sign-In successful");

      return {
        success: true,
        user,
      };
    } catch (error) {
      // Never log the raw error object here: it can carry the response from
      // Google / our backend. Log only the code + message in dev.
      log("Google Sign-In error:", error?.code, error?.message);

      if (error?.code === statusCodes.SIGN_IN_CANCELLED) {
        log("User cancelled Google Sign-In");
      } else if (error?.code === statusCodes.IN_PROGRESS) {
        log("Google Sign-In already in progress");
      } else if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        log("Google Play Services unavailable");
      } else {
        // A genuine failure (not a cancel) — worth knowing about in prod.
        captureError(error, { scope: "auth.signIn" });
      }

      return {
        success: false,
        error,
      };
    } finally {
      setSigningIn(false);
      setSignInStatus(null);
    }
  }, [signingIn]);

  // --------------------------------------------------
  // Sign Out
  // --------------------------------------------------

  const signOut = useCallback(async () => {
    try {
      log("Signing out...");

      // Both are cleared before anything else so that even if a later step
      // in this function throws, the token/cached profile are already gone
      // — no path through sign-out leaves a stale JWT sitting in storage.
      // Must run while the JWT is still valid — teardown() calls the
      // backend to delete this device's token, and that call needs auth.
      await notificationService.teardown();

      await setToken(null);
      await setCachedUser(null);
      // setSentryUser(null);

      disconnectSocket();

      setUser(null);

      // Sign out from Google account as well
      try {
        await GoogleSignin.signOut();
      } catch (googleError) {
        warn("Google sign-out warning:", googleError?.message);
      }

      log("MindCart sign-out successful");
    } catch (error) {
      warn("Sign-out error:", error?.message);
      captureError(error, { scope: "auth.signOut" });
    }
  }, []);

  // --------------------------------------------------
  // Context
  // --------------------------------------------------

  return (
    <AuthContext.Provider
      value={{
        user,
        authLoading,
        signingIn,
        signInStatus,
        signIn,
        signOut,

        // Kept for compatibility with your existing UI.
        googleRequestReady: true,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
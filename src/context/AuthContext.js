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
  connectSocket,
  disconnectSocket,
} from "../utils/socket";

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
const GOOGLE_WEB_CLIENT_ID =
  "861993628635-m0elkbft86hq83ejupcu6vm14cpc1034.apps.googleusercontent.com";
// Configure Google Sign-In once.
GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
  offlineAccess: false,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  // --------------------------------------------------
  // Restore existing MindCart session
  // --------------------------------------------------

  useEffect(() => {
    console.log("Restoring MindCart session...");

    (async () => {
      let token = null;
      try {
        token = await getToken();
      } catch (error) {
        console.log("Session restore error (reading token):", error);
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

      try {
        await connectSocket();
      } catch (error) {
        console.log("Socket connect skipped (likely offline):", error?.message || error);
      }

      // Validate/refresh in the background. Only an explicit auth
      // rejection from the server (401/403 — token really is invalid or
      // revoked) clears the session. Any other failure — no network, a
      // timeout, a 5xx — leaves the cached session exactly as it is, so a
      // dead connection never logs someone out.
      try {
        const { user } = await fetchMe();
        console.log("Restoring user:");
        setUser(user);
        await setCachedUser(user);
      } catch (error) {
        if (isAuthRejection(error)) {
          console.log("Stored token rejected by server — signing out");
          await setToken(null);
          await setCachedUser(null);
          setUser(null);
          disconnectSocket();
        } else {
          console.log("Couldn't reach server to refresh session (offline?):", error?.message || error);
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
      console.log("Starting Google Sign-In...");

      // Check Google Play Services
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      console.log("Google Play Services available");

      // Open native Google account picker
      const result = await GoogleSignin.signIn();
    
      // New versions of the library return user data inside `data`
      const idToken = result?.data?.idToken;

      if (!idToken) {
        throw new Error("Google ID token was not returned");
      }

      console.log("Google ID token received");

      // Send Google ID token to MindCart backend
      const response = await signInWithGoogle(idToken);

      const { token, user } = response;

      if (!token) {
        throw new Error("MindCart JWT was not returned by backend");
      }

      // Save MindCart JWT
      await setToken(token);

      // Update application state
      setUser(user);
      await setCachedUser(user);

      // Connect socket using authenticated session
      await connectSocket();

      console.log("MindCart Google Sign-In successful");

      return {
        success: true,
        user,
      };
    } catch (error) {
      console.log("Google Sign-In error:", error);

      if (error?.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log("User cancelled Google Sign-In");
      } else if (error?.code === statusCodes.IN_PROGRESS) {
        console.log("Google Sign-In already in progress");
      } else if (
        error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE
      ) {
        console.log("Google Play Services unavailable");
      } else {
        console.log(
          "Google authentication failed:",
          error?.message || error
        );
      }

      return {
        success: false,
        error,
      };
    } finally {
      setSigningIn(false);
    }
  }, [signingIn]);

  // --------------------------------------------------
  // Sign Out
  // --------------------------------------------------

  const signOut = useCallback(async () => {
    try {
      console.log("Signing out...");

      // Both are cleared before anything else so that even if a later step
      // in this function throws, the token/cached profile are already gone
      // — no path through sign-out leaves a stale JWT sitting in storage.
      await setToken(null);
      await setCachedUser(null);

      disconnectSocket();

      setUser(null);

      // Sign out from Google account as well
      try {
        await GoogleSignin.signOut();
      } catch (googleError) {
        console.log(
          "Google sign-out warning:",
          googleError?.message || googleError
        );
      }

      console.log("MindCart sign-out successful");
    } catch (error) {
      console.log("Sign-out error:", error);
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
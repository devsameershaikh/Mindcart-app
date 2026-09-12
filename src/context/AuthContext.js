
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
      try {
        const token = await getToken();

        if (token) {
          try {
            const { user } = await fetchMe();

            setUser(user);

            await connectSocket();
          } catch (error) {
            console.log("Stored token expired/invalid");

            await setToken(null);
            disconnectSocket();
          }
        }
      } catch (error) {
        console.log("Session restore error:", error);
      } finally {
        setAuthLoading(false);
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
    

      console.log("Google Sign-In result:", result);

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

      await setToken(null);

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

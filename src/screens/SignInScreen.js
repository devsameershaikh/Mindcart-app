import React from "react";
import { View, Text, TouchableOpacity, Image, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";

// Shown once, before the main tabs, whenever there's no session.
// Deliberately minimal: one clear action, short reassurance about what
// signing in unlocks (family sharing) vs. what still works offline.
export default function SignInScreen({ t }) {
  const { signIn, signingIn, googleRequestReady } = useAuth();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]}>
      <View style={styles.content}>
        <Image source={require("../assets/icon.png")} style={styles.logo} />
        <Text style={[styles.title, { color: t.text }]}>MindCart</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          Sign in to sync your lists across devices and share them with family — invite-only, with
          read or edit permissions you control.
        </Text>

        <TouchableOpacity
          onPress={signIn}
          disabled={!googleRequestReady || signingIn}
          style={[styles.googleBtn, { borderColor: t.border, backgroundColor: t.surface }]}
        >
          {signingIn ? (
            <ActivityIndicator color={t.text} />
          ) : (
            <>
              <Image source={{ uri: "https://developers.google.com/identity/images/g-logo.png" }} style={styles.gLogo} />
              <Text style={[styles.googleBtnText, { color: t.text }]}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.footnote, { color: t.muted }]}>
          Your existing on-device lists stay put — signing in adds cloud sync and sharing on top.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  logo: { width: 72, height: 72, borderRadius: 18, marginBottom: 16 },
  title: { fontSize: 26, fontWeight: "800", marginBottom: 8 },
  subtitle: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 28 },
  googleBtn: {
    flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 20, minWidth: 240, justifyContent: "center",
  },
  gLogo: { width: 18, height: 18 },
  googleBtnText: { fontSize: 15, fontWeight: "600" },
  footnote: { fontSize: 11.5, textAlign: "center", marginTop: 22, lineHeight: 16 },
});

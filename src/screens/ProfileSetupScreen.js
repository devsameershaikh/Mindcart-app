import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

export default function ProfileSetupScreen({ theme: t, onSubmit }) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");

  const canSubmit = name.trim().length > 0 && mobile.length >= 10;

  return (
    <KeyboardAvoidingView
      style={[styles.wrap, { backgroundColor: t.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[styles.title, { color: t.text }]}>🛒 D-Mart List</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          Enter your name and mobile number — your list is saved on this device.
        </Text>

        <TextInput
          placeholder="Name"
          placeholderTextColor={t.muted}
          value={name}
          onChangeText={setName}
          style={[styles.input, { backgroundColor: t.surface2, borderColor: t.border, color: t.text }]}
        />
        <TextInput
          placeholder="Mobile number"
          placeholderTextColor={t.muted}
          value={mobile}
          onChangeText={(v) => setMobile(v.replace(/\D/g, "").slice(0, 10))}
          keyboardType="number-pad"
          maxLength={10}
          style={[styles.input, { backgroundColor: t.surface2, borderColor: t.border, color: t.text }]}
        />

        <TouchableOpacity
          disabled={!canSubmit}
          onPress={() => onSubmit({ name: name.trim(), mobile })}
          style={[
            styles.button,
            { backgroundColor: canSubmit ? t.accent : t.muted },
          ]}
        >
          <Text style={styles.buttonText}>Get started</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 380, borderRadius: 18, borderWidth: 1, padding: 24 },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 6 },
  subtitle: { fontSize: 13, marginBottom: 18, lineHeight: 18 },
  input: {
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    marginBottom: 10,
  },
  button: { borderRadius: 10, paddingVertical: 13, alignItems: "center", marginTop: 6 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});

// NotificationPrompt.js — friendly "notifications are off" popup.
//
// A plain in-tree overlay (no RN <Modal>, same approach as the app's other
// popups, to avoid the Android window flicker). Two actions:
//   • Cancel  -> just closes it (it can appear again the next time the app is opened)
//   • Enable  -> App asks for permission, or opens system settings if the OS
//                won't show the permission dialog anymore
//
// Props
//   visible      boolean
//   t            theme object
//   needsSettings boolean  true when the OS can't be asked again -> button says "Open Settings"
//   busy         boolean   disables buttons while a request is in flight
//   onEnable     () => void
//   onCancel     () => void

import React, { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, Pressable, Animated, StyleSheet } from "react-native";
import { BellOff, BellRing, Users, ListChecks } from "lucide-react-native";
import { RADIUS } from "../utils/theme";

export default function NotificationPrompt({ visible, t, needsSettings, busy, onEnable, onCancel }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [visible, anim]);

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 900, elevation: 900 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim, backgroundColor: "rgba(8,9,20,0.6)" }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onCancel} accessibilityLabel="Dismiss" />
      </Animated.View>

      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 28 }} pointerEvents="box-none">
        <Animated.View
          style={{
            opacity: anim,
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
            backgroundColor: t.surface, borderRadius: RADIUS.xl, padding: 22, borderWidth: 1, borderColor: t.border,
            shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 14,
          }}
        >
          <View style={{ alignItems: "center" }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: t.accentSoft, alignItems: "center", justifyContent: "center" }}>
              <BellOff size={28} color={t.accent} />
            </View>
            <Text style={{ color: t.text, fontSize: 19, fontWeight: "800", marginTop: 14, textAlign: "center" }}>
              Notifications are off
            </Text>
            <Text style={{ color: t.muted, fontSize: 14, lineHeight: 21, marginTop: 8, textAlign: "center" }}>
              Turn them on so you never miss what matters while shopping:
            </Text>
          </View>

          <View style={{ marginTop: 14, gap: 10 }}>
            <Row t={t} icon={Users} text="Family invites and list updates, live" />
            <Row t={t} icon={ListChecks} text="Items your family adds or marks as bought" />
            <Row t={t} icon={BellRing} text="Shopping reminders, only if you turn them on" />
          </View>

          {needsSettings ? (
            <Text style={{ color: t.muted, fontSize: 12, lineHeight: 18, marginTop: 14, textAlign: "center" }}>
              Notifications were blocked earlier, so we'll open Settings. Switch on “Notifications” and come back.
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
            <TouchableOpacity
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={{ flex: 1, paddingVertical: 13, borderRadius: RADIUS.md, alignItems: "center", borderWidth: 1, borderColor: t.border, backgroundColor: t.surface2, opacity: busy ? 0.6 : 1 }}
            >
              <Text style={{ color: t.text, fontWeight: "800", fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onEnable}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={needsSettings ? "Open settings" : "Enable notifications"}
              style={{ flex: 1.3, paddingVertical: 13, borderRadius: RADIUS.md, alignItems: "center", backgroundColor: t.accent, opacity: busy ? 0.7 : 1 }}
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{needsSettings ? "Open Settings" : "Enable"}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

function Row({ t, icon: Icon, text }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 30, height: 30, borderRadius: RADIUS.sm, backgroundColor: t.accent2Soft, alignItems: "center", justifyContent: "center" }}>
        <Icon size={15} color={t.accent2} />
      </View>
      <Text style={{ flex: 1, color: t.text, fontSize: 13.5, fontWeight: "600", lineHeight: 19 }}>{text}</Text>
    </View>
  );
}
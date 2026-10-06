// src/components/WelcomeOfferPopup.js
// One-time "limited-time access to all features" banner popup.
// Shown once, right after the guided tour finishes. Pure RN + lucide icons,
// no extra packages or image assets needed.
import React, { useEffect, useRef } from "react";
import { View, Text, Modal, Pressable, TouchableOpacity, Animated, Easing, StyleSheet } from "react-native";
import { Crown, Sparkles, Star, X, Cloud, Users, FileDown, ArrowRight } from "lucide-react-native";
import { RADIUS } from "../utils/theme";

const PERKS = [
  { Icon: Cloud, label: "Cloud sync" },
  { Icon: Users, label: "Family sharing" },
  { Icon: FileDown, label: "PDF export" },
];

export default function WelcomeOfferPopup({
  visible,
  t,
  onClose,
  title = "You've unlocked everything!",
  subtitle = "Enjoy limited-time access to all MindCart features, on us. Explore, share and shop smarter.",
  cta = "Start exploring",
}) {
  const scale = useRef(new Animated.Value(0.88)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.88);
    fade.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line
  }, [visible]);

  const floatY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const s = makeStyles(t);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[s.backdrop, { opacity: fade }]}>
        {/* tap outside to close */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View style={[s.card, { transform: [{ scale }] }]}>
          {/* ---- Illustration banner ---- */}
          <View style={s.banner}>
            <View style={[s.blob, { width: 150, height: 150, top: -50, left: -40 }]} />
            <View style={[s.blob, { width: 110, height: 110, bottom: -40, right: -20 }]} />
            <View style={[s.blob, { width: 40, height: 40, top: 30, right: 70 }]} />

            <Sparkles size={18} color="#fff" style={{ position: "absolute", top: 26, left: 40, opacity: 0.9 }} />
            <Star size={14} color="#fff" fill="#fff" style={{ position: "absolute", top: 48, right: 36, opacity: 0.85 }} />
            <Sparkles size={13} color="#fff" style={{ position: "absolute", bottom: 26, left: 62, opacity: 0.7 }} />
            <Star size={11} color="#fff" fill="#fff" style={{ position: "absolute", bottom: 34, right: 54, opacity: 0.7 }} />

            <Animated.View style={[s.crownCircle, { transform: [{ translateY: floatY }] }]}>
              <Crown size={38} color={t.accent} fill={t.accentSoft} />
            </Animated.View>

            <View style={s.limitedPill}>
              <Text style={s.limitedText}>LIMITED TIME</Text>
            </View>
          </View>

          {/* ---- Close ---- */}
          <TouchableOpacity
            onPress={onClose}
            style={s.closeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Close"
          >
            <X size={16} color="#fff" />
          </TouchableOpacity>

          {/* ---- Message ---- */}
          <View style={s.body}>
            <Text style={s.title}>{title}</Text>
            <Text style={s.subtitle}>{subtitle}</Text>

            <View style={s.perksRow}>
              {PERKS.map(({ Icon, label }) => (
                <View key={label} style={s.perk}>
                  <View style={s.perkIcon}>
                    <Icon size={16} color={t.accent} />
                  </View>
                  <Text style={s.perkText}>{label}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={s.cta} onPress={onClose} activeOpacity={0.85}>
              <Text style={s.ctaText}>{cta}</Text>
              <ArrowRight size={17} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} style={s.laterBtn}>
              <Text style={s.laterText}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(15,17,30,0.6)", justifyContent: "center", alignItems: "center", padding: 22 },
    card: {
      width: "100%", maxWidth: 380, backgroundColor: t.surface, borderRadius: RADIUS.xl, overflow: "hidden",
      borderWidth: 1, borderColor: t.border, elevation: 12,
      shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 },
    },
    banner: { height: 170, backgroundColor: t.accent, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    blob: { position: "absolute", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.14)" },
    crownCircle: {
      width: 84, height: 84, borderRadius: 42, backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
      elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 },
    },
    limitedPill: {
      position: "absolute", bottom: 14, backgroundColor: "rgba(255,255,255,0.22)",
      borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 4,
    },
    limitedText: { color: "#fff", fontSize: 10.5, fontWeight: "800", letterSpacing: 1 },
    closeBtn: {
      position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: 15,
      backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center",
    },
    body: { padding: 22, alignItems: "center" },
    title: { color: t.text, fontSize: 21, fontWeight: "800", textAlign: "center" },
    subtitle: { color: t.muted, fontSize: 13.5, lineHeight: 20, textAlign: "center", marginTop: 8 },
    perksRow: { flexDirection: "row", gap: 10, marginTop: 18, alignSelf: "stretch" },
    perk: { flex: 1, alignItems: "center", gap: 6, backgroundColor: t.surface2, borderRadius: RADIUS.md, paddingVertical: 12, borderWidth: 1, borderColor: t.border },
    perkIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: t.accentSoft, alignItems: "center", justifyContent: "center" },
    perkText: { color: t.text, fontSize: 11.5, fontWeight: "700" },
    cta: {
      alignSelf: "stretch", marginTop: 20, backgroundColor: t.accent, borderRadius: RADIUS.md,
      paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    },
    ctaText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    laterBtn: { paddingVertical: 10, marginTop: 4 },
    laterText: { color: t.muted, fontSize: 12.5, fontWeight: "600" },
  });
}
// GuidedTour.js — first-run spotlight tour for new users.
//
// Renders a dimmed overlay with a rounded "hole" around a real UI element
// (measured at runtime), plus a tooltip card with Next / Skip. Steps without
// a target render as a centered card. It is a plain in-tree overlay (no RN
// <Modal>) so the app's own tab bar / header keep their exact positions.
//
// Props
//   visible        boolean
//   t              theme object (getTheme())
//   steps          [{ id, title, body, icon, tab?, target?, demo? ("swipe" | "qtyprice") }]
//   getTarget      (key) => View ref | null   (anything with measureInWindow)
//   onStepChange   (step, index) => void      (App uses it to switch tabs)
//   onFinish       (reason: "done" | "skipped") => void
//   currencySymbol string, used by the qty/price demo (e.g. "₹")

import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, Animated, Easing, Dimensions, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Mask, Rect } from "react-native-svg";
import { ArrowRight, Check } from "lucide-react-native";
import { RADIUS } from "../utils/theme";

const PAD = 8; // breathing room around the highlighted element
const CARD_GAP = 14;

// Little looping "swipe right to mark bought" animation, shown inside the card.
function SwipeDemo({ t }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(x, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(x, { toValue: 0, duration: 350, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [x]);
  return (
    <View style={{ height: 54, borderRadius: RADIUS.md, overflow: "hidden", backgroundColor: t.accent2, marginTop: 12, justifyContent: "center" }}>
      <View style={{ position: "absolute", left: 14, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Check size={16} color="#fff" />
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>Bought</Text>
      </View>
      <Animated.View
        style={{
          height: 54, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.md,
          flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8,
          transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 120] }) }],
        }}
      >
        <Text style={{ fontSize: 18 }}>🥛</Text>
        <Text style={{ color: t.text, fontWeight: "700", fontSize: 14, flex: 1 }}>Milk</Text>
        <ArrowRight size={16} color={t.muted} />
      </Animated.View>
    </View>
  );
}

// Looping demo of the real item row: type a quantity -> price box unlocks ->
// type the final price -> the total updates. Mirrors Home's qty/price inputs.
function QtyPriceDemo({ t, symbol = "₹" }) {
  const [phase, setPhase] = useState(0); // 0 idle, 1 qty typed, 2 price typed, 3 total shown
  useEffect(() => {
    let alive = true;
    const timers = [];
    const run = () => {
      if (!alive) return;
      setPhase(0);
      timers.push(setTimeout(() => alive && setPhase(1), 1000));
      timers.push(setTimeout(() => alive && setPhase(2), 2200));
      timers.push(setTimeout(() => alive && setPhase(3), 3200));
      timers.push(setTimeout(run, 5600));
    };
    run();
    return () => { alive = false; timers.forEach(clearTimeout); };
  }, []);

  const box = (active, locked, text, placeholder, width) => (
    <View style={{
      width, height: 34, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center",
      backgroundColor: t.surface, borderWidth: active ? 2 : 1, borderColor: active ? t.accent : t.border,
      opacity: locked ? 0.45 : 1,
    }}>
      <Text style={{ color: text ? t.text : t.muted, fontWeight: "800", fontSize: 14 }}>{text || placeholder}</Text>
    </View>
  );

  return (
    <View style={{ marginTop: 12 }}>
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: RADIUS.md,
        backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border,
      }}>
        <Text style={{ fontSize: 18 }}>🥛</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: "700", fontSize: 14 }}>Milk</Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>liter</Text>
        </View>
        {box(phase === 0, false, phase >= 1 ? "2" : "", "0", 46)}
        {box(phase === 1, phase < 1, phase >= 2 ? "120" : "", symbol, 64)}
      </View>
      <View style={{ flexDirection: "row", marginTop: 6, paddingHorizontal: 10 }}>
        <Text style={{ flex: 1, color: t.muted, fontSize: 11, fontWeight: "700" }}>① QTY</Text>
        <Text style={{ width: 64 + 6, color: t.muted, fontSize: 11, fontWeight: "700", textAlign: "center" }}>② PRICE</Text>
      </View>
      <View style={{
        marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        paddingVertical: 8, paddingHorizontal: 12, borderRadius: RADIUS.md, backgroundColor: t.accentSoft,
        opacity: phase >= 3 ? 1 : 0.35,
      }}>
        <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700" }}>List total</Text>
        <Text style={{ color: t.accent, fontSize: 15, fontWeight: "800" }}>{symbol}{phase >= 3 ? "120" : "0"}</Text>
      </View>
    </View>
  );
}

export default function GuidedTour({ visible, t, steps, getTarget, onStepChange, onFinish, currencySymbol }) {
  const insets = useSafeAreaInsets();
  const win = Dimensions.get("window");
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null); // hole rect in overlay coordinates, or null
  const [ready, setReady] = useState(false);
  const rootRef = useRef(null);
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const cardH = useRef(0);
  const [, force] = useState(0);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  // Reset whenever the tour is (re)started.
  useEffect(() => {
    if (visible) { setIndex(0); setRect(null); setReady(false); }
  }, [visible]);

  // Pulsing ring around the highlighted element.
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);

  const measureTarget = useCallback((key, attempt = 0) => {
    const ref = key ? getTarget(key) : null;
    if (!ref || !rootRef.current) { setRect(null); setReady(true); return; }
    rootRef.current.measureInWindow((ox, oy) => {
      ref.measureInWindow((x, y, w, h) => {
        if ((!w || !h) && attempt < 8) { setTimeout(() => measureTarget(key, attempt + 1), 120); return; }
        if (!w || !h) { setRect(null); setReady(true); return; }
        setRect({ x: x - ox - PAD, y: y - oy - PAD, w: w + PAD * 2, h: h + PAD * 2 });
        setReady(true);
      });
    });
  }, [getTarget]);

  // On each step: let the app switch tab, wait for layout, then measure + fade in.
  useEffect(() => {
    if (!visible || !step) return;
    setReady(false);
    fade.setValue(0);
    onStepChange?.(step, index);
    const timer = setTimeout(() => measureTarget(step.target), step.tab ? 380 : 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line
  }, [visible, index]);

  useEffect(() => {
    if (ready) Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [ready, fade]);

  if (!visible || !step) return null;

  const next = () => (isLast ? onFinish?.("done") : setIndex((i) => i + 1));
  const skip = () => onFinish?.("skipped");

  // Card placement: below the hole if it sits in the upper half, else above;
  // centered when the step has no target.
  const cardStyle = { position: "absolute", left: 16, right: 16 };
  if (rect) {
    const holeMid = rect.y + rect.h / 2;
    if (holeMid < win.height * 0.5) cardStyle.top = Math.min(rect.y + rect.h + CARD_GAP, win.height - 320);
    else cardStyle.bottom = Math.max(win.height - rect.y + CARD_GAP, insets.bottom + 16);
  } else {
    cardStyle.top = Math.max(insets.top + 40, win.height * 0.5 - 150);
  }

  const Icon = step.icon;

  return (
    <View ref={rootRef} collapsable={false} style={[StyleSheet.absoluteFill, { zIndex: 999, elevation: 999 }]}>
      {/* Dim layer with a rounded cut-out. Touches are swallowed so the UI underneath can't be used mid-tour. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <Mask id="hole">
              <Rect x="0" y="0" width="100%" height="100%" fill="white" />
              {rect && <Rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={RADIUS.lg} ry={RADIUS.lg} fill="black" />}
            </Mask>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="rgba(8,9,20,0.78)" mask="url(#hole)" />
        </Svg>
        {rect && (
          <Animated.View
            style={{
              position: "absolute", left: rect.x - 2, top: rect.y - 2, width: rect.w + 4, height: rect.h + 4,
              borderRadius: RADIUS.lg + 2, borderWidth: 2, borderColor: t.accent,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            }}
          />
        )}
      </Animated.View>
      <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} />

      <Animated.View
        onLayout={(e) => { cardH.current = e.nativeEvent.layout.height; force((n) => n + 1); }}
        style={[
          cardStyle,
          {
            opacity: fade,
            transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            backgroundColor: t.surface, borderRadius: RADIUS.lg, padding: 18, borderWidth: 1, borderColor: t.border,
            shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12,
          },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: RADIUS.sm, backgroundColor: t.accentSoft, alignItems: "center", justifyContent: "center" }}>
            {Icon ? <Icon size={19} color={t.accent} /> : null}
          </View>
          <Text style={{ flex: 1, color: t.text, fontSize: 17, fontWeight: "800" }}>{step.title}</Text>
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700" }}>{index + 1}/{steps.length}</Text>
        </View>

        <Text style={{ color: t.muted, fontSize: 14, lineHeight: 21, marginTop: 10 }}>{step.body}</Text>
        {step.demo === "swipe" ? <SwipeDemo t={t} /> : null}
        {step.demo === "qtyprice" ? <QtyPriceDemo t={t} symbol={currencySymbol} /> : null}

        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16 }}>
          {!isLast ? (
            <TouchableOpacity onPress={skip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Skip tour">
              <Text style={{ color: t.muted, fontSize: 14, fontWeight: "700" }}>Skip</Text>
            </TouchableOpacity>
          ) : <View />}

          <View style={{ flex: 1, flexDirection: "row", justifyContent: "center", gap: 5 }}>
            {steps.map((s, i) => (
              <View key={s.id} style={{ width: i === index ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? t.accent : t.border }} />
            ))}
          </View>

          <TouchableOpacity
            onPress={next}
            accessibilityRole="button"
            style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: t.accent, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 18 }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{isLast ? "Start shopping" : "Next"}</Text>
            {isLast ? <Check size={15} color="#fff" /> : <ArrowRight size={15} color="#fff" />}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}
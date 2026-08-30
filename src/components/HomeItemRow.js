import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Check, Trash2 } from "lucide-react-native";
import { getIcon } from "../constants";

export default function HomeItemRow({ item, theme: t, onToggle, onPriceChange, onDelete }) {
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: t.surface, borderColor: t.border, opacity: item.checked ? 0.55 : 1 },
      ]}
    >
      <TouchableOpacity
        onPress={onToggle}
        style={[
          styles.checkbox,
          {
            borderColor: item.checked ? t.accent : t.border,
            backgroundColor: item.checked ? t.accent : "transparent",
          },
        ]}
      >
        {item.checked && <Check size={13} color="#fff" />}
      </TouchableOpacity>

      <Text style={styles.icon}>{getIcon(item.name)}</Text>

      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.name,
            { color: t.text, textDecorationLine: item.checked ? "line-through" : "none" },
          ]}
        >
          {item.name}
        </Text>
        <Text style={[styles.qty, { color: t.muted }]}>
          {item.qty} {item.unit}
        </Text>
      </View>

      <TextInput
        placeholder="₹"
        placeholderTextColor={t.muted}
        keyboardType="numeric"
        value={item.price === null || item.price === undefined ? "" : String(item.price)}
        onChangeText={(v) => onPriceChange(v === "" ? null : Number(v.replace(/[^0-9.]/g, "")))}
        style={[styles.priceInput, { backgroundColor: t.surface2, borderColor: t.border, color: t.text }]}
      />

      <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
        <Trash2 size={16} color={t.danger} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 17 },
  name: { fontSize: 14, fontWeight: "600" },
  qty: { fontSize: 11.5, marginTop: 2 },
  priceInput: {
    width: 56,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 12.5,
    textAlign: "center",
  },
  deleteBtn: { padding: 4 },
});

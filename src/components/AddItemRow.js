import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Trash2 } from "lucide-react-native";
import { getIcon } from "../constants";

export default function AddItemRow({ item, theme: t, onIncrement, onDelete }) {
  return (
    <View style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={styles.icon}>{getIcon(item.name)}</Text>

      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: t.text }]}>{item.name}</Text>
        <Text style={[styles.meta, { color: t.muted }]}>
          {item.category} · {item.qty} {item.unit}
        </Text>
      </View>

      <TouchableOpacity
        onPress={onIncrement}
        style={[styles.stepBtn, { backgroundColor: t.surface2, borderColor: t.border }]}
      >
        <Text style={{ color: t.text, fontSize: 16, fontWeight: "600" }}>+</Text>
      </TouchableOpacity>

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
  icon: { fontSize: 17 },
  name: { fontSize: 14, fontWeight: "600" },
  meta: { fontSize: 11.5, marginTop: 2 },
  stepBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtn: { padding: 4 },
});

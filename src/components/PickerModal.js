import React from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView, Pressable, StyleSheet } from "react-native";
import { Check, X } from "lucide-react-native";

// A bottom-sheet replacement for the web <select>. Pass `options` (array of
// strings) and get back the chosen one via onSelect.
export default function PickerModal({ visible, title, options, value, onSelect, onClose, t }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { background: undefined, backgroundColor: t.bg, borderColor: t.border }]} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: t.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <X size={18} color={t.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 360 }}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                onPress={() => onSelect(opt)}
                style={[
                  styles.row,
                  { borderColor: t.border, backgroundColor: opt === value ? t.surface2 : "transparent" },
                ]}
              >
                <Text style={{ color: t.text, fontSize: 14, fontWeight: opt === value ? "700" : "500" }}>{opt}</Text>
                {opt === value ? <Check size={16} color={t.accent} /> : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, padding: 16, paddingBottom: 28 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 16, fontWeight: "700" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: 4,
  },
});
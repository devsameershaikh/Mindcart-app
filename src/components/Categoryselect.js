import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { ChevronDown, X } from "lucide-react-native";
import PickerModal from "./PickerModal";

const ADD_NEW = "+ Add new category…";

// Works for any list, and lets users add new categories on the fly —
// RN equivalent of the web <select> + "+ Add new category…" option.
// Adding a category opens its own popup (modal) with an input and a
// Save button, instead of swapping the dropdown row out inline.
export default function CategorySelect({ value, categories, onChange, onAddCategory, t, style }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function openAddPopup() {
    setDraft("");
    setAdding(true);
  }

  function closeAddPopup() {
    setAdding(false);
    setDraft("");
  }

  function commit() {
    const trimmed = draft.trim();
    if (trimmed) {
      onAddCategory(trimmed);
      onChange(trimmed);
    }
    closeAddPopup();
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.select, { backgroundColor: t.surface2, borderColor: t.border }, style]}
      >
        <Text style={{ color: t.text, fontSize: 14 }} numberOfLines={1}>{value}</Text>
        <ChevronDown size={15} color={t.muted} />
      </TouchableOpacity>

      <PickerModal
        visible={open}
        title="Category"
        options={[...categories, ADD_NEW]}
        value={value}
        t={t}
        onClose={() => setOpen(false)}
        onSelect={(c) => {
          setOpen(false);
          if (c === ADD_NEW) {
            openAddPopup();
          } else {
            onChange(c);
          }
        }}
      />

      {/* ===== Add category popup ===== */}
      <Modal visible={adding} transparent animationType="fade" onRequestClose={closeAddPopup}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.backdrop}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAddPopup} />
          <View style={[styles.popup, { backgroundColor: t.bg, borderColor: t.border }]}>
            <View style={styles.popupHeader}>
              <Text style={[styles.popupTitle, { color: t.text }]}>New category</Text>
              <TouchableOpacity onPress={closeAddPopup}>
                <X size={18} color={t.muted} />
              </TouchableOpacity>
            </View>

            <TextInput
              autoFocus
              value={draft}
              maxLength={30}
              onChangeText={setDraft}
              onSubmitEditing={commit}
              placeholder="Category name"
              placeholderTextColor={t.muted}
              style={[styles.input, { backgroundColor: t.surface2, borderColor: t.border, color: t.text }]}
            />

            <View style={styles.popupActions}>
              <TouchableOpacity onPress={closeAddPopup} style={[styles.popupBtn, { borderWidth: 1, borderColor: t.border }]}>
                <Text style={{ color: t.text, fontWeight: "700", fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={commit}
                disabled={!draft.trim()}
                style={[styles.popupBtn, { backgroundColor: t.accent, opacity: draft.trim() ? 1 : 0.5 }]}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  popup: {
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
  },
  popupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  popupTitle: { fontSize: 16, fontWeight: "800" },
  input: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14 },
  popupActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 },
  popupBtn: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16 },
});
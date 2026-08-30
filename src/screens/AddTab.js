import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  FlatList,
} from "react-native";
import { Plus } from "lucide-react-native";
import { CATEGORIES, UNITS } from "../constants";
import AddItemRow from "../components/AddItemRow";

function Picker({ theme: t, label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.pickerBtn, { backgroundColor: t.surface2, borderColor: t.border }]}
      >
        <Text style={{ color: t.text, fontSize: 14 }} numberOfLines={1}>
          {value}
        </Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={[styles.modalCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.modalTitle, { color: t.muted }]}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                  style={[styles.modalOption, { borderColor: t.border }]}
                >
                  <Text style={{ color: item === value ? t.accent : t.text, fontSize: 14 }}>
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function AddTab({ theme: t, items, search, searchMatch, onAdd, onIncrement, onDelete }) {
  const [fName, setFName] = useState("");
  const [fQty, setFQty] = useState("1");
  const [fUnit, setFUnit] = useState("packet");
  const [fCategory, setFCategory] = useState("Kitchen");

  function handleAdd() {
    if (!fName.trim()) return;
    onAdd({
      name: fName.trim(),
      category: fCategory,
      qty: Number(fQty) || 1,
      unit: fUnit,
      price: null,
    });
    setFName("");
    setFQty("1");
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {search.trim() !== "" && (
        <Text style={{ marginTop: 10, fontSize: 12.5, color: searchMatch ? t.accent : t.muted }}>
          {searchMatch
            ? `✅ "${searchMatch.name}" is already on your list (qty: ${searchMatch.qty} ${searchMatch.unit})`
            : `"${search}" is not on your list yet — add it below.`}
        </Text>
      )}

      <View style={[styles.form, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[styles.formLabel, { color: t.muted }]}>Add an item whenever you remember</Text>

        <View style={styles.formRow}>
          <TextInput
            placeholder="Item name"
            placeholderTextColor={t.muted}
            value={fName}
            onChangeText={setFName}
            onSubmitEditing={handleAdd}
            style={[styles.nameInput, { backgroundColor: t.surface2, borderColor: t.border, color: t.text }]}
          />
          <Picker theme={t} label="Category" value={fCategory} options={CATEGORIES} onChange={setFCategory} />
        </View>

        <View style={[styles.formRow, { marginTop: 8 }]}>
          <TextInput
            keyboardType="numeric"
            value={fQty}
            onChangeText={setFQty}
            style={[styles.qtyInput, { backgroundColor: t.surface2, borderColor: t.border, color: t.text }]}
          />
          <Picker theme={t} label="Unit" value={fUnit} options={UNITS} onChange={setFUnit} />
          <TouchableOpacity onPress={handleAdd} style={[styles.addBtn, { backgroundColor: t.accent }]}>
            <Plus size={15} color="#fff" />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        {items.length === 0 && (
          <Text style={[styles.empty, { color: t.muted }]}>No items found.</Text>
        )}
        {items.map((item) => (
          <AddItemRow
            key={item.id}
            item={item}
            theme={t}
            onIncrement={() => onIncrement(item.id)}
            onDelete={() => onDelete(item.id)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: 14, borderWidth: 1, borderRadius: 16, padding: 16 },
  formLabel: { fontSize: 13, fontWeight: "600", marginBottom: 10 },
  formRow: { flexDirection: "row", gap: 8 },
  nameInput: { flex: 1.4, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  qtyInput: { width: 64, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, textAlign: "center" },
  pickerBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, justifyContent: "center" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  empty: { textAlign: "center", fontSize: 13, paddingVertical: 20 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  modalCard: { borderWidth: 1, borderRadius: 16, padding: 16, maxHeight: "70%" },
  modalTitle: { fontSize: 12, fontWeight: "700", marginBottom: 8, textTransform: "uppercase" },
  modalOption: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});

import React, { useState } from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { ChevronDown } from "lucide-react-native";
import PickerModal from "./PickerModal";

// Minimal <select> replacement for plain option lists (e.g. units).
export default function SimpleSelect({ value, options, onChange, title = "Select", t, style }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} style={[styles.select, { backgroundColor: t.surface2, borderColor: t.border }, style]}>
        <Text style={{ color: t.text, fontSize: 14 }}>{value}</Text>
        <ChevronDown size={14} color={t.muted} />
      </TouchableOpacity>
      <PickerModal
        visible={open}
        title={title}
        options={options}
        value={value}
        t={t}
        onClose={() => setOpen(false)}
        onSelect={(v) => {
          onChange(v);
          setOpen(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
});
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { IndianRupee, ChevronDown } from "lucide-react-native";
import HomeItemRow from "../components/HomeItemRow";

export default function HomeTab({
  theme: t,
  filteredItems,
  categories,
  collapsed,
  onToggleCollapse,
  onToggleChecked,
  onPriceChange,
  onDelete,
  boughtTotal,
  boughtCount,
  pendingTotal,
  pendingCount,
}) {
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={[styles.summary, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <IndianRupee size={12} color={t.accent} />
            <Text style={{ color: t.accent, fontSize: 13 }}>
              {boughtTotal.toFixed(0)} bought ({boughtCount})
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <IndianRupee size={12} color={t.accent2} />
            <Text style={{ color: t.accent2, fontSize: 13 }}>
              {pendingTotal.toFixed(0)} pending ({pendingCount})
            </Text>
          </View>
          <Text style={{ color: t.text, fontWeight: "700", fontSize: 13, marginLeft: "auto" }}>
            Total ₹{(boughtTotal + pendingTotal).toFixed(0)}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        {categories.length === 0 && (
          <Text style={[styles.empty, { color: t.muted }]}>
            Your list is empty — add items from the "Add" tab first.
          </Text>
        )}

        {categories.map((cat) => {
          const catItems = filteredItems.filter((i) => i.category === cat);
          if (catItems.length === 0) return null;
          const isCollapsed = collapsed[cat];

          return (
            <View key={cat} style={{ marginBottom: 14 }}>
              <TouchableOpacity
                onPress={() => onToggleCollapse(cat)}
                style={styles.catHeader}
              >
                <Text style={[styles.catTitle, { color: t.accent }]}>{cat}</Text>
                <ChevronDown
                  size={15}
                  color={t.muted}
                  style={{ transform: [{ rotate: isCollapsed ? "-90deg" : "0deg" }] }}
                />
              </TouchableOpacity>

              {!isCollapsed && (
                <View style={{ marginTop: 6 }}>
                  {catItems.map((item) => (
                    <HomeItemRow
                      key={item.id}
                      item={item}
                      theme={t}
                      onToggle={() => onToggleChecked(item.id)}
                      onPriceChange={(price) => onPriceChange(item.id, price)}
                      onDelete={() => onDelete(item.id)}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  summary: { marginTop: 14, borderWidth: 1, borderRadius: 16, padding: 16 },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 18, alignItems: "center" },
  summaryItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  empty: { textAlign: "center", fontSize: 13, paddingVertical: 20 },
  catHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  catTitle: { fontSize: 15, fontWeight: "700" },
});

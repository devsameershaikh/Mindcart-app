import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import {
  Users, Eye, Pencil, CheckCircle2, UserPlus, QrCode, X, Check,
} from "lucide-react-native";
import { makeId } from  "../utils/storage.js";

// ---------- Family Sync screen (UI-only) ----------
// Self-contained: owns its own family-members / invite state. Pull it into
// a parent tab/stack as <FamilySyncScreen t={theme} s={styles} selectedList={...} items={...} />
export default function FamilySyncScreen({ t, s, selectedList, items = [] }) {
  const [familyMembers, setFamilyMembers] = useState([
    { id: "m1", name: "You", role: "Owner", perm: "edit" },
    { id: "m2", name: "Maya", email: "maya.vance@gmail.com", role: "Member", perm: "view" },
  ]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePerm, setInvitePerm] = useState("view");

  function sendInvite() {
    const email = inviteEmail.trim();
    if (!email || !email.includes("@")) return;
    setFamilyMembers((prev) => [
      ...prev,
      { id: makeId("member"), name: email.split("@")[0], email, role: "Pending", perm: invitePerm },
    ]);
    setInviteEmail("");
  }

  function cycleMemberPerm(id) {
    const order = ["view", "edit", "mark"];
    setFamilyMembers((prev) => prev.map((m) => {
      if (m.id !== id) return m;
      const next = order[(order.indexOf(m.perm) + 1) % order.length];
      return { ...m, perm: next };
    }));
  }

  function removeMember(id) {
    setFamilyMembers((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={[s.summaryCard]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Users size={16} color={t.accent} />
          <Text style={{ color: t.accent, fontWeight: "800", fontSize: 12.5, textTransform: "uppercase", letterSpacing: 0.4 }}>Family Sync</Text>
        </View>
        <Text style={{ color: t.text, fontWeight: "800", fontSize: 17 }}>Share Shopping List</Text>
        <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>
          {selectedList ? selectedList.name : "This list"} · {items.length} items · Live sync (preview)
        </Text>
      </View>

      <View style={s.addCard}>
        <Text style={s.addHint}>Invite a new member</Text>
        <TextInput
          value={inviteEmail}
          onChangeText={setInviteEmail}
          placeholder="name@email.com"
          placeholderTextColor={t.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          style={[s.input]}
        />
        <Text style={{ color: t.muted, fontSize: 11.5, fontWeight: "700", marginTop: 12, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.3 }}>Assign permission</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            { id: "view", label: "Can View", icon: Eye },
            { id: "edit", label: "Can Edit", icon: Pencil },
            { id: "mark", label: "Mark Bought", icon: CheckCircle2 },
          ].map(({ id, label, icon: Icon }) => (
            <TouchableOpacity
              key={id}
              onPress={() => setInvitePerm(id)}
              style={[s.permChip, invitePerm === id && s.permChipActive]}
            >
              <Icon size={14} color={invitePerm === id ? t.accent : t.muted} />
              <Text style={{ fontSize: 11, fontWeight: "700", color: invitePerm === id ? t.accent : t.muted }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity onPress={sendInvite} style={[s.addItemBtn, { marginLeft: 0, marginTop: 14, justifyContent: "center" }]}>
          <UserPlus size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Send Invite</Text>
        </TouchableOpacity>
      </View>

      <View>
        <Text style={{ color: t.muted, fontSize: 11.5, fontWeight: "700", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.3 }}>
          Family members ({familyMembers.length})
        </Text>
        <View style={{ gap: 8 }}>
          {familyMembers.map((m) => (
            <View key={m.id} style={[s.itemCard, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
              <View style={s.avatarCircle}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{m.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.itemName}>{m.name}{m.role === "Owner" ? "  ·  Owner" : m.role === "Pending" ? "  ·  Pending" : ""}</Text>
                <Text style={s.itemUnit}>{m.email || "—"}</Text>
              </View>
              <TouchableOpacity onPress={() => cycleMemberPerm(m.id)} style={s.permBadge}>
                <Text style={{ color: t.accent, fontSize: 10.5, fontWeight: "700" }}>
                  {m.perm === "view" ? "View" : m.perm === "edit" ? "Edit" : "Mark"}
                </Text>
              </TouchableOpacity>
              {m.role !== "Owner" && (
                <TouchableOpacity onPress={() => removeMember(m.id)} style={{ padding: 2 }}>
                  <X size={15} color={t.muted} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity style={[s.smallBtn, { alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6, paddingVertical: 12 }]}>
        <QrCode size={15} color={t.text} />
        <Text style={s.smallBtnText}>Show Family QR</Text>
      </TouchableOpacity>
    </View>
  );
}
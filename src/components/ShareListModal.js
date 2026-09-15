import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Modal, Pressable, ActivityIndicator } from "react-native";
import { X, Mail, Eye, Pencil, Users, List as ListIcon } from "lucide-react-native";
import { sendInvite } from "../utils/api";

// scope: preselect a specific listId to share just that list (pass listId +
// listName), or omit both to default to "share all my lists" (family mode).
export default function ShareListModal({ visible, onClose, t, listId, listName, onSent }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("READ"); // READ | WRITE
  const [scope, setScope] = useState(listId ? "list" : "all"); // "list" | "all"
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSend() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) { setError("Enter a valid email address."); return; }
    setSending(true);
    setError("");
    try {
      await sendInvite(
        scope === "all"
          ? { recipientEmail: trimmed, role, allLists: true }
          : { recipientEmail: trimmed, role, listId }
      );
      setEmail("");
      onSent?.();
      onClose();
    } catch (e) {
      setError(e.message || "Couldn't send the invite.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable
          style={{ backgroundColor: t.bg, borderWidth: 1, borderColor: t.border, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18 }}
          onPress={() => {}}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: t.text }}>Invite to MindCart</Text>
            <TouchableOpacity onPress={onClose}><X size={18} color={t.muted} /></TouchableOpacity>
          </View>
          <Text style={{ fontSize: 12.5, color: t.muted, marginBottom: 14 }}>
            This is invite-only — they'll get access only after accepting, and you can revoke it anytime.
          </Text>

          {/* Scope: this one list vs. all lists (family-wide) */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
            {listId && (
              <TouchableOpacity
                onPress={() => setScope("list")}
                style={{
                  flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                  borderWidth: 1, borderRadius: 10, paddingVertical: 10,
                  borderColor: scope === "list" ? t.accent : t.border,
                  backgroundColor: scope === "list" ? `${t.accent}18` : t.surface,
                }}
              >
                <ListIcon size={14} color={scope === "list" ? t.accent : t.muted} />
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: scope === "list" ? t.accent : t.text }}>
                  Just "{listName}"
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setScope("all")}
              style={{
                flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                borderWidth: 1, borderRadius: 10, paddingVertical: 10,
                borderColor: scope === "all" ? t.accent : t.border,
                backgroundColor: scope === "all" ? `${t.accent}18` : t.surface,
              }}
            >
              <Users size={14} color={scope === "all" ? t.accent : t.muted} />
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: scope === "all" ? t.accent : t.text }}>
                All my lists
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: error ? t.danger : t.border, borderRadius: 10, paddingHorizontal: 10, marginBottom: 6 }}>
            <Mail size={15} color={t.muted} />
            <TextInput
              value={email}
              onChangeText={(v) => { setEmail(v); if (error) setError(""); }}
              placeholder="family.member@email.com"
              placeholderTextColor={t.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={{ flex: 1, paddingVertical: 10, color: t.text, fontSize: 14 }}
            />
          </View>
          {error ? <Text style={{ color: t.danger, fontSize: 11.5, marginBottom: 8 }}>{error}</Text> : null}

          <Text style={{ fontSize: 12.5, color: t.muted, fontWeight: "600", marginTop: 8, marginBottom: 6 }}>Permission</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
            <RoleOption t={t} icon={Eye} label="Read only" desc="Can view, can't change items" active={role === "READ"} onPress={() => setRole("READ")} />
            <RoleOption t={t} icon={Pencil} label="Can edit" desc="Add, check off, edit items" active={role === "WRITE"} onPress={() => setRole("WRITE")} />
          </View>

          <TouchableOpacity
            onPress={handleSend}
            disabled={sending}
            style={{ backgroundColor: t.accent, borderRadius: 10, paddingVertical: 12, alignItems: "center", justifyContent: "center" }}
          >
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Send invite</Text>}
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function RoleOption({ t, icon: Icon, label, desc, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flex: 1, borderWidth: 1, borderRadius: 10, padding: 10,
        borderColor: active ? t.accent : t.border,
        backgroundColor: active ? `${t.accent}18` : t.surface,
      }}
    >
      <Icon size={16} color={active ? t.accent : t.text} />
      <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? t.accent : t.text, marginTop: 6 }}>{label}</Text>
      <Text style={{ fontSize: 10.5, color: t.muted, marginTop: 2 }}>{desc}</Text>
    </TouchableOpacity>
  );
}

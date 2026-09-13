import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import {
  Users, Eye, Pencil, UserPlus, X, Cloud, Home,
} from "lucide-react-native";

// ---------- Family Sync screen ----------
// Real data now: members/pending invites come from the backend (Neon,
// via the Prisma-backed sharing API) and every action here calls straight
// through to it — this screen no longer owns any mock local state.
//
// Sharing model recap (matches the backend):
//   - A list must first live in the cloud to be shared at all.
//   - Only the list's OWNER can invite, change roles, or remove people.
//   - An invite is either scoped to just this list (the default), or
//     (toggle below) "all my lists" — a standing family-member invite that
//     also covers every list the owner creates afterwards.
export default function FamilySyncScreen({
  t, s, selectedList, items = [],
  isSignedIn, signingIn, isCloudList, isOwner,
  members = [], pendingInvites = [],
  onSignIn, onMakeShareable, onInvite, onRevokeInvite, onChangeRole, onRemoveMember,
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePerm, setInvitePerm] = useState("READ");
  // IMPORTANT: default to sharing ONLY this list. "All my lists" hands the
  // recipient every list you currently own (and every list you create
  // later) the moment they accept — that mismatch between "I shared one
  // list" and "they now see all of them" is what was showing up as
  // confusing duplicate/extra lists on the recipient's side. Only flip
  // this on when the person explicitly wants a standing family member.
  const [allLists, setAllLists] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    setSending(true);
    try {
      await onInvite({ email, role: invitePerm, allLists });
      setInviteEmail("");
    } finally {
      setSending(false);
    }
  }

  // ---------- Not signed in yet ----------
  if (!isSignedIn) {
    return (
      <View style={{ gap: 14 }}>
        <View style={s.summaryCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Users size={16} color={t.accent} />
            <Text style={{ color: t.accent, fontWeight: "800", fontSize: 12.5, textTransform: "uppercase", letterSpacing: 0.4 }}>Family Sync</Text>
          </View>
          <Text style={{ color: t.text, fontWeight: "800", fontSize: 17 }}>Sign in to share lists</Text>
          <Text style={{ color: t.muted, fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
            Sharing needs an account so invites and permissions can be tied to real people. Sign in with
            Google — your local lists stay exactly as they are either way.
          </Text>
        </View>
        <TouchableOpacity onPress={onSignIn} disabled={signingIn} style={[s.addItemBtn, { justifyContent: "center" }]}>
          {signingIn ? <ActivityIndicator color="#fff" /> : (
            <>
              <Cloud size={16} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Sign in with Google</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // ---------- Signed in, but this particular list is still local-only ----------
  if (!isCloudList) {
    return (
      <View style={{ gap: 14 }}>
        <View style={s.summaryCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Home size={16} color={t.accent} />
            <Text style={{ color: t.accent, fontWeight: "800", fontSize: 12.5, textTransform: "uppercase", letterSpacing: 0.4 }}>This list is local-only</Text>
          </View>
          <Text style={{ color: t.text, fontWeight: "800", fontSize: 17 }}>
            {selectedList ? selectedList.name : "This list"}
          </Text>
          <Text style={{ color: t.muted, fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
            Move it to the cloud to share it with family — its {items.length} current item{items.length === 1 ? "" : "s"} come with it.
          </Text>
        </View>
        <TouchableOpacity onPress={onMakeShareable} style={[s.addItemBtn, { justifyContent: "center" }]}>
          <UserPlus size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Make this list shareable</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------- Cloud list: real members + (if owner) invite controls ----------
  return (
    <View style={{ gap: 14 }}>
      <View style={s.summaryCard}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Users size={16} color={t.accent} />
          <Text style={{ color: t.accent, fontWeight: "800", fontSize: 12.5, textTransform: "uppercase", letterSpacing: 0.4 }}>Family Sync</Text>
        </View>
        <Text style={{ color: t.text, fontWeight: "800", fontSize: 17 }}>Share "{selectedList ? selectedList.name : "this list"}"</Text>
        <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>
          {items.length} items · Live sync across everyone's devices
        </Text>
      </View>

      {isOwner && (
        <View style={s.addCard}>
          <Text style={s.addHint}>Invite a family member</Text>
          <TextInput
            value={inviteEmail}
            onChangeText={setInviteEmail}
            placeholder="name@email.com"
            placeholderTextColor={t.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            style={[s.input]}
          />

          <Text style={{ color: t.muted, fontSize: 11.5, fontWeight: "700", marginTop: 12, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.3 }}>
            Permission
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[
              { id: "READ", label: "Can View", icon: Eye },
              { id: "WRITE", label: "Can Edit", icon: Pencil },
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

          <TouchableOpacity
            onPress={() => setAllLists((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 }}
          >
            <View style={[s.toggleTrack, allLists && s.toggleTrackOn]}>
              <View style={[s.toggleThumb, allLists && s.toggleThumbOn]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 12.5, fontWeight: "700" }}>
                {allLists ? "Sharing: all my lists" : "Sharing: just this list"}
              </Text>
              <Text style={{ color: t.muted, fontSize: 11 }}>
                {allLists
                  ? `They'll get every list you own now, and any you create later — not just "${selectedList ? selectedList.name : "this list"}"`
                  : `They'll only get "${selectedList ? selectedList.name : "this list"}" — turn this on to make them a standing family member instead`}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleInvite}
            disabled={sending || !inviteEmail.trim()}
            style={[s.addItemBtn, { marginLeft: 0, marginTop: 14, justifyContent: "center", opacity: sending || !inviteEmail.trim() ? 0.6 : 1 }]}
          >
            {sending ? <ActivityIndicator color="#fff" /> : (
              <>
                <UserPlus size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Send Invite</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View>
        <Text style={{ color: t.muted, fontSize: 11.5, fontWeight: "700", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.3 }}>
          Members ({members.length})
        </Text>
        <View style={{ gap: 8 }}>
          {members.map((m) => (
            <View key={m.id} style={[s.itemCard, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
              <View style={s.avatarCircle}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{(m.name || m.email || "?").slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.itemName}>{m.name || m.email}{m.role === "OWNER" ? "  ·  Owner" : ""}</Text>
                <Text style={s.itemUnit}>{m.email || "—"}</Text>
              </View>
              {isOwner && m.role !== "OWNER" ? (
                <TouchableOpacity
                  onPress={() => onChangeRole(m.id, m.role === "READ" ? "WRITE" : "READ")}
                  style={s.permBadge}
                >
                  <Text style={{ color: t.accent, fontSize: 10.5, fontWeight: "700" }}>
                    {m.role === "READ" ? "View" : "Edit"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={s.permBadge}>
                  <Text style={{ color: t.accent, fontSize: 10.5, fontWeight: "700" }}>
                    {m.role === "OWNER" ? "Owner" : m.role === "READ" ? "View" : "Edit"}
                  </Text>
                </View>
              )}
              {isOwner && m.role !== "OWNER" && (
                <TouchableOpacity onPress={() => onRemoveMember(m.id)} style={{ padding: 2 }}>
                  <X size={15} color={t.muted} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </View>

      {isOwner && pendingInvites.length > 0 && (
        <View>
          <Text style={{ color: t.muted, fontSize: 11.5, fontWeight: "700", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.3 }}>
            Pending invites ({pendingInvites.length})
          </Text>
          <View style={{ gap: 8 }}>
            {pendingInvites.map((inv) => (
              <View key={inv.id} style={[s.itemCard, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.itemName}>{inv.recipientEmail}</Text>
                  <Text style={s.itemUnit}>{inv.inviteAllLists ? "Family member · all lists" : "This list"} · {inv.role === "READ" ? "View" : "Edit"} · Pending</Text>
                </View>
                <TouchableOpacity onPress={() => onRevokeInvite(inv.id)} style={{ padding: 2 }}>
                  <X size={15} color={t.muted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

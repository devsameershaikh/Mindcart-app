const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../auth");
const { hasAtLeast, getMembership } = require("../utils/permissions");

const router = express.Router();
router.use(requireAuth);

function emitToList(req, listId, event, payload) {
  req.app.get("io").to(`list:${listId}`).emit(event, payload);
}

// GET /lists -> every list the user owns or has been shared into, with role
router.get("/", async (req, res) => {
    console.log("Fetching lists for user:", req.userId);
  const memberships = await prisma.listMember.findMany({
    where: { userId: req.userId },
    include: {
      list: {
        include: {
          items: true,
          members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
        },
      },
    },
  });
  const lists = memberships.map((m) => ({
    id: m.list.id,
    name: m.list.name,
    role: m.role,
    ownerId: m.list.ownerId,
    createdAt: m.list.createdAt,
    items: m.list.items,
    members: m.list.members.map((mm) => ({ ...mm.user, role: mm.role })),
  }));
  res.json({ lists });
});

// POST /lists { id?, name } -> creates a list, caller becomes OWNER
//
// `id` is optional and comes from offline-first clients that generate a
// permanent id up front (see mobile src/utils/api.js) so a list created
// while offline keeps the same id once it finally syncs. If a retry of
// this exact request lands twice (e.g. the response was lost after the
// first attempt actually succeeded), the unique-constraint hit on that id
// is treated as an idempotent success instead of an error.
router.post("/", async (req, res) => {
  const name = (req.body?.name || "").trim();
  const clientId = req.body?.id;
  if (!name) return res.status(400).json({ error: "List name is required" });
  try {
    const list = await prisma.list.create({
      data: {
        ...(clientId ? { id: clientId } : {}),
        name,
        ownerId: req.userId,
        members: { create: { userId: req.userId, role: "OWNER" } },
      },
    });
    return res.status(201).json({ list });
  } catch (err) {
    if (clientId && err.code === "P2002") {
      const existing = await prisma.list.findUnique({ where: { id: clientId } });
      if (existing) return res.status(200).json({ list: existing });
    }
    throw err;
  }
});

router.patch("/:listId", async (req, res) => {
  const { listId } = req.params;
  if (!(await hasAtLeast(listId, req.userId, "WRITE"))) return res.status(404).json({ error: "Not found" });
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "List name is required" });
  try {
    const list = await prisma.list.update({ where: { id: listId }, data: { name } });
    emitToList(req, listId, "list:updated", { listId, name });
    res.json({ list });
  } catch (err) {
    if (err.code === "P2025") return res.status(204).end(); // list already gone — nothing to rename
    throw err;
  }
});

router.delete("/:listId", async (req, res) => {
  const { listId } = req.params;
  if (!(await hasAtLeast(listId, req.userId, "OWNER"))) return res.status(404).json({ error: "Not found" });
  try {
    await prisma.list.delete({ where: { id: listId } });
  } catch (err) {
    if (err.code !== "P2025") throw err; // already gone is fine
  }
  emitToList(req, listId, "list:deleted", { listId });
  res.status(204).end();
});

// ---------- Items ----------

// POST /:listId/items { id?, name, category, unit, price }
// Same offline-sync idempotency as list creation above: `id` is the
// client-generated permanent id, and a duplicate create for an id that
// already landed (a retried request after a dropped response) is treated
// as success rather than an error.
router.post("/:listId/items", async (req, res) => {
    console.log("Creating item in list:", req.params.listId, "for user:", req.userId);
  const { listId } = req.params;
  if (!(await hasAtLeast(listId, req.userId, "WRITE"))) return res.status(404).json({ error: "Not found" });
  const { id: clientId, name, category, unit, price } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Item name is required" });
  try {
    const item = await prisma.item.create({
      data: {
        ...(clientId ? { id: clientId } : {}),
        listId,
        name: name.trim().slice(0, 40),
        category: category || "Other",
        unit: unit || "packet",
        price: price != null ? String(price) : null,
        updatedBy: req.userId,
      },
    });
    emitToList(req, listId, "item:created", { listId, item });
    return res.status(201).json({ item });
  } catch (err) {
    if (clientId && err.code === "P2002") {
      const existing = await prisma.item.findUnique({ where: { id: clientId } });
      if (existing) return res.status(200).json({ item: existing });
    }
    throw err;
  }
});

router.patch("/:listId/items/:itemId", async (req, res) => {
    console.log("Updating item:", req.params.itemId, "in list:", req.params.listId, "for user:", req.userId);
  const { listId, itemId } = req.params;
  if (!(await hasAtLeast(listId, req.userId, "WRITE"))) return res.status(404).json({ error: "Not found" });
  const allowed = ["name", "category", "unit", "price", "qty", "checked", "skipped", "note"];
  const data = {};
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];
  data.updatedBy = req.userId;
  try {
    const item = await prisma.item.update({ where: { id: itemId }, data });
    emitToList(req, listId, "item:updated", { listId, item });
    res.json({ item });
  } catch (err) {
    // P2025 = record not found — most likely this item (or its list) was
    // deleted on another device while this update was queued offline.
    // Nothing to apply; treat it as already-settled rather than an error
    // that would otherwise sit in the client's retry queue forever.
    if (err.code === "P2025") return res.status(204).end();
    throw err;
  }
});

router.delete("/:listId/items/:itemId", async (req, res) => {
  const { listId, itemId } = req.params;
  if (!(await hasAtLeast(listId, req.userId, "WRITE"))) return res.status(404).json({ error: "Not found" });
  try {
    await prisma.item.delete({ where: { id: itemId } });
  } catch (err) {
    if (err.code !== "P2025") throw err; // already gone is fine — that's the goal state
  }
  emitToList(req, listId, "item:deleted", { listId, itemId });
  res.status(204).end();
});

module.exports = router;
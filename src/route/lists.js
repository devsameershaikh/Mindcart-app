const express = require("express");
const rateLimit = require("express-rate-limit");
const prisma = require("../db");
const { requireAuth } = require("../auth");
const { hasAtLeast, getMembership } = require("../utils/permissions");

const router = express.Router();
router.use(requireAuth);

// ---------- Rate limiting ----------
// Keyed per-user (not just per-IP) since requireAuth has already run,
// so retries from a shared/mobile NAT IP only eat into that one user's
// budget instead of starving everyone behind the same address.
const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId,
});
const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId,
});

// ---------- Small validation helpers ----------
// Client-generated ids come from offline clients (see comments below on
// the POST routes). We don't trust their shape, since they get
// interpolated into things like socket room names and stored as PKs.
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
function isValidClientId(id) {
  return typeof id === "string" && CLIENT_ID_RE.test(id);
}

function clampString(val, max) {
  return typeof val === "string" ? val.trim().slice(0, max) : val;
}

// Logging is dev-only and never includes full request bodies — just
// enough to trace a request, not enough to build a user->list profile
// from log aggregation in prod.
function devLog(...args) {
  if (process.env.NODE_ENV !== "production") console.log(...args);
}

function emitToList(req, listId, event, payload) {
  req.app.get("io").to(`list:${listId}`).emit(event, payload);
}

// GET /lists -> every list the user owns or has been shared into, with role
router.get("/", readLimiter, async (req, res) => {
  devLog("Fetching lists for user:", req.userId);
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
router.post("/", writeLimiter, async (req, res) => {
  const name = clampString(req.body?.name || "", 100);
  const clientId = req.body?.id;
  if (!name) return res.status(400).json({ error: "List name is required" });
  if (clientId !== undefined && !isValidClientId(clientId)) {
    return res.status(400).json({ error: "Invalid id" });
  }
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

router.patch("/:listId", writeLimiter, async (req, res) => {
  const { listId } = req.params;
  if (!(await hasAtLeast(listId, req.userId, "WRITE"))) return res.status(404).json({ error: "Not found" });
  const name = clampString(req.body?.name || "", 100);
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

router.delete("/:listId", writeLimiter, async (req, res) => {
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
router.post("/:listId/items", writeLimiter, async (req, res) => {
  devLog("Creating item in list:", req.params.listId, "for user:", req.userId);
  const { listId } = req.params;
  if (!(await hasAtLeast(listId, req.userId, "WRITE"))) return res.status(404).json({ error: "Not found" });
  const { id: clientId, name, category, unit, price } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Item name is required" });
  if (clientId !== undefined && !isValidClientId(clientId)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  if (price !== undefined && price !== null && typeof price !== "number" && typeof price !== "string") {
    return res.status(400).json({ error: "Invalid price" });
  }
  try {
    const item = await prisma.item.create({
      data: {
        ...(clientId ? { id: clientId } : {}),
        listId,
        name: clampString(name, 40),
        category: clampString(category || "Other", 40),
        unit: clampString(unit || "packet", 40),
        price: price != null ? String(price).slice(0, 20) : null,
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

router.patch("/:listId/items/:itemId", writeLimiter, async (req, res) => {
  devLog("Updating item:", req.params.itemId, "in list:", req.params.listId, "for user:", req.userId);
  const { listId, itemId } = req.params;
  if (!(await hasAtLeast(listId, req.userId, "WRITE"))) return res.status(404).json({ error: "Not found" });

  const body = req.body || {};
  const data = {};

  // Type/shape-check every field individually rather than copying
  // req.body straight through — untyped mass-assignment here previously
  // let a client send e.g. qty: "DROP" or checked: {} straight into
  // Prisma, which either throws a raw 500 or silently stores garbage.
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return res.status(400).json({ error: "Invalid name" });
    }
    data.name = clampString(body.name, 40);
  }
  if (body.category !== undefined) {
    if (typeof body.category !== "string") return res.status(400).json({ error: "Invalid category" });
    data.category = clampString(body.category, 40);
  }
  if (body.unit !== undefined) {
    if (typeof body.unit !== "string") return res.status(400).json({ error: "Invalid unit" });
    data.unit = clampString(body.unit, 40);
  }
  if (body.price !== undefined) {
    if (body.price !== null && typeof body.price !== "number" && typeof body.price !== "string") {
      return res.status(400).json({ error: "Invalid price" });
    }
    data.price = body.price != null ? String(body.price).slice(0, 20) : null;
  }
  if (body.qty !== undefined) {
    if (typeof body.qty !== "number" || !Number.isFinite(body.qty) || body.qty < 0) {
      return res.status(400).json({ error: "Invalid qty" });
    }
    data.qty = body.qty;
  }
  if (body.checked !== undefined) {
    if (typeof body.checked !== "boolean") return res.status(400).json({ error: "Invalid checked" });
    data.checked = body.checked;
  }
  if (body.skipped !== undefined) {
    if (typeof body.skipped !== "boolean") return res.status(400).json({ error: "Invalid skipped" });
    data.skipped = body.skipped;
  }
  if (body.note !== undefined) {
    if (typeof body.note !== "string") return res.status(400).json({ error: "Invalid note" });
    data.note = clampString(body.note, 500);
  }
  data.updatedBy = req.userId;

  try {
    // IDOR fix: previously this updated by itemId alone, so a user with
    // WRITE on *any* list of their own could patch an item belonging to
    // a completely different list just by guessing/knowing its itemId.
    // Scoping the match to (id, listId) together makes a cross-list id
    // a clean "not found" instead of a silent cross-tenant write.
    const { count } = await prisma.item.updateMany({ where: { id: itemId, listId }, data });
    if (count === 0) return res.status(404).json({ error: "Not found" });
    const item = await prisma.item.findUnique({ where: { id: itemId } });
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

router.delete("/:listId/items/:itemId", writeLimiter, async (req, res) => {
  const { listId, itemId } = req.params;
  if (!(await hasAtLeast(listId, req.userId, "WRITE"))) return res.status(404).json({ error: "Not found" });
  // Same IDOR fix as PATCH above: scope the delete to (id, listId) so an
  // itemId from another list can't be deleted via this list's WRITE grant.
  try {
    await prisma.item.deleteMany({ where: { id: itemId, listId } });
  } catch (err) {
    if (err.code !== "P2025") throw err; // already gone is fine — that's the goal state
  }
  emitToList(req, listId, "item:deleted", { listId, itemId });
  res.status(204).end();
});

// NOTE: if requireAuth is session/cookie-based rather than bearer-token
// based, confirm CSRF protection (e.g. csurf, or SameSite=strict cookies
// + custom header check) exists upstream of this router — nothing here
// provides it.

module.exports = router;
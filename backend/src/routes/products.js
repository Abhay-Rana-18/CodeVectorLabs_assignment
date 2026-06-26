const { Router } = require("express");
const pool = require("../db");

const router = Router();

// Cursor encodes the last-seen (created_at, id) as a base64 JSON string
function encodeCursor(created_at, id) {
  return Buffer.from(JSON.stringify({ created_at, id })).toString("base64url");
}

function decodeCursor(cursor) {
  try {
    const { created_at, id } = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (!created_at || !id) throw new Error();
    return { created_at: new Date(created_at), id: Number(id) };
  } catch {
    const err = new Error("Invalid cursor");
    err.status = 400;
    throw err;
  }
}

// GET /api/products?limit=20&cursor=<cursor>&category=<category>
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const { cursor, category, before } = req.query;

    const client = await pool.connect();
    try {
      // REPEATABLE READ ensures a consistent snapshot across the paginated result set —
      // rows inserted/deleted mid-pagination won't shift pages.
      await client.query(
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );

      const params = [];
      const conditions = [];

      if (category) {
        params.push(category);
        conditions.push(`category = $${params.length}`);
      }

      // Upper bound: pins the result set to the moment the browse session started.
      // Rows newer than this (e.g. added via "+ Add 50 Products") are excluded on
      // every page — including page 1 when going backwards — so Prev is consistent.
      if (before) {
        const { created_at, id } = decodeCursor(before);
        params.push(created_at, id);
        conditions.push(
          `(created_at, id) <= ($${params.length - 1}::timestamptz, $${params.length}::int)`,
        );
      }

      if (cursor) {
        const { created_at, id } = decodeCursor(cursor);
        params.push(created_at, id);
        // Keyset: rows strictly before the last-seen (created_at, id) pair
        conditions.push(
          `(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::int)`,
        );
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";
      params.push(limit + 1); // fetch one extra to determine if there's a next page

      const { rows } = await client.query(
        `SELECT id, name, category, price, created_at, updated_at
         FROM products
         ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT $${params.length}`,
        params,
      );

      await client.query("COMMIT");

      const hasNextPage = rows.length > limit;
      if (hasNextPage) rows.pop();

      const nextCursor = hasNextPage
        ? encodeCursor(rows.at(-1).created_at, rows.at(-1).id)
        : null;

      // On the very first request (no `before`), return a snapshotCursor so the
      // client can pin all subsequent requests — including backwards navigation —
      // to this point in time, making Prev consistent with Next.
      const snapshotCursor =
        !before && rows.length > 0
          ? encodeCursor(rows[0].created_at, rows[0].id)
          : undefined;

      res.json({ data: rows, nextCursor, hasNextPage, snapshotCursor });
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/products/seed — inserts 50 fresh products (demo: show pagination consistency)
const SEED_ADJECTIVES = [
  "Premium", "Ultra", "Classic", "Smart", "Compact", "Deluxe", "Pro",
  "Lite", "Heavy-Duty", "Portable", "Wireless", "Ergonomic", "Rugged",
  "Sleek", "Advanced", "Eco", "Flex", "Rapid", "Silent", "Turbo",
];
const SEED_NOUNS = [
  "Charger", "Stand", "Case", "Bag", "Jacket", "Lamp", "Chair", "Desk",
  "Bottle", "Gloves", "Helmet", "Speaker", "Watch", "Brush", "Toolkit",
  "Mat", "Rack", "Cable", "Pad", "Lens", "Frame", "Holder", "Strap",
  "Cover", "Panel", "Filter", "Clip", "Mount",
];
const SEED_CATEGORIES = [
  "electronics", "clothing", "furniture", "sports", "beauty",
  "books", "toys", "kitchen", "garden", "automotive", "music", "health",
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

router.post("/seed", async (_req, res, next) => {
  try {
    const COUNT = 50;
    const now = new Date();
    const rows = Array.from({ length: COUNT }, () => ({
      name: `${pick(SEED_ADJECTIVES)} ${pick(SEED_NOUNS)}`,
      category: pick(SEED_CATEGORIES),
      price: (Math.random() * 990 + 10).toFixed(2),
      created_at: now,
    }));

    const cols = 4;
    const placeholders = rows
      .map((_, i) =>
        `(${Array.from({ length: cols }, (__, j) => `$${i * cols + j + 1}`).join(",")})`
      )
      .join(",");
    const values = rows.flatMap((r) => [r.name, r.category, r.price, r.created_at]);

    await pool.query(
      `INSERT INTO products (name, category, price, created_at) VALUES ${placeholders}`,
      values
    );

    res.status(201).json({ inserted: COUNT, timestamp: now });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/categories
router.get("/categories", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT DISTINCT category FROM products ORDER BY category",
    );
    res.json({ data: rows.map((r) => r.category) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

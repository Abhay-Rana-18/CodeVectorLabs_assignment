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
    const { cursor, category } = req.query;

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

      res.json({ data: rows, nextCursor, hasNextPage });
    } finally {
      client.release();
    }
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

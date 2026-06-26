require("dotenv").config();
const pool = require("./db");

const TOTAL = 200_000;
const BATCH = 5_000;

const categories = [
  "electronics",
  "clothing",
  "furniture",
  "sports",
  "beauty",
  "books",
  "toys",
  "kitchen",
  "garden",
  "automotive",
  "music",
  "health",
];

const adjectives = [
  "Premium",
  "Ultra",
  "Classic",
  "Smart",
  "Compact",
  "Deluxe",
  "Pro",
  "Lite",
  "Heavy-Duty",
  "Portable",
  "Wireless",
  "Ergonomic",
  "Rugged",
  "Sleek",
  "Advanced",
  "Eco",
  "Flex",
  "Rapid",
  "Silent",
  "Turbo",
];

const nouns = [
  "Charger",
  "Stand",
  "Case",
  "Bag",
  "Jacket",
  "Lamp",
  "Chair",
  "Desk",
  "Bottle",
  "Gloves",
  "Helmet",
  "Speaker",
  "Watch",
  "Brush",
  "Toolkit",
  "Mat",
  "Rack",
  "Cable",
  "Pad",
  "Lens",
  "Frame",
  "Holder",
  "Strap",
  "Cover",
  "Panel",
  "Filter",
  "Clip",
  "Mount",
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPastDate() {
  const now = Date.now();
  const twoYearsMs = 2 * 365.25 * 24 * 60 * 60 * 1000;
  return new Date(now - Math.random() * twoYearsMs);
}

function randomPrice() {
  return (Math.random() * 990 + 10).toFixed(2);
}

function buildBatch(size) {
  return Array.from({ length: size }, () => {
    const created_at = randomPastDate();
    // updated_at is same as or after created_at (up to 30 days later)
    const updated_at = new Date(
      created_at.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000,
    );
    return {
      name: `${randomItem(adjectives)} ${randomItem(nouns)}`,
      category: randomItem(categories),
      price: randomPrice(),
      created_at,
      updated_at,
    };
  });
}

async function createTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS products (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(255) NOT NULL,
      category   VARCHAR(100) NOT NULL,
      price      NUMERIC(10, 2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function insertBatch(client, rows) {
  const cols = 5; // name, category, price, created_at, updated_at
  const placeholders = rows
    .map(
      (_, i) =>
        `(${Array.from({ length: cols }, (__, j) => `$${i * cols + j + 1}`).join(",")})`,
    )
    .join(",");

  const values = rows.flatMap((r) => [
    r.name,
    r.category,
    r.price,
    r.created_at,
    r.updated_at,
  ]);

  await client.query(
    `INSERT INTO products (name, category, price, created_at, updated_at) VALUES ${placeholders}`,
    values,
  );
}

async function seed() {
  const client = await pool.connect();
  try {
    await createTable(client);

    // Drop indexes before bulk insert — Postgres has to update every index
    // on every inserted row. Dropping first and rebuilding after is much faster.
    await client.query(`DROP INDEX IF EXISTS idx_products_created_at_id`);
    await client.query(
      `DROP INDEX IF EXISTS idx_products_category_created_at_id`,
    );

    const batches = Math.ceil(TOTAL / BATCH);
    let inserted = 0;

    for (let b = 0; b < batches; b++) {
      const size = Math.min(BATCH, TOTAL - inserted);
      const rows = buildBatch(size);
      await insertBatch(client, rows);
      inserted += size;
      process.stdout.write(
        `\rInserted ${inserted.toLocaleString()} / ${TOTAL.toLocaleString()}`,
      );
    }

    console.log("\nCreating indexes...");
    await client.query(`
      CREATE INDEX idx_products_created_at_id
        ON products (created_at DESC, id DESC)
    `);
    await client.query(`
      CREATE INDEX idx_products_category_created_at_id
        ON products (category, created_at DESC, id DESC)
    `);

    console.log("Done.");
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

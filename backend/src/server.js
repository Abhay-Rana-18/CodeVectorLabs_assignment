require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db");
const productsRouter = require("./routes/products");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    name: "CodeVector Products API",
    version: "1.0.0",
    endpoints: {
      products:
        "GET /api/products?limit=20&cursor=<cursor>&category=<category>",
      categories: "GET /api/products/categories",
      health: "GET /health",
    },
  });
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "error", db: "unreachable" });
  }
});

app.use("/api/products", productsRouter);

// Global error handler — must have 4 params so Express treats it as error middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res
    .status(err.status || 500)
    .json({ error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

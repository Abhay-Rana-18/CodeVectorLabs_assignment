# CodeVector Products API

A product browsing API with cursor-based pagination, category filtering, and a vanilla JS frontend.

## Stack

| Layer    | Technology                     |
|----------|-------------------------------|
| Backend  | Node.js, Express, `pg`        |
| Database | PostgreSQL (Neon)             |
| Frontend | Vanilla HTML / CSS / JS       |

## Project Structure

```
CodeVectorLabs/
├── backend/
│   ├── src/
│   │   ├── server.js          # Express app, CORS, global error handler
│   │   ├── db.js              # pg Pool singleton
│   │   ├── seed.js            # Seeds 200,000 products in batches of 5,000
│   │   └── routes/
│   │       └── products.js    # GET /api/products, GET /api/products/categories
│   ├── .env                   # Local env vars (not committed)
│   ├── .env.example           # Template for required env vars
│   └── package.json
└── frontend/
    └── index.html             # Product browser UI
```

## Getting Started

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in DATABASE_URL and PORT in .env
```

### 3. Seed the database

Inserts 200,000 products with random names, categories, prices, and timestamps spread across the past two years.

```bash
npm run seed
```

### 4. Start the server

```bash
npm run dev      # auto-restarts on file changes (Node --watch)
# or
npm start
```

Server runs on `http://localhost:3000` (or the `PORT` in `.env`).

### 5. Open the frontend

Open `frontend/index.html` directly in a browser. No build step needed.

## API Reference

### `GET /api/products`

Browse products with cursor-based pagination.

| Query param | Type   | Default | Description                        |
|-------------|--------|---------|------------------------------------|
| `limit`     | number | `20`    | Items per page (max 100)           |
| `cursor`    | string | —       | Opaque cursor from previous response |
| `category`  | string | —       | Filter by category name            |

**Response**

```json
{
  "data": [
    {
      "id": 1,
      "name": "Pro Charger",
      "category": "electronics",
      "price": "29.99",
      "created_at": "2025-03-10T08:42:00.000Z",
      "updated_at": "2025-03-15T10:00:00.000Z"
    }
  ],
  "nextCursor": "eyJjcmVhdGVkX2F0IjoiMjAyNS0wMy0xMFQwODo0MjowMC4wMDBaIiwiaWQiOjF9",
  "hasNextPage": true
}
```

### `GET /api/products/categories`

Returns all distinct category names.

```json
{ "data": ["automotive", "beauty", "books", ...] }
```

### `GET /health`

Returns `200` if the database is reachable, `503` otherwise.

```json
{ "status": "ok", "db": "connected" }
```

## How Pagination Works

Cursors encode the `(created_at, id)` of the last item on the current page as a `base64url` string. The next query uses a keyset condition:

```sql
WHERE (created_at, id) < ($cursor_created_at, $cursor_id)
ORDER BY created_at DESC, id DESC
```

Each page request runs inside a `REPEATABLE READ` transaction so rows inserted or deleted mid-session cannot shift subsequent pages.

## Environment Variables

| Variable       | Description                        |
|----------------|------------------------------------|
| `DATABASE_URL` | PostgreSQL connection string       |
| `PORT`         | Port for the Express server (default `3000`) |

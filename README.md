# Northstar Desk — jQuery + REST Dashboard

[![CI](https://github.com/tayyadev/jquery-rest-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/tayyadev/jquery-rest-dashboard/actions/workflows/ci.yml)
![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-43853d)
![jQuery](https://img.shields.io/badge/jQuery-3.7.1-0769ad)
![License: MIT](https://img.shields.io/badge/License-MIT-blue)

A **working, independently developed public portfolio project** demonstrating jQuery DOM manipulation, event delegation, AJAX/REST integration, accessibility, client/server validation, and automated API testing.

**Interface:** responsive customer/order dashboard with live KPI cards, searchable records, modals and pipeline indicators. Run locally to see the working interface.

## What it does

Northstar Desk is a responsive customer and order management dashboard with:

- Create, search, filter, sort, edit and delete **customers**.
- Create, search, filter, sort, edit and delete **orders**.
- REST-driven KPI cards: customer counts, active customers, orders and paid revenue.
- Order-status pipeline visualized with API-backed progress bars.
- Debounced search (250 ms), server pagination (8 rows per page), loading and error states.
- jQuery event delegation so dynamically rendered **Edit** and **Delete** controls keep working.
- Reusable forms, accessible labels/dialogs, keyboard search shortcut, confirmations and toast feedback.
- Synthetic, deterministic initial data with no real people, proprietary code or production credentials.
- Integration tests against a real, ephemeral HTTP server.

## Run locally

Prerequisite: **Node.js 20 or newer**.

```bash
git clone https://github.com/tayyadev/jquery-rest-dashboard.git
cd jquery-rest-dashboard
npm start
```

Open **http://localhost:3000**.

No packages need to be installed for the backend. The browser downloads **jQuery 3.7.1 from the official jQuery CDN**, so internet access is needed for the frontend dependency. If port 3000 is in use, set `PORT` before starting the server.

Run tests:

```bash
npm test
```

Tests use Node's built-in `node:test` and `fetch`; GitHub Actions runs them on Node.js 20 and 22.

## API reference

All mutation requests use `Content-Type: application/json`.

| Method | Endpoint | What it does |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/summary` | KPI and order-pipeline aggregates |
| GET | `/api/customer-options` | Selectable customers for order forms |
| GET | `/api/customers` | Paginated customer list |
| GET | `/api/orders` | Paginated order list with customer names |
| GET | `/api/customers/:id` | Read a customer |
| GET | `/api/orders/:id` | Read an order |
| POST | `/api/customers`, `/api/orders` | Create records |
| PATCH | `/api/customers/:id`, `/api/orders/:id` | Validate and update records |
| DELETE | `/api/customers/:id`, `/api/orders/:id` | Remove records |

Example:

```bash
curl 'http://localhost:3000/api/customers?search=Alex&status=active&page=1&pageSize=8&sort=name'
curl -X POST http://localhost:3000/api/customers \
  -H 'Content-Type: application/json' \
  -d '{"name":"Example Person","email":"sample@example.com","company":"Example Co","status":"active"}'
```

Queries support `search`, `status`, `sort`, `page`, and `pageSize` (1–50). The API returns `{data,meta}` on collection reads and structured `{error:{code,message}}` responses on errors.

## Architecture

```text
Browser
  └── jQuery 3.7.1 → AJAX fetches /api/* → DOM updates (text-safe)
       │
       ▼
Node.js HTTP server (no runtime npm dependencies)
  ├── Explicit allowlist for static assets
  ├── JSON request parsing / body size limit
  └── REST domain logic + schema validation
       └── In-memory synthetic customers and orders
```

- **`public/app.js`**: jQuery AJAX, state, 250-ms debounce, request cancellation, delegated events, DOM updates and modal management.
- **`public/styles.css`**: responsive CSS, table, badge, modal and keyboard-focus styling.
- **`server/index.js`**: HTTP adapter with bounded JSON bodies, safe responses, strict static routing and security headers.
- **`server/logic.js`**: application rules, filters, sorting, validation and CRUD operations.
- **`server/data.js`**: deterministic, clearly fictional records.
- **`tests/api.test.js`**: HTTP-level integration tests, including validation, pagination and rejection of unintended routes.

### Engineering decisions

- AJAX search uses a **250-ms debounce**; superseded list requests are aborted to avoid stale results.
- The table uses delegated handlers: `$('#tableBody').on('click','[data-action]',handler)`.
- All dynamic customer/order values are rendered through `jQuery.text()`, **not** interpolated into HTML; tests also exercise markup-shaped values.
- Server validates status enums, unique customer emails, referenced customer IDs, numeric amounts and pagination.
- Customer deletion explicitly cascades to linked synthetic orders, with the user warned in the UI.
- The API is intentionally small, testable and free of infrastructure or API-key requirements.

## Scope and limitations

**Portfolio demo, not a deployed business service.** This backend uses in-memory storage, has no authentication, and resets data on restart. It is **not appropriate for real customer information or an internet-facing production deployment** without authentication, authorization, durable storage, audit logs, rate limiting and further hardening. Monetary values are simplified and do not include taxes or settlement handling.

All repository code and data are original demo material or official jQuery CDN references. Nothing is copied from private repositories, customer engagements, licensed trading products or internal configuration. The demo is a work sample and **not** a claim of prior production jQuery employment.

## License

[MIT](LICENSE) — Copyright © 2026 Ayyappan Thirukkannan.

# Mini WMS API

A lightweight Node.js and Express REST API for paper core raw-material inventory, orders, feasibility checks, and dispatch.

## Setup

```powershell
npm.cmd install
npm.cmd start
```

The API listens on `http://localhost:3000`. Use `npm.cmd run dev` for Node watch mode. Inventory and orders persist in `data/wms.json`.

## Unit rules

- Paper inward accepts `KG` or `TONS` and stores `quantityKg`.
- Adhesive inward accepts `KG` only.
- Orders accept `PIECES`, `KG`, or `TONS`.
- The simplified estimate is `1 piece = 2.5 KG`; KG and Tons are converted directly.
- Adhesive requirement is 5% of required paper weight.

## Endpoints

### Inward stock

```json
POST /api/stock/inward
{ "type": "PAPER", "mill": "ABC Mill", "gsm": 180, "widthMm": 1200, "quantity": 2, "unit": "TONS" }
```

```json
POST /api/stock/inward
{ "type": "ADHESIVE", "quantity": 50, "unit": "KG" }
```

`GET /api/stock` returns total normalized inventory and paper lots.

### Orders and feasibility

```json
POST /api/orders
{
  "customerName": "Acme Packaging",
  "source": "Direct",
  "dimensions": { "idMm": 76, "odMm": 152, "thicknessMm": 10 },
  "quantity": 100,
  "unit": "Pieces"
}
```

`POST /api/orders/:id/check-feasibility` returns `isFeasible`, reason, and required/available stock.

### Dispatch

```json
POST /api/dispatch
{ "orderId": 1, "lorryNo": "TN01AB1234", "lorryCapacityTons": 1, "location": "Chennai" }
```

Dispatch is always for the full order. It is rejected with HTTP 400 when the order weight exceeds lorry capacity, when stock is insufficient, or when the order has already been dispatched. Successful dispatch marks the order `DISPATCHED` and deducts paper plus adhesive stock.

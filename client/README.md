# Coreline WMS Dashboard

React + Vite frontend for the Mini WMS API.

## Run

Start the backend on `http://localhost:3000`, then from this folder run:

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests to the backend.

Orders are held in the dashboard session because the current backend exposes order creation and feasibility endpoints but no `GET /api/orders` list endpoint. Stock is refreshed from the backend after each stock receipt and successful dispatch.

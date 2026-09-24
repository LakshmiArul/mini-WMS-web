const express = require('express');
const { inventorySummary, addInward, createOrder, checkFeasibility, dispatchOrder } = require('./wms');

const app = express();
const port = process.env.PORT || 3000;
const allowedOrigins = new Set([
  'https://mini-wms-web.vercel.app',
  'http://localhost:5173',
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/stock', (req, res) => res.json(inventorySummary()));
app.post('/api/stock/inward', (req, res) => {
  try { res.status(201).json(addInward(req.body)); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/orders', (req, res) => {
  try { res.status(201).json(createOrder(req.body)); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
app.post('/api/orders/:id/check-feasibility', (req, res) => {
  try { res.json(checkFeasibility(req.params.id)); }
  catch (error) { res.status(error.message === 'Order not found' ? 404 : 400).json({ error: error.message }); }
});
app.post('/api/dispatch', (req, res) => {
  try { res.status(201).json(dispatchOrder(req.body)); }
  catch (error) { res.status(error.message === 'Order not found' ? 404 : 400).json({ error: error.message }); }
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && error.body) return res.status(400).json({ error: 'Request body must be valid JSON' });
  next(error);
});

app.listen(port, () => console.log(`Mini WMS API listening on http://localhost:${port}`));

module.exports = app;

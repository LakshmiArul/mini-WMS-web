const { readData, updateData } = require('./store');

const PAPER_KG_PER_PIECE = 2.5;
const ADHESIVE_RATIO = 0.05;

function number(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  return parsed;
}

function normalizeWeight(quantity, unit) {
  const normalizedUnit = String(unit || '').toUpperCase();
  const amount = number(quantity, 'quantity');
  if (normalizedUnit === 'KG') return amount;
  if (normalizedUnit === 'TONS' || normalizedUnit === 'TON') return amount * 1000;
  if (normalizedUnit === 'PIECES' || normalizedUnit === 'PIECE') return amount * PAPER_KG_PER_PIECE;
  throw new Error('unit must be one of Pieces, KG, Tons');
}

function totalPaperKg(data) {
  return data.paperStock.reduce((total, lot) => total + lot.quantityKg, 0);
}

function inventorySummary() {
  const data = readData();
  return {
    paperStockKg: totalPaperKg(data),
    adhesiveStockKg: data.adhesiveKg,
    paperLots: data.paperStock,
    adhesiveUnit: 'KG'
  };
}

function addInward(body) {
  const type = String(body.type || '').toUpperCase();
  if (type === 'PAPER') {
    const quantityKg = normalizeWeight(body.quantity, body.unit);
    if (!body.mill || !body.gsm || !body.widthMm) {
      throw new Error('Paper inward requires mill, gsm, and widthMm');
    }
    const lot = {
      id: `P-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      mill: String(body.mill),
      gsm: number(body.gsm, 'gsm'),
      widthMm: number(body.widthMm, 'widthMm'),
      quantityKg,
      receivedAt: new Date().toISOString()
    };
    updateData((data) => data.paperStock.push(lot));
    return { type: 'PAPER', lot, inventory: inventorySummary() };
  }

  if (type === 'ADHESIVE') {
    const quantityKg = number(body.quantity, 'quantity');
    if (String(body.unit || 'KG').toUpperCase() !== 'KG') {
      throw new Error('Adhesive quantity must be provided in KG');
    }
    updateData((data) => { data.adhesiveKg += quantityKg; });
    return { type: 'ADHESIVE', quantityKg, inventory: inventorySummary() };
  }

  throw new Error('type must be PAPER or ADHESIVE');
}

function createOrder(body) {
  if (!body.customerName || !body.source) throw new Error('customerName and source are required');
  if (!body.dimensions || body.dimensions.idMm == null || body.dimensions.odMm == null || body.dimensions.thicknessMm == null) {
    throw new Error('dimensions must include idMm, odMm, and thicknessMm');
  }
  const quantity = number(body.quantity, 'quantity');
  const unit = String(body.unit || '').toUpperCase();
  if (!['PIECES', 'PIECE', 'KG', 'TONS', 'TON'].includes(unit)) throw new Error('unit must be one of Pieces, KG, Tons');

  let order;
  updateData((data) => {
    order = {
      id: data.nextOrderId++,
      customerName: String(body.customerName),
      source: String(body.source),
      dimensions: {
        idMm: number(body.dimensions.idMm, 'idMm'),
        odMm: number(body.dimensions.odMm, 'odMm'),
        thicknessMm: number(body.dimensions.thicknessMm, 'thicknessMm')
      },
      quantity,
      unit,
      orderWeightKg: normalizeWeight(quantity, unit),
      status: 'CREATED',
      createdAt: new Date().toISOString()
    };
    data.orders.push(order);
  });
  return order;
}

function getOrder(orderId) {
  const data = readData();
  return data.orders.find((order) => order.id === Number(orderId));
}

function checkFeasibility(orderId) {
  const order = getOrder(orderId);
  if (!order) throw new Error('Order not found');
  const data = readData();
  const requiredPaperKg = order.orderWeightKg;
  const requiredAdhesiveKg = requiredPaperKg * ADHESIVE_RATIO;
  const availablePaperKg = totalPaperKg(data);
  const availableAdhesiveKg = data.adhesiveKg;
  const paperAvailable = availablePaperKg >= requiredPaperKg;
  const adhesiveAvailable = availableAdhesiveKg >= requiredAdhesiveKg;
  const reasons = [];
  if (!paperAvailable) reasons.push('Insufficient paper stock');
  if (!adhesiveAvailable) reasons.push('Insufficient adhesive stock');

  return {
    orderId: order.id,
    isFeasible: paperAvailable && adhesiveAvailable,
    reason: reasons.length ? reasons.join('; ') : 'Sufficient paper and adhesive stock',
    required: { paperKg: requiredPaperKg, adhesiveKg: requiredAdhesiveKg },
    available: { paperKg: availablePaperKg, adhesiveKg: availableAdhesiveKg }
  };
}

function deductPaper(data, amountKg) {
  let remaining = amountKg;
  for (const lot of data.paperStock) {
    const deduction = Math.min(lot.quantityKg, remaining);
    lot.quantityKg -= deduction;
    remaining -= deduction;
    if (remaining <= 0) break;
  }
  data.paperStock = data.paperStock.filter((lot) => lot.quantityKg > 0);
}

function dispatchOrder(body) {
  const order = getOrder(body.orderId);
  if (!order) throw new Error('Order not found');
  if (order.status === 'DISPATCHED') throw new Error('Order has already been dispatched');
  const lorryCapacityTons = number(body.lorryCapacityTons, 'lorryCapacityTons');
  const orderWeightTons = order.orderWeightKg / 1000;
  if (orderWeightTons > lorryCapacityTons) {
    throw new Error(`Dispatch blocked: Order weight (${orderWeightTons} Tons) exceeds lorry capacity (${lorryCapacityTons} Tons)`);
  }
  const feasibility = checkFeasibility(order.id);
  if (!feasibility.isFeasible) throw new Error(`Dispatch blocked: ${feasibility.reason}`);
  const adhesiveKg = feasibility.required.adhesiveKg;

  let dispatchedOrder;
  updateData((data) => {
    const storedOrder = data.orders.find((candidate) => candidate.id === order.id);
    deductPaper(data, order.orderWeightKg);
    data.adhesiveKg -= adhesiveKg;
    storedOrder.status = 'DISPATCHED';
    storedOrder.dispatchedAt = new Date().toISOString();
    storedOrder.dispatch = {
      lorryNo: String(body.lorryNo || ''),
      lorryCapacityTons,
      location: String(body.location || ''),
      orderWeightTons
    };
    dispatchedOrder = storedOrder;
  });
  return { order: dispatchedOrder, deducted: { paperKg: order.orderWeightKg, adhesiveKg }, inventory: inventorySummary() };
}

module.exports = { inventorySummary, addInward, createOrder, checkFeasibility, dispatchOrder };

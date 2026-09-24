import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  Boxes,
  Check,
  ChevronRight,
  ClipboardList,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  Truck,
  X,
} from 'lucide-react';

const tabs = [
  { id: 'stock', label: 'Stock control', eyebrow: '01', icon: Boxes },
  { id: 'orders', label: 'Orders & feasibility', eyebrow: '02', icon: ClipboardList },
  { id: 'dispatch', label: 'Dispatch', eyebrow: '03', icon: Truck },
];

const emptyPaper = { mill: '', gsm: '', widthMm: '', quantity: '', unit: 'KG' };
const emptyAdhesive = { quantity: '' };
const emptyOrder = {
  customerName: '', source: 'Direct', idMm: '', odMm: '', thicknessMm: '', quantity: '', unit: 'PIECES',
};
const emptyDispatch = { orderId: '', lorryNo: '', lorryCapacityTons: '', location: '' };
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://mini-wms-server-ih58.onrender.com' : '');

async function request(url, options = {}) {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Something went wrong. Please try again.');
  return payload;
}

function formatNumber(value, fractionDigits = 2) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: fractionDigits }).format(Number(value || 0));
}

function errorShortfall(feasibility) {
  const paperShort = Math.max(0, feasibility.required.paperKg - feasibility.available.paperKg);
  const adhesiveShort = Math.max(0, feasibility.required.adhesiveKg - feasibility.available.adhesiveKg);
  if (paperShort > 0) return `Insufficient raw material: short ${formatNumber(paperShort)} KG of paper.`;
  if (adhesiveShort > 0) return `Insufficient raw material: short ${formatNumber(adhesiveShort)} KG of adhesive.`;
  return feasibility.reason;
}

function App() {
  const [activeTab, setActiveTab] = useState('stock');
  const [stock, setStock] = useState({ paperStockKg: 0, adhesiveStockKg: 0, paperLots: [] });
  const [orders, setOrders] = useState([]);
  const [paperForm, setPaperForm] = useState(emptyPaper);
  const [adhesiveForm, setAdhesiveForm] = useState(emptyAdhesive);
  const [orderForm, setOrderForm] = useState(emptyOrder);
  const [dispatchForm, setDispatchForm] = useState(emptyDispatch);
  const [feasibility, setFeasibility] = useState(null);
  const [notice, setNotice] = useState(null);
  const [dispatchError, setDispatchError] = useState('');
  const [busy, setBusy] = useState('');

  const refreshStock = async () => {
    const data = await request('/api/stock');
    setStock(data);
  };

  useEffect(() => {
    refreshStock().catch((error) => setNotice({ type: 'error', text: error.message }));
  }, []);

  const convertedOrderKg = useMemo(() => {
    const quantity = Number(orderForm.quantity || 0);
    if (orderForm.unit === 'TONS') return quantity * 1000;
    if (orderForm.unit === 'PIECES') return quantity * 2.5;
    return quantity;
  }, [orderForm.quantity, orderForm.unit]);

  const pendingOrders = orders.filter((order) => order.status !== 'DISPATCHED');

  const runAction = async (key, action, successText) => {
    setBusy(key);
    setNotice(null);
    try {
      const completed = await action();
      if (successText && completed !== false) setNotice({ type: 'success', text: successText });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setBusy('');
    }
  };

  const submitPaper = (event) => {
    event.preventDefault();
    runAction('paper', async () => {
      await request('/api/stock/inward', { method: 'POST', body: JSON.stringify({ type: 'PAPER', ...paperForm }) });
      await refreshStock();
      setPaperForm(emptyPaper);
    }, 'Paper stock received and inventory updated.');
  };

  const submitAdhesive = (event) => {
    event.preventDefault();
    runAction('adhesive', async () => {
      await request('/api/stock/inward', { method: 'POST', body: JSON.stringify({ type: 'ADHESIVE', quantity: Number(adhesiveForm.quantity), unit: 'KG' }) });
      await refreshStock();
      setAdhesiveForm(emptyAdhesive);
    }, 'Adhesive stock received and inventory updated.');
  };

  const submitOrder = (event) => {
    event.preventDefault();
    runAction('order', async () => {
      const created = await request('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerName: orderForm.customerName,
          source: orderForm.source,
          dimensions: { idMm: Number(orderForm.idMm), odMm: Number(orderForm.odMm), thicknessMm: Number(orderForm.thicknessMm) },
          quantity: Number(orderForm.quantity),
          unit: orderForm.unit,
        }),
      });
      setOrders((current) => [created, ...current]);
      setOrderForm(emptyOrder);
      setFeasibility(null);
    }, 'Order created and added to the queue.');
  };

  const checkOrder = async (orderId) => {
    setBusy(`check-${orderId}`);
    setNotice(null);
    try {
      setFeasibility(await request(`/api/orders/${orderId}/check-feasibility`, { method: 'POST' }));
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setBusy('');
    }
  };

  const submitDispatch = (event) => {
    event.preventDefault();
    runAction('dispatch', async () => {
      try {
        const result = await request('/api/dispatch', { method: 'POST', body: JSON.stringify({ ...dispatchForm, orderId: Number(dispatchForm.orderId), lorryCapacityTons: Number(dispatchForm.lorryCapacityTons) }) });
        setOrders((current) => current.map((order) => order.id === result.order.id ? result.order : order));
        await refreshStock();
        setDispatchForm(emptyDispatch);
      } catch (error) {
        if (error.message.startsWith('Dispatch blocked:')) {
          setDispatchError(error.message.replace('Dispatch blocked: ', ''));
          return false;
        } else {
          throw error;
        }
      }
    }, 'Order dispatched and inventory deducted.');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><span>CL</span></div>
        <div className="brand-copy"><strong>Coreline</strong><span>Warehouse OS</span></div>
        <div className="sidebar-rule" />
        <p className="side-label">Workspace</p>
        <nav className="side-nav" aria-label="Primary navigation">
          {tabs.map(({ id, label, eyebrow, icon: Icon }) => (
            <button key={id} className={`side-nav-item ${activeTab === id ? 'is-active' : ''}`} onClick={() => setActiveTab(id)}>
              <span className="nav-index">{eyebrow}</span><Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              {activeTab === id && <ChevronRight className="nav-arrow" size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer"><span className="status-dot" />API connected<div>v1.0 · Internal</div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div><p className="breadcrumb">Operations <span>/</span> {tabs.find((tab) => tab.id === activeTab)?.label}</p><h1>{activeTab === 'stock' ? 'Inventory intake' : activeTab === 'orders' ? 'Order desk' : 'Outbound dispatch'}</h1></div><div className="topbar-meta"><span className="live-dot" />Live inventory <button className="icon-button" title="Refresh stock" onClick={() => refreshStock()}><RefreshCw size={16} /></button></div></header>

        {notice && <div className={`notice ${notice.type}`}><span>{notice.type === 'success' ? <Check size={17} /> : <AlertTriangle size={17} />}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss notification"><X size={15} /></button></div>}

        <section className="content-wrap">
          {activeTab === 'stock' && <StockTab stock={stock} paperForm={paperForm} setPaperForm={setPaperForm} adhesiveForm={adhesiveForm} setAdhesiveForm={setAdhesiveForm} submitPaper={submitPaper} submitAdhesive={submitAdhesive} busy={busy} />}
          {activeTab === 'orders' && <OrdersTab orders={orders} orderForm={orderForm} setOrderForm={setOrderForm} submitOrder={submitOrder} busy={busy} convertedOrderKg={convertedOrderKg} feasibility={feasibility} checkOrder={checkOrder} />}
          {activeTab === 'dispatch' && <DispatchTab orders={pendingOrders} dispatchForm={dispatchForm} setDispatchForm={setDispatchForm} submitDispatch={submitDispatch} busy={busy} />}
        </section>
      </main>

      {dispatchError && <div className="modal-backdrop" role="presentation"><div className="error-modal" role="alertdialog" aria-modal="true"><div className="modal-icon"><AlertTriangle size={24} /></div><p className="eyebrow red">Dispatch blocked</p><h2>{dispatchError.includes('exceeds lorry capacity') ? 'Truck capacity is too low' : 'Raw material is insufficient'}</h2><p>{dispatchError}</p><button className="button dark full" onClick={() => setDispatchError('')}>Review dispatch details <ChevronRight size={16} /></button></div></div>}
    </div>
  );
}

function Field({ label, hint, children, className = '' }) {
  return <label className={`field ${className}`}><span className="field-label">{label}{hint && <small>{hint}</small>}</span>{children}</label>;
}

function StockTab({ stock, paperForm, setPaperForm, adhesiveForm, setAdhesiveForm, submitPaper, submitAdhesive, busy }) {
  return <>
    <div className="page-intro"><div><p className="eyebrow">Receiving bay</p><h2>Bring raw materials into stock</h2><p className="muted">Record new paper and adhesive lots. Every paper quantity is normalized to kilograms automatically.</p></div></div>
    <div className="metric-grid"><Metric label="Paper stock" value={formatNumber(stock.paperStockKg)} unit="KG" accent="green" icon={Boxes} /><Metric label="Paper stock" value={formatNumber(stock.paperStockKg / 1000)} unit="TONS" accent="blue" icon={PackageCheck} /><Metric label="Adhesive stock" value={formatNumber(stock.adhesiveStockKg)} unit="KG" accent="amber" icon={ArrowDownToLine} /></div>
    <div className="two-column">
      <form className="panel form-panel" onSubmit={submitPaper}><PanelHeading eyebrow="Paper material" title="New paper lot" detail="Mill specification and received quantity" icon={Boxes} /><div className="form-grid"><Field label="Mill"><input required value={paperForm.mill} onChange={(e) => setPaperForm({ ...paperForm, mill: e.target.value })} placeholder="e.g. ABC Mill" /></Field><Field label="GSM" hint="grams / m²"><input required type="number" min="0" step="any" value={paperForm.gsm} onChange={(e) => setPaperForm({ ...paperForm, gsm: e.target.value })} placeholder="180" /></Field><Field label="Width" hint="mm"><input required type="number" min="0" step="any" value={paperForm.widthMm} onChange={(e) => setPaperForm({ ...paperForm, widthMm: e.target.value })} placeholder="1200" /></Field><Field label="Quantity"><input required type="number" min="0" step="any" value={paperForm.quantity} onChange={(e) => setPaperForm({ ...paperForm, quantity: e.target.value })} placeholder="0" /></Field><Field label="Unit"><select value={paperForm.unit} onChange={(e) => setPaperForm({ ...paperForm, unit: e.target.value })}><option value="KG">Kilograms (KG)</option><option value="TONS">Tons</option></select></Field></div><button className="button primary" disabled={busy === 'paper'}>{busy === 'paper' ? <LoaderCircle className="spin" size={16} /> : <ArrowDownToLine size={16} />}Add paper lot</button></form>
      <form className="panel form-panel adhesive-panel" onSubmit={submitAdhesive}><PanelHeading eyebrow="Adhesive material" title="New adhesive receipt" detail="Adhesive is tracked in kilograms only" icon={ArrowDownToLine} /><Field label="Quantity" hint="KG"><input required type="number" min="0" step="any" value={adhesiveForm.quantity} onChange={(e) => setAdhesiveForm({ quantity: e.target.value })} placeholder="0" /></Field><div className="unit-note"><span>KG</span><div><strong>Standard unit</strong><p>Adhesive will be added directly to the KG balance.</p></div></div><button className="button primary" disabled={busy === 'adhesive'}>{busy === 'adhesive' ? <LoaderCircle className="spin" size={16} /> : <ArrowDownToLine size={16} />}Add adhesive</button></form>
    </div>
    <div className="panel table-panel"><PanelHeading eyebrow="Ledger" title="Paper lots" detail={`${stock.paperLots?.length || 0} active lots`} icon={ClipboardList} />{stock.paperLots?.length ? <div className="table-wrap"><table><thead><tr><th>Mill</th><th>GSM</th><th>Width</th><th>Received</th><th className="align-right">Balance</th></tr></thead><tbody>{stock.paperLots.map((lot) => <tr key={lot.id}><td><strong>{lot.mill}</strong><small>{lot.id}</small></td><td>{lot.gsm}</td><td>{formatNumber(lot.widthMm, 0)} mm</td><td>{new Date(lot.receivedAt).toLocaleDateString()}</td><td className="align-right"><strong>{formatNumber(lot.quantityKg)} KG</strong></td></tr>)}</tbody></table></div> : <EmptyState text="No paper lots recorded yet" />}</div>
  </>;
}

function OrdersTab({ orders, orderForm, setOrderForm, submitOrder, busy, convertedOrderKg, feasibility, checkOrder }) {
  return <>
    <div className="page-intro"><div><p className="eyebrow">Commercial desk</p><h2>Translate demand into production weight</h2><p className="muted">Create customer orders and validate raw material availability before scheduling dispatch.</p></div><div className="formula-chip"><span>1 piece</span><strong>=</strong><span>2.5 KG</span></div></div>
    <div className="two-column order-layout"><form className="panel form-panel" onSubmit={submitOrder}><PanelHeading eyebrow="Order intake" title="New customer order" detail="Dimensions are recorded in millimetres" icon={ClipboardList} /><div className="form-grid"><Field label="Customer"><input required value={orderForm.customerName} onChange={(e) => setOrderForm({ ...orderForm, customerName: e.target.value })} placeholder="Customer name" /></Field><Field label="Source"><select value={orderForm.source} onChange={(e) => setOrderForm({ ...orderForm, source: e.target.value })}><option>Direct</option><option>Distributor</option><option>Export</option><option>Repeat order</option></select></Field><Field label="ID" hint="mm"><input required type="number" min="0" step="any" value={orderForm.idMm} onChange={(e) => setOrderForm({ ...orderForm, idMm: e.target.value })} placeholder="76" /></Field><Field label="OD" hint="mm"><input required type="number" min="0" step="any" value={orderForm.odMm} onChange={(e) => setOrderForm({ ...orderForm, odMm: e.target.value })} placeholder="152" /></Field><Field label="Thickness" hint="mm"><input required type="number" min="0" step="any" value={orderForm.thicknessMm} onChange={(e) => setOrderForm({ ...orderForm, thicknessMm: e.target.value })} placeholder="10" /></Field><Field label="Quantity"><input required type="number" min="0" step="any" value={orderForm.quantity} onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })} placeholder="100" /></Field><Field label="Unit"><select value={orderForm.unit} onChange={(e) => setOrderForm({ ...orderForm, unit: e.target.value })}><option value="PIECES">Pieces</option><option value="KG">KG</option><option value="TONS">Tons</option></select></Field></div><div className="conversion-card"><div><span className="eyebrow">Live conversion</span><strong>{formatNumber(orderForm.quantity || 0)} {orderForm.unit.toLowerCase()}</strong></div><ChevronRight size={18} /><div><span className="eyebrow">Estimated paper weight</span><strong className="teal-text">{formatNumber(convertedOrderKg)} KG</strong></div></div><button className="button primary" disabled={busy === 'order'}>{busy === 'order' ? <LoaderCircle className="spin" size={16} /> : <ClipboardList size={16} />}Create order</button></form><div className="panel feasibility-panel"><PanelHeading eyebrow="Material check" title="Feasibility result" detail="Select an order below to inspect stock coverage" icon={PackageCheck} />{feasibility ? <div className={`feasibility-result ${feasibility.isFeasible ? 'good' : 'bad'}`}><div className="result-icon">{feasibility.isFeasible ? <Check size={22} /> : <AlertTriangle size={22} />}</div><div><strong>{feasibility.isFeasible ? 'Feasible to produce' : 'Insufficient raw material'}</strong><p>{feasibility.isFeasible ? feasibility.reason : errorShortfall(feasibility)}</p></div><div className="result-stats"><span>Paper needed <b>{formatNumber(feasibility.required.paperKg)} KG</b></span><span>Paper available <b>{formatNumber(feasibility.available.paperKg)} KG</b></span><span>Adhesive needed <b>{formatNumber(feasibility.required.adhesiveKg)} KG</b></span></div></div> : <EmptyState text="Run a check from the order queue" />}</div></div>
    <div className="panel table-panel"><PanelHeading eyebrow="Queue" title="Created orders" detail={`${orders.length} orders in this session`} icon={ClipboardList} />{orders.length ? <div className="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Specification</th><th>Weight</th><th>Status</th><th className="align-right">Action</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong className="order-id">#{String(order.id).padStart(4, '0')}</strong><small>{order.source}</small></td><td>{order.customerName}</td><td>{order.dimensions.idMm} / {order.dimensions.odMm} / {order.dimensions.thicknessMm} mm</td><td><strong>{formatNumber(order.orderWeightKg)} KG</strong><small>{formatNumber(order.orderWeightKg / 1000)} Tons</small></td><td><span className={`status-pill ${order.status === 'DISPATCHED' ? 'dispatched' : 'pending'}`}><span />{order.status === 'DISPATCHED' ? 'Dispatched' : 'Pending'}</span></td><td className="align-right"><button className="table-action" onClick={() => checkOrder(order.id)} disabled={busy === `check-${order.id}`}>{busy === `check-${order.id}` ? <LoaderCircle className="spin" size={15} /> : <PackageCheck size={15} />}Check</button></td></tr>)}</tbody></table></div> : <EmptyState text="Create an order to populate the queue" />}</div>
  </>;
}

function DispatchTab({ orders, dispatchForm, setDispatchForm, submitDispatch, busy }) {
  const selectedOrder = orders.find((order) => order.id === Number(dispatchForm.orderId));
  return <><div className="page-intro"><div><p className="eyebrow">Outbound bay</p><h2>Move finished orders safely</h2><p className="muted">Dispatch is always full-order. Confirm truck capacity before handing over the load.</p></div></div><div className="dispatch-layout"><form className="panel form-panel dispatch-form" onSubmit={submitDispatch}><PanelHeading eyebrow="Dispatch manifest" title="Prepare a load" detail="Only pending orders can be dispatched" icon={Truck} /><Field label="Pending order"><select required value={dispatchForm.orderId} onChange={(e) => setDispatchForm({ ...dispatchForm, orderId: e.target.value })}><option value="">Choose an order...</option>{orders.map((order) => <option key={order.id} value={order.id}>#{String(order.id).padStart(4, '0')} · {order.customerName} · {formatNumber(order.orderWeightKg / 1000)} Tons</option>)}</select></Field><div className="form-grid"><Field label="Lorry number"><input required value={dispatchForm.lorryNo} onChange={(e) => setDispatchForm({ ...dispatchForm, lorryNo: e.target.value })} placeholder="TN01AB1234" /></Field><Field label="Capacity" hint="Tons"><input required type="number" min="0" step="any" value={dispatchForm.lorryCapacityTons} onChange={(e) => setDispatchForm({ ...dispatchForm, lorryCapacityTons: e.target.value })} placeholder="10" /></Field></div><Field label="Destination"><input required value={dispatchForm.location} onChange={(e) => setDispatchForm({ ...dispatchForm, location: e.target.value })} placeholder="City or delivery location" /></Field><button className="button primary" disabled={busy === 'dispatch' || !orders.length}>{busy === 'dispatch' ? <LoaderCircle className="spin" size={16} /> : <Truck size={16} />}Dispatch full order</button></form><div className="manifest-preview panel">{selectedOrder ? <><div className="preview-top"><span className="eyebrow">Selected load</span><span className="status-pill pending"><span />Pending</span></div><h3>#{String(selectedOrder.id).padStart(4, '0')} · {selectedOrder.customerName}</h3><p>{selectedOrder.source} order · {selectedOrder.dimensions.idMm} / {selectedOrder.dimensions.odMm} / {selectedOrder.dimensions.thicknessMm} mm core</p><div className="load-weight"><span>Full order weight</span><strong>{formatNumber(selectedOrder.orderWeightKg / 1000)} <small>TONS</small></strong></div><div className="dispatch-rule"><Check size={15} /> Paper and adhesive stock will be deducted on dispatch</div></> : <EmptyState text={orders.length ? 'Select a pending order to preview the manifest' : 'No pending orders available'} />}</div></div></>;
}

function Metric({ label, value, unit, accent, icon: Icon }) { return <div className={`metric-card ${accent}`}><div className="metric-icon"><Icon size={18} /></div><div><span>{label}</span><strong>{value} <small>{unit}</small></strong></div></div>; }
function PanelHeading({ eyebrow, title, detail, icon: Icon }) { return <div className="panel-heading"><div className="panel-icon"><Icon size={18} /></div><div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3><p>{detail}</p></div></div>; }
function EmptyState({ text }) { return <div className="empty-state"><span>—</span><p>{text}</p></div>; }

export default App;

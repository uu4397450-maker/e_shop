"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const formatCurrency = (value) => Number(value || 0).toFixed(2);
const formatPhone = (phone) => phone || "N/A";

export default function CustomerPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [debtFilter, setDebtFilter] = useState("all");

  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerDetail, setCustomerDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const [showPayDebtModal, setShowPayDebtModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);

  const [showSellModal, setShowSellModal] = useState(false);
  const [sellProducts, setSellProducts] = useState([]);
  const [sellCart, setSellCart] = useState([]);
  const [sellSearch, setSellSearch] = useState("");
  const [sellPaymentAmount, setSellPaymentAmount] = useState("");
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  const checkAuthentication = () => {
    if (typeof window === "undefined") return false;

    const token = localStorage.getItem("authToken");
    const user = localStorage.getItem("user");

    if (!token || !user) return false;

    try {
      return !!JSON.parse(user)?.id;
    } catch {
      return false;
    }
  };

  const getShopName = async () => {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data?.user?.shop_name) return String(data.user.shop_name);
      }
    } catch {
      // ignore
    }

    try {
      const raw = localStorage.getItem("user");
      if (!raw) return "";
      const user = JSON.parse(raw);
      return user?.shop_name ? String(user.shop_name) : "";
    } catch {
      return "";
    }
  };

  async function fetchCustomers() {
    setLoading(true);
    try {
      const res = await fetch("/api/customers", { credentials: "include" });
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching customers:", error);
      alert("Failed to fetch customers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!checkAuthentication()) {
      router.push("/");
      return;
    }

    fetchCustomers();
  }, []);

  async function fetchCustomerDetail(id) {
    setSelectedCustomerId(id);
    setCustomerDetail(null);
    setDetailLoading(true);
    setShowDetailModal(true);

    try {
      const res = await fetch(`/api/customers/${id}`, { credentials: "include" });
      const data = await res.json();

      if (!res.ok) {
        alert(data?.message || "Failed to fetch customer details");
        setShowDetailModal(false);
        return;
      }

      setCustomerDetail(data);
    } catch (error) {
      console.error("Error fetching customer detail:", error);
      alert("Failed to fetch customer details");
      setShowDetailModal(false);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handlePayDebt() {
    if (!customerDetail) return;

    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      alert("Please enter a valid payment amount");
      return;
    }

    const totalDebt = (customerDetail.orders || []).reduce(
      (sum, order) => sum + Number(order.debt_amount || 0),
      0
    );

    if (amount > totalDebt) {
      alert(`Payment amount exceeds total debt of ₹${formatCurrency(totalDebt)}`);
      return;
    }

    setPaymentLoading(true);

    try {
      const res = await fetch("/api/customers/pay-debt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customerDetail.customer.id,
          paymentAmount: amount,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data?.message || "Failed to process payment");
        return;
      }

      alert(`Payment of ₹${formatCurrency(amount)} recorded successfully.`);
      setPaymentAmount("");
      setShowPayDebtModal(false);
      setShowDetailModal(false);
      fetchCustomers();
    } catch (error) {
      console.error("Error processing payment:", error);
      alert("Failed to process payment");
    } finally {
      setPaymentLoading(false);
    }
  }

  async function fetchProductsForSell() {
    try {
      const res = await fetch("/api/product");
      const data = await res.json();
      setSellProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching products:", error);
      alert("Failed to fetch products");
    }
  }

  function openSellModal() {
    setShowSellModal(true);
    setSellCart([]);
    setSellSearch("");
    setSellPaymentAmount("");
    fetchProductsForSell();
  }

  function addToSellCart(product) {
    if (sellCart.some((item) => item.id === product.id)) {
      alert("Already in cart. Increase quantity instead.");
      return;
    }

    setSellCart([...sellCart, { ...product, quantity: 1 }]);
  }

  function updateSellQuantity(id, change) {
    setSellCart((current) =>
      current.map((item) => {
        if (item.id !== id) return item;

        const nextQty = item.quantity + change;
        if (nextQty < 1) return item;
        if (nextQty > Number(item.stock || 0)) {
          alert("Reached stock limit.");
          return item;
        }

        return { ...item, quantity: nextQty };
      })
    );
  }

  function removeFromSellCart(id) {
    setSellCart((current) => current.filter((item) => item.id !== id));
  }

  async function handleSellToCustomer() {
    if (!customerDetail || sellCart.length === 0) {
      alert("Please add at least one product to the cart.");
      return;
    }

    const saleTotal = sellCart.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );
    const payment = Number(sellPaymentAmount || 0);
    const existingDebt = (customerDetail.orders || []).reduce(
      (sum, order) => sum + Number(order.debt_amount || 0),
      0
    );

    try {
      let debtPaid = 0;
      let salePaid = payment;

      if (payment > 0) {
        debtPaid = Math.min(existingDebt, payment);
        salePaid = payment - debtPaid;
      }

      if (payment > 0 && debtPaid > 0) {
        const debtRes = await fetch("/api/customers/pay-debt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: customerDetail.customer.id,
            paymentAmount: debtPaid,
          }),
        });

        if (!debtRes.ok) {
          alert("Failed to apply debt payment.");
          return;
        }
      }

      const orderRes = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: customerDetail.customer.phone,
          cart: sellCart,
          paidAmount: salePaid,
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        alert(orderData?.message || "Failed to create order");
        return;
      }

      for (const item of sellCart) {
        await fetch("/api/product", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            name: item.name,
            description: item.description,
            price: item.price,
            stock: Number(item.stock || 0) - Number(item.quantity || 0),
            status: item.status,
            barcode: item.barcode,
            image: item.image,
          }),
        });
      }

      const remainingDebt =
        Math.max(0, existingDebt - debtPaid) + Math.max(0, saleTotal - salePaid);

      setReceiptData({
        orderId: `CUST-${customerDetail.customer.id}-${Date.now()}`,
        date: new Date().toLocaleString(),
        customerName: `Customer #${customerDetail.customer.id}`,
        customerPhone: customerDetail.customer.phone,
        items: sellCart.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          total: Number(item.price || 0) * Number(item.quantity || 0),
        })),
        subtotal: saleTotal,
        payment: payment,
        debt: remainingDebt,
        total: saleTotal,
      });

      setShowSellModal(false);
      setShowReceipt(true);
      setSellCart([]);
      setSellPaymentAmount("");
      fetchCustomers();
    } catch (error) {
      console.error("Error creating order:", error);
      alert("Error creating order");
    }
  }

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    let nextCustomers = customers;

    if (query) {
      nextCustomers = nextCustomers.filter((customer) => {
        const customerId = String(customer.id || "");
        const phone = String(customer.phone || "");
        return customerId.includes(query) || phone.includes(query);
      });
    }

    if (debtFilter === "with-debt") {
      nextCustomers = nextCustomers.filter(
        (customer) => Number(customer.debt_amount || 0) > 0
      );
    }

    if (debtFilter === "no-debt") {
      nextCustomers = nextCustomers.filter(
        (customer) => Number(customer.debt_amount || 0) <= 0
      );
    }

    return nextCustomers;
  }, [customers, search, debtFilter]);

  const withDebtCount = customers.filter(
    (customer) => Number(customer.debt_amount || 0) > 0
  ).length;
  const noDebtCount = customers.filter(
    (customer) => Number(customer.debt_amount || 0) <= 0
  ).length;

  return (
    <>
      <div className="min-h-screen bg-[#0B1B34] px-4 py-6 text-white md:px-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-xl md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-blue-200/70">Directory</p>
                <h1 className="mt-1 text-2xl font-bold text-blue-400 md:text-3xl">Customers</h1>
              </div>

              <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#13294B] p-2">
                <input
                  type="text"
                  aria-label="Search customers"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by phone or customer ID"
                  className="w-full rounded-xl border border-white/10 bg-[#0B1B34] px-3 py-3 text-sm text-white outline-none ring-0 placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-xl md:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-blue-300 md:text-lg">Debt overview</h2>
              <span className="text-xs text-slate-300">{customers.length} total</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { key: "all", label: "All customers", count: customers.length, active: "from-cyan-500 to-blue-500" },
                { key: "with-debt", label: "With debt", count: withDebtCount, active: "from-rose-500 to-pink-500" },
                { key: "no-debt", label: "No debt", count: noDebtCount, active: "from-emerald-500 to-teal-500" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setDebtFilter(item.key)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    debtFilter === item.key
                      ? `border-transparent bg-gradient-to-r ${item.active} text-white shadow-lg`
                      : "border-white/10 bg-[#13294B] text-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className={`mt-1 text-xs ${debtFilter === item.key ? "text-white/80" : "text-slate-400"}`}>
                        {debtFilter === item.key ? "Selected" : "View list"}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${debtFilter === item.key ? "bg-white/20 text-white" : "bg-slate-800 text-slate-200"}`}>
                      {item.count}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-xl md:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-blue-300 md:text-lg">Customer list</h2>
              <span className="text-xs text-slate-300">{filteredCustomers.length} results</span>
            </div>

            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#13294B] p-4 text-sm text-slate-300">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                Loading customers...
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-[#13294B] p-6 text-center text-sm text-slate-300">
                No customers found.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCustomers.map((customer) => {
                  const debt = Number(customer.debt_amount || 0);
                  const isDebt = debt > 0;

                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => fetchCustomerDetail(customer.id)}
                      className={`w-full rounded-2xl border p-3 text-left transition md:p-4 ${
                        selectedCustomerId === customer.id
                          ? "border-cyan-400/50 bg-cyan-500/10"
                          : "border-white/10 bg-[#13294B] hover:bg-[#183765]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-white">Customer #{customer.id}</p>
                          <p className="mt-1 text-xs text-slate-300">{formatPhone(customer.phone)}</p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-slate-300">Orders: {customer.orders_count || 0}</p>
                          <p className={`mt-1 text-xs font-semibold ${isDebt ? "text-rose-400" : "text-emerald-400"}`}>
                            {isDebt ? `Debt ₹${formatCurrency(debt)}` : "No debt"}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {showDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 md:p-6">
          <div className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0B1B34] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 md:px-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">Customer</p>
                <h3 className="text-lg font-bold text-white">Details</h3>
              </div>

              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="rounded-full border border-white/10 bg-[#13294B] px-2 py-1 text-lg text-white"
              >
                ×
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto p-4 md:p-6">
              {detailLoading ? (
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#13294B] p-4 text-sm text-slate-300">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                  Loading customer details...
                </div>
              ) : !customerDetail ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-[#13294B] p-6 text-center text-sm text-slate-300">
                  No customer details available.
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-white/10 bg-[#13294B] p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm text-slate-300">Customer #{customerDetail.customer.id}</p>
                        <p className="mt-1 text-lg font-semibold text-white">{formatPhone(customerDetail.customer.phone)}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={openSellModal}
                          className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
                        >
                          Sell product
                        </button>
                        {((customerDetail.orders || []).reduce((sum, order) => sum + Number(order.debt_amount || 0), 0) > 0) && (
                          <button
                            type="button"
                            onClick={() => setShowPayDebtModal(true)}
                            className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
                          >
                            Pay debt
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-semibold text-white">Orders</h4>
                      <span className="text-xs text-slate-300">{(customerDetail.orders || []).length} entries</span>
                    </div>

                    {(customerDetail.orders || []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-[#13294B] p-6 text-center text-sm text-slate-300">
                        No orders for this customer yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(customerDetail.orders || []).map((order) => (
                          <div key={order.id} className="rounded-2xl border border-white/10 bg-[#13294B] p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="font-semibold text-white">Order #{order.id}</p>
                                <p className="text-xs text-slate-300">{order.created_at}</p>
                              </div>
                              <div className="text-left text-sm sm:text-right">
                                <p className="text-white">Total ₹{formatCurrency(order.total_amount)}</p>
                                <p className="text-slate-300">Paid ₹{formatCurrency(order.paid_amount)}</p>
                                <p className="text-amber-400">Debt ₹{formatCurrency(order.debt_amount)}</p>
                              </div>
                            </div>

                            <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                              {(order.items || []).length === 0 ? (
                                <p className="text-sm text-slate-300">No items listed.</p>
                              ) : (
                                (order.items || []).map((item) => (
                                  <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                                    <div className="min-w-0">
                                      <p className="truncate font-medium text-white">{item.item_name}</p>
                                      <p className="text-slate-300">₹{formatCurrency(item.item_price)} × {item.quantity}</p>
                                    </div>
                                    <span className="font-semibold text-cyan-400">₹{formatCurrency(item.total_price)}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showSellModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 md:p-6">
          <div className="w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0B1B34] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 md:px-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">Sale</p>
                <h3 className="text-lg font-bold text-white">Create customer sale</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSellModal(false)}
                className="rounded-full border border-white/10 bg-[#13294B] p-2 text-white"
              >
                ×
              </button>
            </div>

            <div className="grid gap-4 p-4 md:grid-cols-[1.2fr_0.8fr] md:p-6">
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-[#13294B] p-3">
                  <input
                    value={sellSearch}
                    onChange={(e) => setSellSearch(e.target.value)}
                    placeholder="Search products"
                    className="w-full rounded-xl border border-white/10 bg-[#0B1B34] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-400"
                  />
                </div>

                <div className="grid max-h-[420px] gap-3 overflow-y-auto sm:grid-cols-2">
                  {sellProducts.filter((product) => {
                    const q = sellSearch.trim().toLowerCase();
                    if (!q) return true;
                    return `${product.name || ""} ${product.barcode || ""}`.toLowerCase().includes(q);
                  }).map((product) => (
                    <div key={product.id} className="rounded-2xl border border-white/10 bg-[#13294B] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-white">{product.name}</p>
                          <p className="text-xs text-slate-300">Stock: {product.stock ?? 0}</p>
                        </div>
                        <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-400">
                          ₹{formatCurrency(product.price)}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-300">{product.barcode || "No barcode"}</span>
                        <button
                          type="button"
                          onClick={() => addToSellCart(product)}
                          className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-600"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#13294B] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-white">Cart</h4>
                  <span className="text-xs text-slate-300">{sellCart.length} items</span>
                </div>

                <div className="mt-4 space-y-3">
                  {sellCart.length === 0 ? (
                    <p className="text-sm text-slate-300">No products added yet.</p>
                  ) : (
                    sellCart.map((item) => (
                      <div key={item.id} className="rounded-xl border border-white/10 bg-[#0B1B34] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-white">{item.name}</p>
                            <p className="text-xs text-slate-300">₹{formatCurrency(item.price)} each</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFromSellCart(item.id)}
                            className="text-xs text-rose-400"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateSellQuantity(item.id, -1)}
                              className="h-7 w-7 rounded-full border border-white/10 bg-[#13294B] text-white"
                            >
                              −
                            </button>
                            <span className="min-w-7 text-center text-sm font-medium text-white">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateSellQuantity(item.id, 1)}
                              className="h-7 w-7 rounded-full border border-white/10 bg-[#13294B] text-white"
                            >
                              +
                            </button>
                          </div>
                          <span className="font-semibold text-cyan-400">₹{formatCurrency(item.price * item.quantity)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span>Subtotal</span>
                    <span>₹{formatCurrency(sellCart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0))}</span>
                  </div>

                  <label className="block text-xs font-medium text-slate-300">
                    Payment amount
                    <input
                      value={sellPaymentAmount}
                      onChange={(e) => setSellPaymentAmount(e.target.value)}
                      type="number"
                      min="0"
                      placeholder="0.00"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B1B34] px-3 py-2.5 text-sm text-white outline-none"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleSellToCustomer}
                  className="mt-5 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-3 font-semibold text-white shadow-lg shadow-cyan-500/20 hover:brightness-110"
                >
                  Confirm sale
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPayDebtModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 md:p-6">
          <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0B1B34] p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">Payment</p>
                <h3 className="text-xl font-bold text-white">Pay debt</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPayDebtModal(false)}
                className="rounded-full border border-white/10 bg-[#13294B] p-2 text-white"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-[#13294B] p-4">
                <p className="text-xs text-slate-300">Customer #{customerDetail?.customer?.id}</p>
                <p className="mt-1 font-semibold text-white">{formatPhone(customerDetail?.customer?.phone)}</p>
                <p className="mt-3 text-lg font-bold text-amber-400">
                  Total due ₹{formatCurrency((customerDetail?.orders || []).reduce((sum, order) => sum + Number(order.debt_amount || 0), 0))}
                </p>
              </div>

              <label className="block text-sm font-medium text-slate-300">
                Payment amount
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#13294B] px-3 py-3 text-white outline-none"
                  placeholder="Enter amount"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShowPayDebtModal(false)}
                  className="rounded-xl border border-white/10 bg-[#13294B] px-4 py-3 font-medium text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePayDebt}
                  disabled={paymentLoading}
                  className="rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {paymentLoading ? "Processing..." : "Pay"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showReceipt && receiptData && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 md:p-6">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-5 text-center">
              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Receipt</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">Customer sale</h3>
            </div>

            <div className="space-y-3 border-b border-slate-200 pb-4 text-sm">
              <div className="flex items-center justify-between"><span>Order</span><span className="font-semibold">{receiptData.orderId}</span></div>
              <div className="flex items-center justify-between"><span>Date</span><span className="font-semibold">{receiptData.date}</span></div>
              <div className="flex items-center justify-between"><span>Customer</span><span className="font-semibold">{receiptData.customerName}</span></div>
              <div className="flex items-center justify-between"><span>Phone</span><span className="font-semibold">{formatPhone(receiptData.customerPhone)}</span></div>
            </div>

            <div className="mt-4 space-y-2">
              {receiptData.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 text-sm">
                  <span>{item.name} × {item.quantity}</span>
                  <span>₹{formatCurrency(item.total)}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm">
              <div className="flex items-center justify-between"><span>Subtotal</span><span>₹{formatCurrency(receiptData.subtotal)}</span></div>
              <div className="flex items-center justify-between"><span>Payment</span><span>₹{formatCurrency(receiptData.payment)}</span></div>
              <div className="flex items-center justify-between"><span>Debt</span><span>₹{formatCurrency(receiptData.debt)}</span></div>
              <div className="flex items-center justify-between text-base font-bold"><span>Total</span><span>₹{formatCurrency(receiptData.total)}</span></div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowReceipt(false)}
                className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 font-medium text-slate-700"
              >
                Close
              </button>
              <button
                type="button"
                onClick={async () => {
                  const shopName = await getShopName();
                  const win = window.open("", "", "width=420,height=700");
                  win.document.write(`
                    <html>
                      <head><title>Receipt</title></head>
                      <body style="font-family: Arial, sans-serif; padding: 20px; color: #0f172a;">
                        <h2 style="text-align:center; margin: 0 0 10px;">${shopName || "Shop"}</h2>
                        <p style="text-align:center; margin: 0 0 18px;">Customer Sale Receipt</p>
                        <div style="display:flex; justify-content:space-between; margin:6px 0;"><span>Order</span><strong>${receiptData.orderId}</strong></div>
                        <div style="display:flex; justify-content:space-between; margin:6px 0;"><span>Date</span><strong>${receiptData.date}</strong></div>
                        <div style="display:flex; justify-content:space-between; margin:6px 0;"><span>Phone</span><strong>${formatPhone(receiptData.customerPhone)}</strong></div>
                        ${receiptData.items.map((item) => `<div style="display:flex; justify-content:space-between; margin:5px 0;"><span>${item.name} × ${item.quantity}</span><span>₹${formatCurrency(item.total)}</span></div>`).join("")}
                        <div style="border-top:1px solid #cbd5e1; margin-top:10px; padding-top:10px;">
                          <div style="display:flex; justify-content:space-between; margin:5px 0;"><span>Subtotal</span><span>₹${formatCurrency(receiptData.subtotal)}</span></div>
                          <div style="display:flex; justify-content:space-between; margin:5px 0;"><span>Payment</span><span>₹${formatCurrency(receiptData.payment)}</span></div>
                          <div style="display:flex; justify-content:space-between; margin:5px 0;"><span>Debt</span><span>₹${formatCurrency(receiptData.debt)}</span></div>
                          <div style="display:flex; justify-content:space-between; margin:8px 0 0; font-weight:700;"><span>Total</span><span>₹${formatCurrency(receiptData.total)}</span></div>
                        </div>
                      </body>
                    </html>
                  `);
                  win.document.close();
                  win.print();
                }}
                className="rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-white"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

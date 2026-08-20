"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const money = (value) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function SalePage() {

  const barcodeRef = useRef(null);

  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);

  const [search, setSearch] = useState("");
  const [barcode, setBarcode] = useState("");

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);

  const [phone, setPhone] = useState("");
  const [paidAmount, setPaidAmount] = useState("");

  const [showPayment, setShowPayment] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  const [receipt, setReceipt] = useState(null);

  const [loading, setLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(true);


  /*
   * ----------------------------------------
   * LOAD PRODUCTS
   * ----------------------------------------
   */

  useEffect(() => {
    loadProducts();
  }, []);


  async function loadProducts() {

    try {

      setProductsLoading(true);

      const res = await fetch("/api/product", {
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load products");
      }

      setProducts(Array.isArray(data) ? data : []);

    } catch (error) {

      console.error(error);

      alert(error.message);

    } finally {

      setProductsLoading(false);

    }
  }


  /*
   * ----------------------------------------
   * PRODUCT UNITS
   * ----------------------------------------
   */

  function getUnits(product) {

    if (!product) return [];

    const units = Array.isArray(product.product_units)
      ? product.product_units.filter(
          (unit) => unit.is_active !== false
        )
      : [];

    if (units.length > 0) {
      return units;
    }

    return [
      {
        id: null,
        unit_name: "Unit",
        unit_symbol: "unit",
        conversion_to_base: 1,
        selling_price:
          product.selling_price ??
          product.price ??
          0,
        is_base_unit: true,
      },
    ];
  }


  /*
   * ----------------------------------------
   * SEARCH
   * ----------------------------------------
   */

  const filteredProducts = useMemo(() => {

    const value = search.trim().toLowerCase();

    if (!value) {
      return products;
    }

    return products.filter((product) => {

      const productName =
        String(product.name || "").toLowerCase();

      const productBarcode =
        String(product.barcode || "").toLowerCase();

      const units = getUnits(product);

      const unitBarcode = units.some(
        (unit) =>
          String(unit.barcode || "")
            .toLowerCase()
            .includes(value)
      );

      return (
        productName.includes(value) ||
        productBarcode.includes(value) ||
        unitBarcode
      );

    });

  }, [products, search]);


  /*
   * ----------------------------------------
   * BARCODE
   * ----------------------------------------
   */

  function handleBarcode(e) {

    if (e.key !== "Enter") return;

    const code = barcode.trim();

    if (!code) return;

    let foundProduct = null;
    let foundUnit = null;

    for (const product of products) {

      if (String(product.barcode) === code) {
        foundProduct = product;

        const units = getUnits(product);

        foundUnit =
          units.find((unit) => unit.is_base_unit) ||
          units[0];

        break;
      }

      const units = getUnits(product);

      const unit = units.find(
        (u) => String(u.barcode || "") === code
      );

      if (unit) {
        foundProduct = product;
        foundUnit = unit;
        break;
      }
    }


    if (!foundProduct) {

      alert("Product / barcode not found");

      setBarcode("");

      return;
    }


    addToCart(foundProduct, foundUnit);

    setBarcode("");

    setTimeout(() => {
      barcodeRef.current?.focus();
    }, 50);
  }


  /*
   * ----------------------------------------
   * ADD TO CART
   * ----------------------------------------
   */

  function addToCart(product, unit) {

    if (!product || !unit) return;

    const conversion =
      Number(unit.conversion_to_base || 1);

    const price =
      Number(
        unit.selling_price ??
        product.selling_price ??
        product.price ??
        0
      );


    setCart((current) => {

      const existingIndex = current.findIndex(
        (item) =>
          item.product_id === product.id &&
          item.unit_id === unit.id
      );


      if (existingIndex >= 0) {

        return current.map((item, index) => {

          if (index !== existingIndex) {
            return item;
          }

          const newQuantity =
            Number(item.quantity) + 1;

          const requiredStock =
            newQuantity * conversion;

          if (
            requiredStock >
            Number(product.stock || 0)
          ) {

            alert("Not enough stock");

            return item;
          }

          return {
            ...item,
            quantity: newQuantity,
          };

        });

      }


      if (
        conversion >
        Number(product.stock || 0)
      ) {

        alert(
          `Not enough stock. Available: ${product.stock}`
        );

        return current;
      }


      return [
        ...current,
        {
          product_id: product.id,
          unit_id: unit.id,

          name: product.name,

          unit_name: unit.unit_name,
          unit_symbol: unit.unit_symbol,

          quantity: 1,

          price,

          conversion_to_base: conversion,

          stock: Number(product.stock || 0),

          image: product.image,
        },
      ];

    });

    setSelectedProduct(null);
    setSelectedUnit(null);
  }


  /*
   * ----------------------------------------
   * CHANGE QUANTITY
   * ----------------------------------------
   */

  function changeQuantity(index, amount) {

    setCart((current) => {

      return current.map((item, i) => {

        if (i !== index) {
          return item;
        }

        const newQuantity =
          Number(item.quantity) + amount;


        if (newQuantity <= 0) {
          return item;
        }


        const requiredStock =
          newQuantity *
          Number(item.conversion_to_base || 1);


        if (requiredStock > item.stock) {

          alert("Not enough stock");

          return item;
        }


        return {
          ...item,
          quantity: newQuantity,
        };

      });

    });

  }


  function removeItem(index) {

    setCart((current) =>
      current.filter((_, i) => i !== index)
    );

  }


  /*
   * ----------------------------------------
   * TOTAL
   * ----------------------------------------
   */

  const total = useMemo(() => {

    return cart.reduce(
      (sum, item) =>
        sum +
        Number(item.price || 0) *
        Number(item.quantity || 0),
      0
    );

  }, [cart]);


  const paid = Number(paidAmount || 0);

  const debt =
    paid < total
      ? total - paid
      : 0;

  const change =
    paid > total
      ? paid - total
      : 0;


  /*
   * ----------------------------------------
   * OPEN PAYMENT
   * ----------------------------------------
   */

  function openPayment() {

    if (cart.length === 0) {
      alert("Cart is empty");
      return;
    }

    setPaidAmount(total.toFixed(2));

    setShowPayment(true);

  }


  /*
   * ----------------------------------------
   * COMPLETE SALE
   * ----------------------------------------
   */

  async function completeSale() {

    if (cart.length === 0) {
      alert("Cart is empty");
      return;
    }

    const payment =
      Number(paidAmount || 0);


    if (payment < 0) {
      alert("Invalid payment");
      return;
    }


    try {

      setLoading(true);


      const res = await fetch("/api/order", {

        method: "POST",

        credentials: "include",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({

          phone:
            phone.trim() || null,

          paidAmount:
            payment,

          cart,

        }),

      });


      const data = await res.json();


      if (!res.ok || !data.success) {

        throw new Error(
          data?.error ||
          "Failed to complete sale"
        );

      }


      /*
       * RECEIPT
       */

      const receiptData = {

        orderId:
          data.orderId,

        date:
          new Date().toLocaleString(),

        customerPhone:
          phone || "Walk-in Customer",

        items:
          cart.map((item) => ({

            name: item.name,

            unit:
              item.unit_name,

            quantity:
              item.quantity,

            price:
              item.price,

            total:
              Number(item.price) *
              Number(item.quantity),

          })),

        total:
          Number(data.totalAmount || total),

        paid:
          Number(data.paidAmount || 0),

        debt:
          Number(data.debtAmount || 0),

        change:
          Number(data.changeAmount || 0),

      };


      setReceipt(receiptData);

      setCart([]);

      setPhone("");

      setPaidAmount("");

      setShowPayment(false);

      setShowReceipt(true);


      await loadProducts();


    } catch (error) {

      console.error(error);

      alert(
        error?.message ||
        "Sale failed"
      );

    } finally {

      setLoading(false);

    }

  }


  /*
   * ----------------------------------------
   * PRODUCT SELECTION
   * ----------------------------------------
   */

  function selectProduct(product) {

    const units = getUnits(product);

    setSelectedProduct(product);

    setSelectedUnit(
      units.find(
        (unit) => unit.is_base_unit
      ) || units[0]
    );

  }


  return (

    <main className="min-h-screen bg-[#071426] text-white">

      <div className="mx-auto max-w-7xl p-3 sm:p-5 lg:p-7">

        {/* HEADER */}

        <div className="mb-5">

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

            <div>

              <h1 className="text-2xl sm:text-3xl font-black">
                New Sale
              </h1>

              <p className="mt-1 text-sm text-white/50">
                Search, scan and create a sale
              </p>

            </div>


            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2">

              <div className="text-xs text-white/50">
                Cart
              </div>

              <div className="font-bold text-cyan-300">
                {cart.length} item
                {cart.length !== 1 ? "s" : ""}
              </div>

            </div>

          </div>

        </div>


        {/* SEARCH */}

        <section className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2">

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">

            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/40">
              Product Search
            </label>

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search product..."
              className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3.5 outline-none transition focus:border-cyan-400"
            />

          </div>


          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">

            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/40">
              Barcode
            </label>

            <input
              ref={barcodeRef}
              value={barcode}
              onChange={(e) =>
                setBarcode(e.target.value)
              }
              onKeyDown={handleBarcode}
              placeholder="Scan barcode and press Enter"
              className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3.5 outline-none transition focus:border-blue-400"
            />

          </div>

        </section>


        {/* MAIN */}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_1fr]">


          {/* PRODUCTS */}

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">

            <div className="mb-4 flex items-center justify-between">

              <h2 className="font-bold">
                Products
              </h2>

              <span className="text-xs text-white/40">
                {filteredProducts.length}
              </span>

            </div>


            {productsLoading ? (

              <div className="py-10 text-center text-white/40">
                Loading products...
              </div>

            ) : filteredProducts.length === 0 ? (

              <div className="rounded-2xl bg-white/[0.03] p-8 text-center text-white/40">
                No products found
              </div>

            ) : (

              <div className="grid max-h-[62vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-2">

                {filteredProducts.map((product) => {

                  const units =
                    getUnits(product);

                  const baseUnit =
                    units.find(
                      (unit) =>
                        unit.is_base_unit
                    ) || units[0];


                  return (

                    <button
                      key={product.id}
                      onClick={() => {
                        const unit = baseUnit || getUnits(product)[0];
                        if (unit) addToCart(product, unit);
                        else selectProduct(product);
                      }}
                      className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] text-left transition hover:border-cyan-400/40 hover:bg-white/[0.09]"
                    >

                      {product.image ? (

                        <img
                          src={product.image}
                          alt={product.name}
                          className="h-28 w-full object-cover"
                        />

                      ) : (

                        <div className="flex h-28 items-center justify-center bg-white/5 text-3xl">
                          📦
                        </div>

                      )}


                      <div className="p-3">

                        <div className="truncate font-bold">
                          {product.name}
                        </div>

                        <div className="mt-1 text-sm text-cyan-300">
                          {baseUnit?.unit_symbol || "unit"}{" "}
                          {money(
                            baseUnit?.selling_price ??
                            product.selling_price ??
                            product.price
                          )}
                        </div>

                        <div className="mt-2 text-xs text-white/40">
                          Stock:{" "}
                          {product.stock}
                        </div>

                      </div>

                    </button>

                  );

                })}

              </div>

            )}


            {/* PRODUCT DETAIL */}

            {selectedProduct && (

              <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-[#0c203b] p-4">

                <div className="mb-3 flex gap-3">

                  {selectedProduct.image && (

                    <img
                      src={selectedProduct.image}
                      className="h-16 w-16 rounded-xl object-cover"
                      alt=""
                    />

                  )}

                  <div>

                    <h3 className="font-bold">
                      {selectedProduct.name}
                    </h3>

                    <p className="text-xs text-white/50">
                      Available stock:{" "}
                      {selectedProduct.stock}
                    </p>

                  </div>

                </div>


                <label className="mb-2 block text-xs text-white/50">
                  Select Selling Unit
                </label>

                <div className="space-y-2">

                  {getUnits(selectedProduct).map(
                    (unit) => (

                      <button
                        key={
                          unit.id ??
                          unit.unit_name
                        }
                        onClick={() =>
                          setSelectedUnit(unit)
                        }
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          selectedUnit?.id ===
                          unit.id
                            ? "border-cyan-400 bg-cyan-400/10"
                            : "border-white/10 bg-white/5"
                        }`}
                      >

                        <div className="flex items-center justify-between">

                          <div>

                            <div className="font-semibold">
                              {unit.unit_name}
                            </div>

                            <div className="text-xs text-white/40">
                              1{" "}
                              {unit.unit_symbol ||
                                unit.unit_name}{" "}
                              ={" "}
                              {
                                unit.conversion_to_base
                              }{" "}
                              base units
                            </div>

                          </div>


                          <div className="font-bold text-cyan-300">
                            {money(
                              unit.selling_price ??
                              selectedProduct.selling_price ??
                              selectedProduct.price
                            )}
                          </div>

                        </div>

                      </button>

                    )
                  )}

                </div>

              </div>

            )}

          </section>


          {/* CART */}

          <section className="flex min-h-[500px] flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">

            <div className="mb-4 flex items-center justify-between">

              <h2 className="text-xl font-black">
                Cart
              </h2>

              {cart.length > 0 && (

                <button
                  onClick={() =>
                    setCart([])
                  }
                  className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300"
                >
                  Clear
                </button>

              )}

            </div>


            {cart.length === 0 ? (

              <div className="flex flex-1 items-center justify-center">

                <div className="text-center">

                  <div className="mb-3 text-5xl">
                    🛒
                  </div>

                  <div className="font-bold text-white/70">
                    Cart is empty
                  </div>

                  <p className="mt-1 text-sm text-white/40">
                    Select a product to start
                  </p>

                </div>

              </div>

            ) : (

              <>

                <div className="space-y-3">

                  {cart.map((item, index) => {

                    const itemTotal =
                      Number(item.price) *
                      Number(item.quantity);

                    const baseRequired =
                      Number(item.quantity) *
                      Number(
                        item.conversion_to_base ||
                        1
                      );


                    return (

                      <div
                        key={`${item.product_id}-${item.unit_id}`}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                      >

                        <div className="flex gap-3">

                          {item.image ? (

                            <img
                              src={item.image}
                              className="h-14 w-14 rounded-xl object-cover"
                              alt=""
                            />

                          ) : (

                            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10">
                              📦
                            </div>

                          )}


                          <div className="min-w-0 flex-1">

                            <div className="font-bold">
                              {item.name}
                            </div>

                            <div className="text-xs text-cyan-300">
                              {item.unit_name}
                            </div>

                            <div className="mt-1 text-xs text-white/40">
                              {item.quantity} ×{" "}
                              {money(item.price)}
                            </div>

                            <div className="text-xs text-white/30">
                              Stock used:{" "}
                              {baseRequired} base units
                            </div>

                          </div>


                          <div className="text-right">

                            <div className="font-black">
                              {money(itemTotal)}
                            </div>

                            <button
                              onClick={() =>
                                removeItem(index)
                              }
                              className="mt-2 text-xs text-red-300"
                            >
                              Remove
                            </button>

                          </div>

                        </div>


                        <div className="mt-3 flex items-center justify-between">

                          <div className="text-xs text-white/40">
                            Available:{" "}
                            {item.stock}
                          </div>


                          <div className="flex items-center rounded-xl border border-white/10 bg-black/20">

                            <button
                              onClick={() =>
                                changeQuantity(
                                  index,
                                  -1
                                )
                              }
                              className="px-4 py-2 text-lg"
                            >
                              −
                            </button>

                            <span className="min-w-10 text-center font-bold">
                              {item.quantity}
                            </span>

                            <button
                              onClick={() =>
                                changeQuantity(
                                  index,
                                  1
                                )
                              }
                              className="px-4 py-2 text-lg text-cyan-300"
                            >
                              +
                            </button>

                          </div>

                        </div>

                      </div>

                    );

                  })}

                </div>


                {/* TOTAL */}

                <div className="mt-auto pt-5">

                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">

                    <div className="flex items-center justify-between">

                      <span className="text-white/50">
                        Items
                      </span>

                      <span>
                        {cart.reduce(
                          (sum, item) =>
                            sum +
                            Number(
                              item.quantity
                            ),
                          0
                        )}
                      </span>

                    </div>


                    <div className="mt-2 flex items-center justify-between">

                      <span className="text-lg font-bold">
                        Total
                      </span>

                      <span className="text-2xl font-black text-cyan-300">
                        {money(total)}
                      </span>

                    </div>


                    <button
                      onClick={openPayment}
                      className="mt-4 w-full rounded-2xl bg-green-500 py-4 text-lg font-black text-white transition hover:bg-green-400"
                    >
                      Continue Payment
                    </button>

                  </div>

                </div>

              </>

            )}

          </section>

        </div>

      </div>


      {/* PAYMENT MODAL */}

      {showPayment && (

        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">

          <div className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[#0b1b34] p-5 shadow-2xl sm:rounded-3xl">

            <div className="mb-5 flex items-center justify-between">

              <div>

                <h2 className="text-xl font-black">
                  Payment
                </h2>

                <p className="text-sm text-white/40">
                  Complete the sale
                </p>

              </div>

              <button
                onClick={() =>
                  setShowPayment(false)
                }
                className="rounded-xl bg-white/10 px-3 py-2"
              >
                ✕
              </button>

            </div>


            <div className="mb-4 rounded-2xl bg-white/5 p-4">

              <div className="text-sm text-white/40">
                Grand Total
              </div>

              <div className="text-3xl font-black text-cyan-300">
                {money(total)}
              </div>

            </div>


            <input
              type="tel"
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value)
              }
              placeholder="Customer phone (optional)"
              className="mb-3 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3.5 outline-none focus:border-cyan-400"
            />


            <input
              type="number"
              min="0"
              step="0.01"
              value={paidAmount}
              onChange={(e) =>
                setPaidAmount(e.target.value)
              }
              placeholder="Amount received"
              className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3.5 outline-none focus:border-cyan-400"
            />


            <div className="mt-4 space-y-2 rounded-2xl bg-white/5 p-4">

              <div className="flex justify-between">

                <span className="text-white/50">
                  Total
                </span>

                <span>
                  {money(total)}
                </span>

              </div>


              <div className="flex justify-between">

                <span className="text-white/50">
                  Received
                </span>

                <span>
                  {money(paid)}
                </span>

              </div>


              {debt > 0 && (

                <div className="flex justify-between font-bold text-red-300">

                  <span>
                    Debt
                  </span>

                  <span>
                    {money(debt)}
                  </span>

                </div>

              )}


              {change > 0 && (

                <div className="flex justify-between font-bold text-green-300">

                  <span>
                    Change
                  </span>

                  <span>
                    {money(change)}
                  </span>

                </div>

              )}

            </div>


            <button
              disabled={loading}
              onClick={completeSale}
              className="mt-5 w-full rounded-2xl bg-green-500 py-4 font-black disabled:opacity-50"
            >
              {loading
                ? "Processing..."
                : "Complete Sale"}
            </button>

          </div>

        </div>

      )}


      {/* RECEIPT */}

      {showReceipt && receipt && (

        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">

          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 text-black sm:rounded-3xl">

            <div className="text-center">

              <div className="text-3xl">
                ✓
              </div>

              <h2 className="mt-2 text-2xl font-black">
                Sale Complete
              </h2>

              <p className="text-sm text-gray-500">
                Order #{receipt.orderId}
              </p>

            </div>


            <div className="my-5 border-b border-gray-200 pb-4">

              <div className="flex justify-between text-sm">

                <span className="text-gray-500">
                  Date
                </span>

                <span>
                  {receipt.date}
                </span>

              </div>


              <div className="mt-2 flex justify-between text-sm">

                <span className="text-gray-500">
                  Customer
                </span>

                <span>
                  {receipt.customerPhone}
                </span>

              </div>

            </div>


            <div className="space-y-3">

              {receipt.items.map(
                (item, index) => (

                  <div
                    key={index}
                    className="flex justify-between gap-3"
                  >

                    <div>

                      <div className="font-bold">
                        {item.name}
                      </div>

                      <div className="text-xs text-gray-500">
                        {item.quantity} ×{" "}
                        {item.unit} ×{" "}
                        {money(item.price)}
                      </div>

                    </div>

                    <div className="font-bold">
                      {money(item.total)}
                    </div>

                  </div>

                )
              )}

            </div>


            <div className="mt-5 space-y-2 border-t border-gray-200 pt-4">

              <div className="flex justify-between">

                <span>
                  Total
                </span>

                <b>
                  {money(receipt.total)}
                </b>

              </div>


              <div className="flex justify-between">

                <span>
                  Paid
                </span>

                <b>
                  {money(receipt.paid)}
                </b>

              </div>


              {receipt.debt > 0 && (

                <div className="flex justify-between text-red-600">

                  <span>
                    Debt
                  </span>

                  <b>
                    {money(receipt.debt)}
                  </b>

                </div>

              )}


              {receipt.change > 0 && (

                <div className="flex justify-between text-green-600">

                  <span>
                    Change
                  </span>

                  <b>
                    {money(receipt.change)}
                  </b>

                </div>

              )}

            </div>


            <div className="mt-6 grid grid-cols-2 gap-3">

              <button
                onClick={() =>
                  setShowReceipt(false)
                }
                className="rounded-xl bg-gray-200 py-3 font-bold"
              >
                Close
              </button>

              <button
                onClick={() =>
                  printReceipt(receipt)
                }
                className="rounded-xl bg-blue-500 py-3 font-bold text-white"
              >
                Print
              </button>

            </div>

          </div>

        </div>

      )}

    </main>

  );
}


/*
 * ----------------------------------------
 * PRINT RECEIPT
 * ----------------------------------------
 */

function printReceipt(receipt) {

  const printWindow =
    window.open(
      "",
      "",
      "width=420,height=700"
    );

  if (!printWindow) {

    alert(
      "Please allow popups to print receipt"
    );

    return;
  }


  const itemsHTML =
    receipt.items
      .map(
        (item) => `
          <div class="item">
            <div>
              <b>${escapeHTML(item.name)}</b>
              <br/>
              ${item.quantity} ×
              ${escapeHTML(item.unit)}
              × ${Number(item.price).toFixed(2)}
            </div>

            <b>
              ${Number(item.total).toFixed(2)}
            </b>
          </div>
        `
      )
      .join("");


  printWindow.document.write(`

    <html>

      <head>

        <title>
          Receipt #${receipt.orderId}
        </title>

        <style>

          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            color: #111;
          }

          .header {
            text-align: center;
            margin-bottom: 20px;
          }

          .header h2 {
            margin: 0 0 5px;
          }

          .item {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            padding: 8px 0;
            border-bottom: 1px dashed #ccc;
          }

          .totals {
            margin-top: 15px;
            border-top: 2px solid #111;
            padding-top: 10px;
          }

          .row {
            display: flex;
            justify-content: space-between;
            margin: 6px 0;
          }

          .grand {
            font-size: 18px;
            font-weight: bold;
          }

        </style>

      </head>


      <body>

        <div class="header">

          <h2>SALE RECEIPT</h2>

          <div>
            Order #${receipt.orderId}
          </div>

          <div>
            ${escapeHTML(receipt.date)}
          </div>

          <div>
            Customer:
            ${escapeHTML(receipt.customerPhone)}
          </div>

        </div>


        ${itemsHTML}


        <div class="totals">

          <div class="row grand">

            <span>
              Total
            </span>

            <span>
              ${Number(receipt.total).toFixed(2)}
            </span>

          </div>


          <div class="row">

            <span>
              Paid
            </span>

            <span>
              ${Number(receipt.paid).toFixed(2)}
            </span>

          </div>


          ${
            receipt.debt > 0
              ? `
                <div class="row">
                  <span>Debt</span>
                  <span>
                    ${Number(receipt.debt).toFixed(2)}
                  </span>
                </div>
              `
              : ""
          }


          ${
            receipt.change > 0
              ? `
                <div class="row">
                  <span>Change</span>
                  <span>
                    ${Number(receipt.change).toFixed(2)}
                  </span>
                </div>
              `
              : ""
          }

        </div>


        <p style="text-align:center;margin-top:30px">
          Thank you for your purchase!
        </p>

      </body>

    </html>

  `);


  printWindow.document.close();

  printWindow.focus();

  setTimeout(() => {

    printWindow.print();

    printWindow.close();

  }, 300);

}


function escapeHTML(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}

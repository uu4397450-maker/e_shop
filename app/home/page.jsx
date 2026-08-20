"use client";

import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const getShopName = async () => {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        if (json?.user?.shop_name) return String(json.user.shop_name);
      }
    } catch {
      // ignore
    }

    try {
      const raw = localStorage.getItem("user");
      if (!raw) return "";
      const u = JSON.parse(raw);
      return u?.shop_name ? String(u.shop_name) : "";
    } catch {
      return "";
    }
  };

  const [rangePreset, setRangePreset] = useState("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const pad2 = (n) => String(n).padStart(2, "0");
  const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  const getPresetRange = (preset) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (preset === "all") {
      return { from: "", to: "" };
    }

    if (preset === "today") {
      const iso = toISODate(today);
      return { from: iso, to: iso };
    }

    if (preset === "week") {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      return { from: toISODate(start), to: toISODate(today) };
    }

    if (preset === "month") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toISODate(start), to: toISODate(today) };
    }

    if (preset === "custom") {
      return { from: customFrom, to: customTo };
    }

    return { from: "", to: "" };
  };

  const effectiveRange = getPresetRange(rangePreset);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const qs = new URLSearchParams();
        if (effectiveRange.from && effectiveRange.to) {
          qs.set("from", effectiveRange.from);
          qs.set("to", effectiveRange.to);
        }

        const url = qs.toString() ? `/api/dashboard?${qs.toString()}` : "/api/dashboard";
        const res = await fetch(url, {
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load dashboard");
        }
        if (alive) setData(json);
      } catch (e) {
        if (alive) setError(e?.message || "Failed to load dashboard");
      } finally {
        if (alive) setLoading(false);
      }
    }

    if (rangePreset === "custom") {
      if (customFrom && customTo) load();
      else setData(null);
    } else {
      load();
    }
    return () => {
      alive = false;
    };
  }, [rangePreset, customFrom, customTo]);

  const totals = data?.totals;
  const sales7d = data?.sales7d || [];
  const topProducts = data?.topProducts || [];
  const reportOrders = data?.reportOrders || [];

  const formatCurrency = (value) => {
    const n = Number(value || 0);
    return `₹${n.toFixed(2)}`;
  };

  const chartWidth = 560;
  const chartHeight = 220;
  const padding = 24;

  const maxY = Math.max(
    1,
    ...sales7d.map((d) => Math.max(Number(d.sales || 0), Number(d.income || 0)))
  );
  const xStep = sales7d.length > 1 ? (chartWidth - padding * 2) / (sales7d.length - 1) : 0;

  const toX = (i) => padding + i * xStep;
  const toY = (v) => {
    const t = Number(v || 0) / maxY;
    return chartHeight - padding - t * (chartHeight - padding * 2);
  };

  const buildPath = (key) => {
    if (sales7d.length === 0) return "";
    return sales7d
      .map((d, i) => {
        const x = toX(i);
        const y = toY(d[key]);
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");
  };

  const salesPath = buildPath("sales");
  const incomePath = buildPath("income");

  const pieSize = 240;
  const cx = pieSize / 2;
  const cy = pieSize / 2;
  const r = 86;
  const ring = 18;

  const totalQty = topProducts.reduce((s, p) => s + Number(p.qty || 0), 0) || 1;
  const colors = [
    "#22c55e",
    "#3b82f6",
    "#a855f7",
    "#f97316",
    "#ef4444",
    "#14b8a6",
  ];

  const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  };

  const describeArc = (x, y, radius, startAngle, endAngle) => {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return [
      "M",
      start.x,
      start.y,
      "A",
      radius,
      radius,
      0,
      largeArcFlag,
      0,
      end.x,
      end.y,
    ].join(" ");
  };

  const pieSlices = (() => {
    let angle = 0;
    return topProducts.map((p, idx) => {
      const v = Number(p.qty || 0);
      const sweep = (v / totalQty) * 360;
      const start = angle;
      const end = angle + sweep;
      angle = end;
      return {
        ...p,
        color: colors[idx % colors.length],
        start,
        end,
        pct: (v / totalQty) * 100,
      };
    });
  })();

  const printReport = async () => {
    if (!data?.totals) return;

    const shopName = await getShopName();

    const titleRange =
      effectiveRange.from && effectiveRange.to
        ? `${effectiveRange.from} to ${effectiveRange.to}`
        : "All time";

    const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

    const lineSvg = (() => {
      const w = 700;
      const h = 260;
      const p = 28;
      const localMaxY = Math.max(
        1,
        ...sales7d.map((d) => Math.max(Number(d.sales || 0), Number(d.income || 0)))
      );
      const step = sales7d.length > 1 ? (w - p * 2) / (sales7d.length - 1) : 0;
      const x = (i) => p + i * step;
      const y = (v) => {
        const t = Number(v || 0) / localMaxY;
        return h - p - t * (h - p * 2);
      };
      const path = (key) =>
        sales7d
          .map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d[key])}`)
          .join(" ");

      const salesPathLocal = sales7d.length ? path("sales") : "";
      const incomePathLocal = sales7d.length ? path("income") : "";

      return `
        <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="salesGradP" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.9" />
              <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.95" />
            </linearGradient>
            <linearGradient id="incomeGradP" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stop-color="#22c55e" stop-opacity="0.9" />
              <stop offset="100%" stop-color="#a3e635" stop-opacity="0.95" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="${w}" height="${h}" rx="18" fill="#0b1b34" />
          <g opacity="0.35" stroke="#ffffff" stroke-width="1">
            <line x1="${p}" x2="${w - p}" y1="${h - p - 0.25 * (h - p * 2)}" y2="${h - p - 0.25 * (h - p * 2)}" />
            <line x1="${p}" x2="${w - p}" y1="${h - p - 0.50 * (h - p * 2)}" y2="${h - p - 0.50 * (h - p * 2)}" />
            <line x1="${p}" x2="${w - p}" y1="${h - p - 0.75 * (h - p * 2)}" y2="${h - p - 0.75 * (h - p * 2)}" />
          </g>
          ${salesPathLocal ? `<path d="${salesPathLocal}" fill="none" stroke="url(#salesGradP)" stroke-width="4" stroke-linecap="round" />` : ""}
          ${incomePathLocal ? `<path d="${incomePathLocal}" fill="none" stroke="url(#incomeGradP)" stroke-width="4" stroke-linecap="round" />` : ""}
          ${sales7d
            .map(
              (d, i) => `
              <circle cx="${x(i)}" cy="${y(d.sales)}" r="4" fill="#22d3ee" />
              <circle cx="${x(i)}" cy="${y(d.income)}" r="4" fill="#22c55e" />
            `
            )
            .join("")}
        </svg>
      `;
    })();

    const pieSvg = (() => {
      const size = 260;
      const pcx = size / 2;
      const pcy = size / 2;
      const pr = 88;
      const pring = 20;

      const polar = (cx2, cy2, radius, deg) => {
        const rad = ((deg - 90) * Math.PI) / 180;
        return { x: cx2 + radius * Math.cos(rad), y: cy2 + radius * Math.sin(rad) };
      };
      const arc = (cx2, cy2, radius, start, end) => {
        const s = polar(cx2, cy2, radius, end);
        const e = polar(cx2, cy2, radius, start);
        const laf = end - start <= 180 ? "0" : "1";
        return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${laf} 0 ${e.x} ${e.y}`;
      };

      return `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="${size}" height="${size}" rx="18" fill="#0b1b34" />
          <circle cx="${pcx}" cy="${pcy}" r="${pr}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="${pring}" />
          ${pieSlices
            .map(
              (s) =>
                `<path d="${arc(pcx, pcy, pr, s.start, s.end)}" fill="none" stroke="${s.color}" stroke-width="${pring}" stroke-linecap="round" />`
            )
            .join("")}
          <text x="${pcx}" y="${pcy - 6}" text-anchor="middle" font-size="14" fill="rgba(255,255,255,0.9)">Product Mix</text>
          <text x="${pcx}" y="${pcy + 14}" text-anchor="middle" font-size="12" fill="rgba(255,255,255,0.65)">Top Qty</text>
        </svg>
      `;
    })();

    const ordersRows = reportOrders
      .map(
        (o) => `
        <tr>
          <td>#${o.id}</td>
          <td>${o.createdAt}</td>
          <td>${o.phone || "-"}</td>
          <td style="text-align:right;">${fmt(o.totalAmount)}</td>
          <td style="text-align:right;">${fmt(o.paidAmount)}</td>
          <td style="text-align:right; color:${o.debtAmount > 0 ? "#fb7185" : "#22c55e"};">${fmt(o.debtAmount)}</td>
        </tr>
      `
      )
      .join("");

    const w = window.open("", "", "width=1100,height=750");
    w.document.write(`
      <html>
        <head>
          <title>Report - ${titleRange}</title>
          <style>
            *{box-sizing:border-box;}
            body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto; background:#061226; color:#e5e7eb;}
            .wrap{padding:28px;}
            .header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;}
            .title{font-size:24px;font-weight:800;}
            .sub{color:rgba(229,231,235,0.65);font-size:13px;margin-top:6px;}
            .range{padding:10px 14px;border-radius:14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);font-size:12px;}
            .kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px;}
            .card{padding:14px;border-radius:18px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);}
            .label{color:rgba(229,231,235,0.65);font-size:12px;}
            .value{font-size:22px;font-weight:800;margin-top:8px;}
            .grid{display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-top:12px;}
            .panel{padding:14px;border-radius:18px;background:linear-gradient(135deg, rgba(34,211,238,0.10), rgba(168,85,247,0.10));border:1px solid rgba(255,255,255,0.08);}
            .panel h3{margin:0 0 10px 0;font-size:14px;}
            table{width:100%;border-collapse:collapse;margin-top:14px;overflow:hidden;border-radius:16px;}
            th,td{padding:10px 10px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:12px;}
            th{text-align:left;color:rgba(229,231,235,0.75);background:rgba(255,255,255,0.04);}
            .footer{margin-top:18px;color:rgba(229,231,235,0.55);font-size:12px;}
            @media print{
              .no-print{display:none;}
              body{background:white;color:black;}
              .card,.panel,.range{border:1px solid #ddd;}
              th{background:#f4f4f4;color:#111;}
              td{color:#111;}
            }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="header">
              <div>
                <div class="title">${shopName ? shopName + " - " : ""}Shop Report</div>
                <div class="sub">Colorful summary with charts and transactions</div>
              </div>
              <div class="range">${titleRange}</div>
            </div>

            <div class="kpis">
              <div class="card"><div class="label">Total Income</div><div class="value" style="color:#22c55e;">${fmt(totals.totalIncome)}</div></div>
              <div class="card"><div class="label">Total Sales</div><div class="value" style="color:#22d3ee;">${fmt(totals.totalSales)}</div></div>
              <div class="card"><div class="label">Total Debt</div><div class="value" style="color:#fb7185;">${fmt(totals.totalDebt)}</div></div>
              <div class="card"><div class="label">Orders / Customers</div><div class="value">${totals.ordersCount} / ${totals.customersCount}</div></div>
            </div>

            <div class="grid">
              <div class="panel">
                <h3>Income vs Sales</h3>
                ${lineSvg}
              </div>
              <div class="panel">
                <h3>Product Sales Mix</h3>
                ${pieSvg}
                <div style="margin-top:10px;">
                  ${pieSlices
                    .map(
                      (s) =>
                        `<div style="display:flex;justify-content:space-between;gap:10px;margin:6px 0;font-size:12px;">
                          <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                            <span style="width:10px;height:10px;border-radius:999px;background:${s.color};display:inline-block;"></span>
                            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px;">${s.name}</span>
                          </div>
                          <div style="color:rgba(229,231,235,0.7);">${s.qty} (${s.pct.toFixed(0)}%)</div>
                        </div>`
                    )
                    .join("")}
                </div>
              </div>
            </div>

            <div class="panel" style="margin-top:12px;">
              <h3>Report Details (Orders)</h3>
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Date</th>
                    <th>Phone</th>
                    <th style="text-align:right;">Total</th>
                    <th style="text-align:right;">Paid</th>
                    <th style="text-align:right;">Debt</th>
                  </tr>
                </thead>
                <tbody>
                  ${ordersRows || `<tr><td colspan="6" style="padding:14px;">No orders in selected range.</td></tr>`}
                </tbody>
              </table>
              <div class="footer">Generated on ${new Date().toLocaleString()}</div>
            </div>

            <div class="no-print" style="margin-top:14px;display:flex;gap:10px;">
              <button onclick="window.print()" style="padding:10px 14px;border-radius:12px;border:none;background:#22c55e;color:white;font-weight:700;cursor:pointer;">Print</button>
              <button onclick="window.close()" style="padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#e5e7eb;font-weight:700;cursor:pointer;">Close</button>
            </div>
          </div>
        </body>
      </html>
    `);
    w.document.close();
  };

  return (
    <div className="theme-dashboard space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--foreground)]">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--soft)]">Sales, income and product performance</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-[var(--soft)]">
            {effectiveRange.from && effectiveRange.to ? (
              <span>
                {effectiveRange.from} to {effectiveRange.to}
              </span>
            ) : (
              <span>All time</span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[var(--shadow)]">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setRangePreset("all")}
              className={`px-4 py-2 rounded-2xl text-sm border transition ${
                rangePreset === "all"
                  ? "bg-cyan-500/20 border-cyan-400/30 text-cyan-200"
                  : "border-[var(--line)] bg-[var(--panel)] text-[var(--foreground)] hover:bg-[var(--surface)]"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setRangePreset("today")}
              className={`px-4 py-2 rounded-2xl text-sm border transition ${
                rangePreset === "today"
                  ? "bg-cyan-500/20 border-cyan-400/30 text-cyan-200"
                  : "border-[var(--line)] bg-[var(--panel)] text-[var(--foreground)] hover:bg-[var(--surface)]"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setRangePreset("week")}
              className={`px-4 py-2 rounded-2xl text-sm border transition ${
                rangePreset === "week"
                  ? "bg-cyan-500/20 border-cyan-400/30 text-cyan-200"
                  : "border-[var(--line)] bg-[var(--panel)] text-[var(--foreground)] hover:bg-[var(--surface)]"
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setRangePreset("month")}
              className={`px-4 py-2 rounded-2xl text-sm border transition ${
                rangePreset === "month"
                  ? "bg-cyan-500/20 border-cyan-400/30 text-cyan-200"
                  : "border-[var(--line)] bg-[var(--panel)] text-[var(--foreground)] hover:bg-[var(--surface)]"
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setRangePreset("custom")}
              className={`px-4 py-2 rounded-2xl text-sm border transition ${
                rangePreset === "custom"
                  ? "bg-purple-500/20 border-purple-400/30 text-purple-200"
                  : "border-[var(--line)] bg-[var(--panel)] text-[var(--foreground)] hover:bg-[var(--surface)]"
              }`}
            >
              Custom
            </button>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-3">
            {rangePreset === "custom" && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--soft)]">From</span>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--soft)]">To</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none"
                  />
                </div>
              </div>
            )}

            <button
              onClick={printReport}
              disabled={loading || !totals || (rangePreset === "custom" && (!customFrom || !customTo))}
              className="px-4 py-2 rounded-xl bg-green-500/20 hover:bg-green-500/30 border border-green-400/20 transition text-sm text-green-200 disabled:opacity-50 disabled:hover:bg-green-500/20"
            >
              Print Report
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-8">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
            <div>
              <div className="font-semibold text-[var(--foreground)]">Loading dashboard…</div>
              <div className="text-sm text-[var(--soft)]">Getting latest stats</div>
            </div>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-6">
          <div className="text-red-200 font-semibold">{error}</div>
          <div className="text-red-200/70 text-sm mt-1">Check server logs or database tables.</div>
        </div>
      )}

      {!loading && !error && totals && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[var(--shadow)]">
              <div className="text-sm text-[var(--soft)]">Total Income</div>
              <div className="mt-2 text-2xl font-bold text-green-500">{formatCurrency(totals.totalIncome)}</div>
              <div className="mt-1 text-xs text-[var(--soft)]">Paid by customers</div>
            </div>

            <div className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[var(--shadow)]">
              <div className="text-sm text-[var(--soft)]">Total Sales</div>
              <div className="mt-2 text-2xl font-bold text-cyan-500">{formatCurrency(totals.totalSales)}</div>
              <div className="mt-1 text-xs text-[var(--soft)]">Orders total amount</div>
            </div>

            <div className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[var(--shadow)]">
              <div className="text-sm text-[var(--soft)]">Total Debt</div>
              <div className="mt-2 text-2xl font-bold text-red-500">{formatCurrency(totals.totalDebt)}</div>
              <div className="mt-1 text-xs text-[var(--soft)]">Pending from customers</div>
            </div>

            <div className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[var(--shadow)]">
              <div className="text-sm text-[var(--soft)]">Orders / Customers</div>
              <div className="mt-2 text-2xl font-bold text-[var(--foreground)]">
                {totals.ordersCount} <span className="text-[var(--soft)]">/</span> {totals.customersCount}
              </div>
              <div className="mt-1 text-xs text-[var(--soft)]">Products: {totals.productsCount}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <div className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow)] xl:col-span-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-[var(--foreground)]">Income vs Sales (Last 7 days)</div>
                  <div className="mt-1 text-sm text-[var(--soft)]">Flow chart for daily performance</div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-cyan-400" />
                    <span className="text-[var(--foreground)]">Sales</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-green-400" />
                    <span className="text-[var(--foreground)]">Income</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 overflow-x-auto">
                <svg width={chartWidth} height={chartHeight} className="block">
                  <defs>
                    <linearGradient id="salesGrad" x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.9" />
                    </linearGradient>
                    <linearGradient id="incomeGrad" x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#a3e635" stopOpacity="0.9" />
                    </linearGradient>
                  </defs>

                  <rect x="0" y="0" width={chartWidth} height={chartHeight} rx="18" fill="rgba(255,255,255,0.02)" />

                  {[0.25, 0.5, 0.75].map((t, i) => (
                    <line
                      key={i}
                      x1={padding}
                      x2={chartWidth - padding}
                      y1={chartHeight - padding - t * (chartHeight - padding * 2)}
                      y2={chartHeight - padding - t * (chartHeight - padding * 2)}
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="1"
                    />
                  ))}

                  {salesPath && (
                    <path d={salesPath} fill="none" stroke="url(#salesGrad)" strokeWidth="3" strokeLinecap="round" />
                  )}
                  {incomePath && (
                    <path d={incomePath} fill="none" stroke="url(#incomeGrad)" strokeWidth="3" strokeLinecap="round" />
                  )}

                  {sales7d.map((d, i) => (
                    <g key={d.day || i}>
                      <circle cx={toX(i)} cy={toY(d.sales)} r="3.5" fill="#22d3ee" opacity="0.9" />
                      <circle cx={toX(i)} cy={toY(d.income)} r="3.5" fill="#22c55e" opacity="0.9" />
                      <text
                        x={toX(i)}
                        y={chartHeight - 6}
                        textAnchor="middle"
                        fontSize="10"
                        fill="rgba(255,255,255,0.55)"
                      >
                        {(d.day || "").slice(5)}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow)] xl:col-span-2">
              <div>
                <div className="font-semibold text-[var(--foreground)]">Product Sales Mix</div>
                <div className="mt-1 text-sm text-[var(--soft)]">Top products by quantity</div>
              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
                <div className="flex items-center justify-center">
                  <svg width={pieSize} height={pieSize}>
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={ring} />
                    {pieSlices.map((s, i) => (
                      <path
                        key={s.name + i}
                        d={describeArc(cx, cy, r, s.start, s.end)}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={ring}
                        strokeLinecap="round"
                      />
                    ))}
                    <text x={cx} y={cy - 6} textAnchor="middle" fontSize="14" fill="rgba(255,255,255,0.85)">
                      Top Products
                    </text>
                    <text x={cx} y={cy + 14} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.55)">
                      Qty: {topProducts.reduce((s, p) => s + Number(p.qty || 0), 0)}
                    </text>
                  </svg>
                </div>

                <div className="max-h-[280px] overflow-y-auto pr-2">
                  <div className="space-y-2">
                    {pieSlices.length === 0 && (
                      <div className="text-sm text-[var(--soft)]">No sales yet.</div>
                    )}
                    {pieSlices.map((s, i) => (
                      <div key={s.name + i} className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="truncate text-sm text-[var(--foreground)]">{s.name}</span>
                        </div>
                        <div className="whitespace-nowrap text-xs text-[var(--soft)]">
                          {s.qty} ({s.pct.toFixed(0)}%)
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
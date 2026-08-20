"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Settings,
  Package,
  LogOut,
  SunMedium,
  MoonStar,
} from "lucide-react";

export default function HomeLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [showSettings, setShowSettings] = useState(false);
  const [shopName, setShopName] = useState("");
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const saved = localStorage.getItem("shop-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("shop-theme", theme);
  }, [theme]);

  const isDark = theme === "dark";
  const shellGradient = isDark
    ? "linear-gradient(135deg, rgba(15,23,42,0.72), rgba(15,23,42,0.22))"
    : "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(226,232,240,0.75))";

  const PentagonNet = ({ side }) => {
    const isLeft = side === "left";
    return (
      <motion.div
        className={`hidden md:flex items-center ${isLeft ? "justify-start" : "justify-end"}`}
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="relative">
          <motion.div aria-hidden className="absolute -inset-6 rounded-3xl blur-2xl opacity-40" animate={{ opacity: [0.18, 0.5, 0.18] }} transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }} style={{ background: "radial-gradient(circle at 30% 30%, rgba(34,211,238,0.75), rgba(168,85,247,0.25), transparent 70%)" }} />
          <motion.svg width="112" height="112" viewBox="0 0 120 120" className={isLeft ? "-scale-x-100" : ""}>
            <defs>
              <linearGradient id={`pn_${side}_g1`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="rgba(34,211,238,0.95)" />
                <stop offset="0.5" stopColor="rgba(59,130,246,0.95)" />
                <stop offset="1" stopColor="rgba(168,85,247,0.95)" />
              </linearGradient>
            </defs>

            <motion.g animate={{ rotate: [0, 3, 0, -3, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} style={{ transformOrigin: "60px 60px" }}>
              <motion.path d="M60 14 L94 38 L82 80 L38 80 L26 38 Z" fill="none" stroke={`url(#pn_${side}_g1)`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10 8" animate={{ strokeDashoffset: [0, -72] }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} />
              <motion.path d="M60 30 L82 44 L74 70 L46 70 L38 44 Z" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.4" strokeDasharray="6 10" animate={{ strokeDashoffset: [0, 60], opacity: [0.55, 0.9, 0.55] }} transition={{ duration: 4.8, repeat: Infinity, ease: "linear" }} />

              <path d="M60 14 L60 30" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
              <path d="M94 38 L82 44" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
              <path d="M82 80 L74 70" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
              <path d="M38 80 L46 70" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
              <path d="M26 38 L38 44" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />

              <motion.circle cx="60" cy="14" r="3.8" fill={`url(#pn_${side}_g1)`} animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }} />
              <motion.circle cx="94" cy="38" r="3.2" fill="rgba(255,255,255,0.9)" animate={{ opacity: [0.45, 0.95, 0.45] }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: 0.2 }} />
              <motion.circle cx="82" cy="80" r="3.2" fill="rgba(255,255,255,0.9)" animate={{ opacity: [0.45, 0.95, 0.45] }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: 0.4 }} />
              <motion.circle cx="38" cy="80" r="3.2" fill="rgba(255,255,255,0.9)" animate={{ opacity: [0.45, 0.95, 0.45] }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: 0.6 }} />
              <motion.circle cx="26" cy="38" r="3.2" fill="rgba(255,255,255,0.9)" animate={{ opacity: [0.45, 0.95, 0.45] }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: 0.8 }} />
            </motion.g>
          </motion.svg>
        </div>
      </motion.div>
    );
  };

  useEffect(() => {
    let cancelled = false;

    async function loadShopName() {
      try {
        const res = await fetch("/api/me", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const name = data?.user?.shop_name;
          if (!cancelled && name) setShopName(String(name));
          return;
        }
      } catch {
        // ignore
      }

      try {
        const raw = localStorage.getItem("user");
        if (!raw) return;
        const u = JSON.parse(raw);
        if (!cancelled && u?.shop_name) setShopName(String(u.shop_name));
      } catch {
        // ignore
      }
    }

    loadShopName();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    try { await fetch("/api/logout", { method: "POST", credentials: "include" }); } catch {}
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    setShowSettings(false);
    router.push("/");
  };

  const tabs = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/home" },
    { label: "Sale", icon: ShoppingCart, path: "/home/sale" },
    { label: "Customer", icon: Users, path: "/home/customer" },
  ];

  const handleSetting = () => {
    router.push("/inventory");
    setShowSettings(false);
  };

  return (
    <div className="min-h-screen pb-28 relative transition-colors duration-300" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-7xl px-4 pt-4 pb-10 md:px-6">
        <div className="sticky top-3 z-30 mb-5 rounded-[26px] border border-[var(--line)] shadow-[var(--shadow)] backdrop-blur-xl" style={{ background: shellGradient, borderColor: "var(--line)" }}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--soft)]">Business</p>
              <h2 className="text-lg font-bold text-[var(--foreground)] md:text-xl">{shopName || "Your Shop"}</h2>
            </div>

            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs font-medium text-[var(--foreground)] transition hover:opacity-90"
            >
              {isDark ? <SunMedium size={14} /> : <MoonStar size={14} />}
              {isDark ? "Light" : "Dark"}
            </button>
          </div>
        </div>

        <div className="pb-2">{children}</div>
      </div>

      <motion.footer initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.7, ease: "easeOut" }} className="w-full pb-32">
        <div className="relative w-full overflow-hidden border-t border-[var(--line)]">
          <div className="pointer-events-none absolute -top-12 left-0 right-0">
            <div className="mx-auto flex max-w-6xl items-end justify-center gap-5 px-6">
              {["from-purple-400 to-cyan-300", "from-fuchsia-400 to-pink-300", "from-rose-400 to-orange-300", "from-orange-300 to-amber-200", "from-amber-300 to-lime-200", "from-lime-300 to-emerald-200", "from-emerald-300 to-teal-200", "from-cyan-300 to-sky-300"].map((g, i) => (
                <motion.div key={g} className={`h-7 w-7 rounded-full bg-gradient-to-br ${g}`} animate={{ y: [0, -8, 0], opacity: [0.8, 1, 0.8] }} transition={{ duration: 3 + i * 0.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.12 }} />
              ))}
            </div>
          </div>

          <motion.div aria-hidden animate={{ backgroundPositionX: ["0%", "100%"] }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} className="absolute inset-0" style={{ backgroundImage: "linear-gradient(90deg, rgba(6,182,212,0.95), rgba(59,130,246,0.95), rgba(168,85,247,0.95), rgba(244,63,94,0.95), rgba(34,211,238,0.95))", backgroundSize: "300% 100%" }} />

          <div className="relative mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-6 px-6 py-12 backdrop-blur-[2px]">
            <PentagonNet side="left" />

            <div className="min-w-0 text-center">
              <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-white/90">Shop Name</div>
              <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} className="truncate text-4xl font-extrabold italic text-white drop-shadow md:text-6xl" style={{ fontFamily: "cursive" }}>{shopName || "Your Shop"}</motion.div>
            </div>

            <PentagonNet side="right" />
          </div>
        </div>
      </motion.footer>

      {showSettings && (
        <div className="fixed bottom-28 left-1/2 z-50 w-[90%] max-w-xs -translate-x-1/2 rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-3 shadow-[var(--shadow)] backdrop-blur-xl">
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-[var(--foreground)] transition hover:bg-white/5" onClick={handleSetting}><Package size={18} />Inventory</button>
          <button className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-red-400 transition hover:bg-red-500/10" onClick={handleLogout}><LogOut size={18} />Logout</button>
        </div>
      )}

      <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 w-[92%] max-w-xl">
        <div className="grid grid-cols-4 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] p-2 shadow-[var(--shadow)] backdrop-blur-xl md:gap-6 md:px-5 md:py-3">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = pathname === tab.path;

            return (
              <button key={tab.path} onClick={() => { router.push(tab.path); setShowSettings(false); }} className="flex flex-col items-center justify-center rounded-full px-1 py-2 text-[10px] font-medium transition md:text-xs">
                <Icon size={20} className={isActive ? "mb-1 text-cyan-400" : "mb-1 text-[var(--soft)]"} />
                <span className={isActive ? "text-cyan-400" : "text-[var(--soft)]"}>{tab.label}</span>
              </button>
            );
          })}

          <button onClick={() => setShowSettings(!showSettings)} className="flex flex-col items-center justify-center rounded-full px-1 py-2 text-[10px] font-medium transition md:text-xs">
            <Settings size={20} className="mb-1 text-[var(--soft)]" />
            <span className="text-[var(--soft)]">Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}

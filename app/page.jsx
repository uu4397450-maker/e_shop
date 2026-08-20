"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";





export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.target);

    const res = await fetch("/api/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });

    const data = await res.json();

    if (data.success) {
      // Store authentication token
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      router.replace("/home"); // ✅ correct navigation
    } else {
      alert(data.error || "Login failed");
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2 bg-gradient-to-br from-[#020617] via-[#020617] to-black">

      {/* LEFT SIDE */}
      <motion.div
        initial={{ opacity: 0, x: -60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8 }}
        className="hidden md:flex flex-col items-center justify-center gap-8 p-10"
      >
        <h1 className="text-6xl font-bold text-white leading-tight">
          <span className="block">
            <span className="text-blue-500">Digital</span> Shop
          </span>
          <span className="block text-cyan-400">
            Management
          </span>
        </h1>

        <div className="relative mt-6">
          <div className="absolute inset-0 rounded-3xl bg-cyan-500/20 blur-3xl scale-110" />

          <motion.img
            src="/shopImage.png"
            alt="Shop Management"
            className="relative w-[460px] rounded-3xl mix-blend-lighten opacity-95
              drop-shadow-[0_25px_60px_rgba(0,180,255,0.25)]"
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
          />
        </div>
      </motion.div>

      {/* RIGHT SIDE – LOGIN */}
      <div className="flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-md backdrop-blur-xl bg-white/10
            border border-white/20 rounded-2xl shadow-2xl p-8 text-white"
        >
          <h2 className="text-3xl font-bold text-center mb-2">
            Shop Login
          </h2>
          <p className="text-center text-white/70 mb-8">
            Login to manage your shop
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="text-sm">Email</label>
              <input
                type="email"
                name="email"
                required
                className="w-full mt-1 px-4 py-3 rounded-lg bg-white/20
                  border border-white/30 focus:ring-2 focus:ring-cyan-400
                  focus:outline-none"
                placeholder="owner@shop.com"
              />
            </div>

            <div>
              <label className="text-sm">Password</label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
                  className="w-full px-4 py-3 rounded-lg bg-white/20
                    border border-white/30 focus:ring-2 focus:ring-cyan-400
                    focus:outline-none"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-sm text-cyan-400"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="w-full py-3 rounded-lg
                bg-gradient-to-r from-cyan-400 to-blue-500
                text-black font-semibold shadow-lg"
            >
              Login
            </motion.button>
          </form>

          <p className="text-center text-sm text-white/70 mt-6">
            New shop?{" "}
            <a href="/signup" className="text-cyan-400 hover:underline">
              Create account
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}








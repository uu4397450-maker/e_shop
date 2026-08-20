import { supabase } from "@/lib/db";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // 1. Fetch user by email
    const { data: user, error: fetchErr } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (fetchErr) {
      console.error("Supabase user fetch error:", fetchErr);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 2. Validate password
    const isValid = bcrypt.compareSync(password, user.password);

    if (!isValid) {
      return NextResponse.json({ error: "Wrong password" }, { status: 401 });
    }

    // 3. Create session token
    const token = Buffer.from(`${user.id}:${Date.now()}`).toString("base64");

    const res = NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        shop_name: user.shop_name,
      },
    });

    // 4. Set authentication cookie
    res.cookies.set({
      name: "authToken",
      value: token,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });

    return res;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { supabase } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req) {
  try {
    const { email, password, shop_name } = await req.json();

    if (!email || !password || !shop_name) {
      return Response.json({ error: "Missing fields" }, { status: 400 });
    }

    // 1. Check if user already exists
    const { data: existingUser, error: fetchErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (fetchErr) {
      console.error("Supabase user lookup error:", fetchErr);
      return Response.json(
        { error: "Database error checking user" },
        { status: 500 }
      );
    }

    if (existingUser) {
      return Response.json({ error: "User already exists" }, { status: 400 });
    }

    // 2. Hash password & insert new user
    const hashedPassword = bcrypt.hashSync(password, 10);

    const { data: newUser, error: insertErr } = await supabase
      .from("users")
      .insert([{ email, password: hashedPassword, shop_name }])
      .select("id, email, shop_name")
      .single();

    if (insertErr) {
      console.error("Supabase user creation error:", insertErr);
      return Response.json(
        { error: insertErr.message || "Failed to create user" },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      user: newUser,
    });
  } catch (err) {
    console.error("Unexpected signup error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
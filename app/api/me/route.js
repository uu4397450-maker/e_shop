import { supabase } from "@/lib/db";
import { NextResponse } from "next/server";

function decodeToken(token) {
  try {
    const raw = Buffer.from(token, "base64").toString("utf8");
    const [id] = raw.split(":");

    const userId = Number(id);

    if (!Number.isFinite(userId)) return null;

    return userId;
  } catch {
    return null;
  }
}

export async function GET(req) {
  try {
    // Get auth token
    const token = req.cookies.get("authToken")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get logged-in user ID
    const userId = decodeToken(token);

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user from Supabase
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, shop_name")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Supabase user lookup error:", error);

      return NextResponse.json(
        { error: "Database error" },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json({ user });

  } catch (error) {
    console.error("User API error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

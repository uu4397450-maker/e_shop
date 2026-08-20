import { supabase } from "@/lib/db";
import { NextResponse } from "next/server";

// ---------------------------------------------
// Decode authToken
// ---------------------------------------------
function decodeToken(token) {
  try {
    const raw = Buffer.from(token, "base64").toString("utf8");
    const [id] = raw.split(":");

    const userId = Number(id);

    if (!Number.isFinite(userId)) {
      return null;
    }

    return userId;
  } catch {
    return null;
  }
}

// ---------------------------------------------
// GET Customers
// ---------------------------------------------
export async function GET(req) {
  try {
    // -----------------------------------------
    // 1. Get authentication token
    // -----------------------------------------
    const token = req.cookies.get("authToken")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // -----------------------------------------
    // 2. Get logged-in user ID
    // -----------------------------------------
    const userId = decodeToken(token);

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // -----------------------------------------
    // 3. Get customers belonging to this user
    // -----------------------------------------
    const { data: customers, error: customersError } = await supabase
      .from("customers")
      .select("id, phone")
      .eq("user_id", userId)
      .order("id", { ascending: false });

    if (customersError) {
      console.error("Customers fetch error:", customersError);

      return NextResponse.json(
        { error: customersError.message },
        { status: 500 }
      );
    }

    const customerList = customers || [];

    // -----------------------------------------
    // 4. Get customer IDs
    // -----------------------------------------
    const customerIds = customerList.map(
      (customer) => customer.id
    );

    // No customers
    if (customerIds.length === 0) {
      return NextResponse.json([]);
    }

    // -----------------------------------------
    // 5. Get orders belonging to this user
    // -----------------------------------------
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select(`
        id,
        customer_id,
        total_amount,
        paid_amount,
        debt_amount,
        created_at
      `)
      .eq("user_id", userId)
      .in("customer_id", customerIds);

    if (ordersError) {
      console.error("Orders fetch error:", ordersError);

      return NextResponse.json(
        { error: ordersError.message },
        { status: 500 }
      );
    }

    // -----------------------------------------
    // 6. Calculate statistics for each customer
    // -----------------------------------------
    const statsMap = {};

    for (const customer of customerList) {
      statsMap[customer.id] = {
        orders_count: 0,
        total_amount: 0,
        paid_amount: 0,
        debt_amount: 0,
        last_order_at: null,
      };
    }

    for (const order of orders || []) {
      const customerId = order.customer_id;

      if (!statsMap[customerId]) {
        continue;
      }

      const stats = statsMap[customerId];

      stats.orders_count += 1;

      stats.total_amount += Number(order.total_amount || 0);

      stats.paid_amount += Number(order.paid_amount || 0);

      stats.debt_amount += Number(order.debt_amount || 0);

      // Find latest order
      if (
        !stats.last_order_at ||
        new Date(order.created_at) >
          new Date(stats.last_order_at)
      ) {
        stats.last_order_at = order.created_at;
      }
    }

    // -----------------------------------------
    // 7. Build final response
    // -----------------------------------------
    const response = customerList.map((customer) => {
      const stats = statsMap[customer.id];

      return {
        id: customer.id,
        phone: customer.phone,

        orders_count: stats.orders_count,

        total_amount: stats.total_amount,

        paid_amount: stats.paid_amount,

        debt_amount: stats.debt_amount,

        last_order_at: stats.last_order_at,
      };
    });

    // -----------------------------------------
    // 8. Return response
    // -----------------------------------------
    return NextResponse.json(response);

  } catch (error) {
    console.error("Customers API error:", error);

    return NextResponse.json(
      {
        error: error?.message || "Failed to fetch customers",
      },
      {
        status: 500,
      }
    );
  }
}

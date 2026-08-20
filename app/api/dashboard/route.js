import { supabase } from "@/lib/db";
import { NextResponse } from "next/server";

// ---------------------------------------------
// Decode your existing authToken
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
// Convert value safely to number
// ---------------------------------------------
function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// ---------------------------------------------
// Format date as YYYY-MM-DD
// ---------------------------------------------
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// ---------------------------------------------
// GET Dashboard Report
// ---------------------------------------------
export async function GET(req) {
  try {
    // -----------------------------------------
    // 1. Check authentication
    // -----------------------------------------
    const token = req.cookies.get("authToken")?.value;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    // -----------------------------------------
    // 2. Get logged-in user's ID
    // -----------------------------------------
    const userId = decodeToken(token);

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    // -----------------------------------------
    // 3. Get date range
    // -----------------------------------------
    const { searchParams } = new URL(req.url);

    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const hasRange = Boolean(from && to);

    let fromStart = null;
    let toEnd = null;

    if (hasRange) {
      fromStart = `${from}T00:00:00`;
      toEnd = `${to}T23:59:59.999`;
    }

    // -----------------------------------------
    // 4. Fetch orders belonging to this user
    // -----------------------------------------
    let ordersQuery = supabase
      .from("orders")
      .select(`
        id,
        customer_id,
        user_id,
        total_amount,
        paid_amount,
        debt_amount,
        created_at
      `)
      .eq("user_id", userId);

    if (hasRange) {
      ordersQuery = ordersQuery
        .gte("created_at", fromStart)
        .lte("created_at", toEnd);
    }

    const { data: orders, error: ordersError } = await ordersQuery
      .order("created_at", { ascending: false })
      .limit(500);

    if (ordersError) {
      console.error("Orders fetch error:", ordersError);

      return NextResponse.json(
        {
          success: false,
          error: ordersError.message,
        },
        { status: 500 }
      );
    }

    const userOrders = orders || [];

    // -----------------------------------------
    // 5. Calculate order totals
    // -----------------------------------------
    let totalSales = 0;
    let totalIncome = 0;
    let totalDebt = 0;

    for (const order of userOrders) {
      totalSales += toNumber(order.total_amount);
      totalIncome += toNumber(order.paid_amount);
      totalDebt += toNumber(order.debt_amount);
    }

    // -----------------------------------------
    // 6. Count customers belonging to user
    // -----------------------------------------
    const { count: customersCount, error: customersError } =
      await supabase
        .from("customers")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("user_id", userId);

    if (customersError) {
      console.error("Customers count error:", customersError);

      return NextResponse.json(
        {
          success: false,
          error: customersError.message,
        },
        { status: 500 }
      );
    }

    // -----------------------------------------
    // 7. Count products belonging to user
    // -----------------------------------------
    const { count: productsCount, error: productsError } =
      await supabase
        .from("products")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("user_id", userId);

    if (productsError) {
      console.error("Products count error:", productsError);

      return NextResponse.json(
        {
          success: false,
          error: productsError.message,
        },
        { status: 500 }
      );
    }

    // -----------------------------------------
    // 8. Get sales series
    // -----------------------------------------
    let salesOrdersQuery = supabase
      .from("orders")
      .select(`
        total_amount,
        paid_amount,
        created_at
      `)
      .eq("user_id", userId);

    if (hasRange) {
      salesOrdersQuery = salesOrdersQuery
        .gte("created_at", fromStart)
        .lte("created_at", toEnd);
    } else {
      // Last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

      salesOrdersQuery = salesOrdersQuery.gte(
        "created_at",
        sevenDaysAgo.toISOString()
      );
    }

    const {
      data: salesOrders,
      error: salesOrdersError,
    } = await salesOrdersQuery;

    if (salesOrdersError) {
      console.error("Sales series error:", salesOrdersError);

      return NextResponse.json(
        {
          success: false,
          error: salesOrdersError.message,
        },
        { status: 500 }
      );
    }

    // -----------------------------------------
    // 9. Group sales by day
    // -----------------------------------------
    const salesByDay = {};

    for (const order of salesOrders || []) {
      const date = new Date(order.created_at);

      if (Number.isNaN(date.getTime())) {
        continue;
      }

      const day = formatDate(date);

      if (!salesByDay[day]) {
        salesByDay[day] = {
          sales: 0,
          income: 0,
        };
      }

      salesByDay[day].sales += toNumber(order.total_amount);
      salesByDay[day].income += toNumber(order.paid_amount);
    }

    const salesSeries = Object.entries(salesByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, values]) => ({
        day,
        sales: toNumber(values.sales),
        income: toNumber(values.income),
      }));

    // -----------------------------------------
    // 10. Report orders
    // -----------------------------------------
    let reportOrdersQuery = supabase
      .from("orders")
      .select(`
        id,
        customer_id,
        total_amount,
        paid_amount,
        debt_amount,
        created_at
      `)
      .eq("user_id", userId);

    if (hasRange) {
      reportOrdersQuery = reportOrdersQuery
        .gte("created_at", fromStart)
        .lte("created_at", toEnd);
    }

    const {
      data: reportOrdersData,
      error: reportOrdersError,
    } = await reportOrdersQuery
      .order("created_at", { ascending: false })
      .limit(hasRange ? 500 : 200);

    if (reportOrdersError) {
      console.error("Report orders error:", reportOrdersError);

      return NextResponse.json(
        {
          success: false,
          error: reportOrdersError.message,
        },
        { status: 500 }
      );
    }

    const reportOrdersRaw = reportOrdersData || [];

    // -----------------------------------------
    // 11. Get customer phone numbers
    // -----------------------------------------
    const customerIds = [
      ...new Set(
        reportOrdersRaw
          .map((order) => order.customer_id)
          .filter((id) => id !== null && id !== undefined)
      ),
    ];

    const customerMap = {};

    if (customerIds.length > 0) {
      const { data: customers, error: customerFetchError } =
        await supabase
          .from("customers")
          .select("id, phone")
          .eq("user_id", userId)
          .in("id", customerIds);

      if (customerFetchError) {
        console.error(
          "Customer phone fetch error:",
          customerFetchError
        );

        return NextResponse.json(
          {
            success: false,
            error: customerFetchError.message,
          },
          { status: 500 }
        );
      }

      for (const customer of customers || []) {
        customerMap[customer.id] = customer.phone;
      }
    }

    const reportOrders = reportOrdersRaw.map((order) => ({
      id: Number(order.id),
      createdAt: order.created_at,
      phone: customerMap[order.customer_id] || null,
      totalAmount: toNumber(order.total_amount),
      paidAmount: toNumber(order.paid_amount),
      debtAmount: toNumber(order.debt_amount),
    }));

    // -----------------------------------------
    // 12. Get order IDs for top products
    // -----------------------------------------
    const orderIds = userOrders.map((order) => order.id);

    let topProducts = [];

    if (orderIds.length > 0) {
      const { data: orderItems, error: orderItemsError } =
        await supabase
          .from("order_items")
          .select(`
            id,
            order_id,
            item_name,
            quantity,
            total_price,
            user_id
          `)
          .eq("user_id", userId)
          .in("order_id", orderIds);

      if (orderItemsError) {
        console.error("Order items error:", orderItemsError);

        return NextResponse.json(
          {
            success: false,
            error: orderItemsError.message,
          },
          { status: 500 }
        );
      }

      // -----------------------------------------
      // 13. Group products
      // -----------------------------------------
      const productMap = {};

      for (const item of orderItems || []) {
        const name = item.item_name || "Unknown Product";

        if (!productMap[name]) {
          productMap[name] = {
            name,
            qty: 0,
            amount: 0,
          };
        }

        productMap[name].qty += toNumber(item.quantity);
        productMap[name].amount += toNumber(item.total_price);
      }

      topProducts = Object.values(productMap)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 6)
        .map((item) => ({
          name: item.name,
          qty: toNumber(item.qty),
          amount: toNumber(item.amount),
        }));
    }

    // -----------------------------------------
    // 14. Final response
    // -----------------------------------------
    return NextResponse.json({
      success: true,

      totals: {
        ordersCount: userOrders.length,
        customersCount: Number(customersCount || 0),
        productsCount: Number(productsCount || 0),

        totalSales: totalSales,
        totalIncome: totalIncome,
        totalDebt: totalDebt,
      },

      sales7d: salesSeries,

      topProducts,

      reportOrders,
    });
  } catch (err) {
    console.error("Dashboard API error:", err);

    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Failed to build dashboard",
      },
      { status: 500 }
    );
  }
}

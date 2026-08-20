import { supabase } from "@/lib/db";

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

export async function GET(req, context) {
  try {
    const params = await context?.params;
    const idFromParams = params?.id;
    const idFromUrl = req?.url
      ? req.url.split("?")[0].split("/").pop()
      : undefined;
    const id = Number(idFromParams ?? idFromUrl);

    if (!Number.isFinite(id)) {
      return Response.json(
        { message: "Invalid customer id" },
        { status: 400 }
      );
    }

    const token = req.cookies.get("authToken")?.value;

    if (!token) {
      return Response.json(
        { message: "User not authenticated" },
        { status: 401 }
      );
    }

    const userId = decodeToken(token);

    if (!Number.isFinite(userId)) {
      return Response.json(
        { message: "User not authenticated" },
        { status: 401 }
      );
    }

    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, phone, user_id")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (custErr) {
      console.error("Customer fetch error:", custErr);
      return Response.json(
        { message: custErr.message },
        { status: 500 }
      );
    }

    if (!customer) {
      return Response.json(
        { message: "Customer not found" },
        { status: 404 }
      );
    }

    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select(
        "id, customer_id, user_id, total_amount, paid_amount, debt_amount, created_at"
      )
      .eq("customer_id", id)
      .eq("user_id", userId)
      .order("id", { ascending: false });

    if (ordersErr) {
      console.error("Orders fetch error:", ordersErr);
      return Response.json(
        { message: ordersErr.message },
        { status: 500 }
      );
    }

    const orderIds = (orders || []).map((order) => order.id);
    const itemsByOrderId = {};

    if (orderIds.length > 0) {
      const { data: items, error: itemsErr } = await supabase
        .from("order_items")
        .select("id, order_id, item_name, item_price, quantity, total_price")
        .in("order_id", orderIds)
        .order("id", { ascending: true });

      if (itemsErr) {
        console.error("Order items fetch error:", itemsErr);
        return Response.json(
          { message: itemsErr.message },
          { status: 500 }
        );
      }

      for (const item of items || []) {
        if (!itemsByOrderId[item.order_id]) {
          itemsByOrderId[item.order_id] = [];
        }

        itemsByOrderId[item.order_id].push(item);
      }
    }

    return Response.json({
      customer: {
        id: customer.id,
        phone: customer.phone,
      },
      orders: (orders || []).map((order) => ({
        id: order.id,
        customer_id: order.customer_id,
        total_amount: order.total_amount,
        paid_amount: order.paid_amount,
        debt_amount: order.debt_amount,
        created_at: order.created_at,
        items: itemsByOrderId[order.id] || [],
      })),
    });
  } catch (error) {
    console.error("Supabase API Error:", error);
    return Response.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

import { supabase } from "@/lib/db";
import { NextResponse } from "next/server";

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

export async function POST(req) {
  try {
    /*
     * ---------------------------------------
     * GET AUTH USER
     * ---------------------------------------
     */

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

    const userId = decodeToken(token);

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid authentication",
        },
        { status: 401 }
      );
    }


    /*
     * ---------------------------------------
     * REQUEST BODY
     * ---------------------------------------
     */

    const body = await req.json();

    const rawPhone = String(body.phone ?? "").trim();
    const customerPhone = rawPhone || null;

    const paidAmount = Number(body.paidAmount || 0);

    const cart = Array.isArray(body.cart)
      ? body.cart
      : [];


    if (cart.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Cart is empty",
        },
        { status: 400 }
      );
    }


    /*
     * ---------------------------------------
     * VALIDATE CART
     * ---------------------------------------
     */

    const items = cart.map((item) => ({
      product_id: Number(item.product_id ?? item.id),

      unit_id:
        item.unit_id === null ||
        item.unit_id === undefined ||
        item.unit_id === ""
          ? null
          : Number(item.unit_id),

      quantity: Number(item.quantity),
      price: Number(item.price || 0),
    }));


    for (const item of items) {

      if (!Number.isFinite(item.product_id)) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid product",
          },
          { status: 400 }
        );
      }

      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid quantity",
          },
          { status: 400 }
        );
      }

      if (
        item.unit_id !== null &&
        !Number.isFinite(item.unit_id)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid unit",
          },
          { status: 400 }
        );
      }
    }

    const totalAmount = cart.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );

    const normalizedPaidAmount = Number.isFinite(paidAmount) ? paidAmount : 0;
    const debtAmount = Math.max(totalAmount - normalizedPaidAmount, 0);
    const changeAmount = Math.max(normalizedPaidAmount - totalAmount, 0);

    let customerQuery = supabase
      .from("customers")
      .select("id")
      .eq("user_id", userId);

    if (customerPhone === null) {
      customerQuery = customerQuery.is("phone", null);
    } else {
      customerQuery = customerQuery.eq("phone", customerPhone);
    }

    const { data: customerRow, error: customerError } = await customerQuery.maybeSingle();

    if (customerError) {
      console.error("Customer lookup error:", customerError);
      return NextResponse.json(
        { success: false, error: customerError.message },
        { status: 500 }
      );
    }

    let customerId = customerRow?.id ?? null;

    if (!customerId) {
      const { data: createdCustomer, error: createCustomerError } = await supabase
        .from("customers")
        .insert({ user_id: userId, phone: customerPhone })
        .select("id")
        .single();

      if (createCustomerError) {
        console.error("Customer create error:", createCustomerError);
        return NextResponse.json(
          { success: false, error: createCustomerError.message },
          { status: 500 }
        );
      }

      customerId = createdCustomer?.id ?? null;
    }

    const { data: orderRow, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        customer_id: customerId,
        total_amount: totalAmount,
        paid_amount: normalizedPaidAmount,
        debt_amount: debtAmount,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (orderError) {
      console.error("Order create error:", orderError);
      return NextResponse.json(
        { success: false, error: orderError.message },
        { status: 500 }
      );
    }

    const orderItems = cart.map((item) => ({
      user_id: userId,
      order_id: orderRow.id,
      item_name: item.name || "Product",
      item_price: Number(item.price || 0),
      quantity: Number(item.quantity || 0),
      total_price: Number(item.price || 0) * Number(item.quantity || 0),
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      console.error("Order items insert error:", itemsError);
      return NextResponse.json(
        { success: false, error: itemsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      orderId: orderRow.id,
      customerId,
      totalAmount,
      paidAmount: normalizedPaidAmount,
      debtAmount,
      changeAmount,
    });

  } catch (error) {

    console.error("Sale API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to create sale",
      },
      { status: 500 }
    );
  }
}

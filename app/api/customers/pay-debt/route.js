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
// POST - Make customer debt payment
// ---------------------------------------------
export async function POST(req) {
  try {
    // -----------------------------------------
    // 1. Check authentication
    // -----------------------------------------
    const token = req.cookies.get("authToken")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    // -----------------------------------------
    // 2. Get logged-in user ID
    // -----------------------------------------
    const userId = decodeToken(token);

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    // -----------------------------------------
    // 3. Read request body
    // -----------------------------------------
    const { customerId, paymentAmount } = await req.json();

    const customerIdNumber = Number(customerId);
    const payment = Number(paymentAmount);

    if (
      !Number.isFinite(customerIdNumber) ||
      !Number.isFinite(payment) ||
      payment <= 0
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid payment data" },
        { status: 400 }
      );
    }

    // -----------------------------------------
    // 4. Verify customer belongs to this user
    // -----------------------------------------
    const { data: customer, error: customerErr } = await supabase
      .from("customers")
      .select("id, phone, user_id")
      .eq("id", customerIdNumber)
      .eq("user_id", userId)
      .maybeSingle();

    if (customerErr) {
      console.error("Customer lookup error:", customerErr);

      return NextResponse.json(
        { success: false, message: customerErr.message },
        { status: 500 }
      );
    }

    if (!customer) {
      return NextResponse.json(
        {
          success: false,
          message: "Customer not found",
        },
        { status: 404 }
      );
    }

    // -----------------------------------------
    // 5. Fetch customer's outstanding orders
    // Only this user's orders
    // Oldest debt first (FIFO)
    // -----------------------------------------
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select(
        "id, customer_id, user_id, debt_amount, paid_amount, total_amount, created_at"
      )
      .eq("customer_id", customerIdNumber)
      .eq("user_id", userId)
      .gt("debt_amount", 0)
      .order("created_at", { ascending: true });

    if (ordersErr) {
      console.error("Orders fetch error:", ordersErr);

      return NextResponse.json(
        { success: false, message: ordersErr.message },
        { status: 500 }
      );
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "No outstanding debt found",
        },
        { status: 400 }
      );
    }

    // -----------------------------------------
    // 6. Calculate total outstanding debt
    // -----------------------------------------
    const totalDebt = orders.reduce(
      (sum, order) => sum + Number(order.debt_amount || 0),
      0
    );

    // -----------------------------------------
    // 7. Prevent payment from exceeding debt
    // -----------------------------------------
    const actualPayment = Math.min(payment, totalDebt);

    let remainingPayment = actualPayment;

    const updatedOrders = [];

    // -----------------------------------------
    // 8. Distribute payment FIFO
    // -----------------------------------------
    for (const order of orders) {
      if (remainingPayment <= 0) {
        break;
      }

      const currentDebt = Number(order.debt_amount || 0);
      const currentPaid = Number(order.paid_amount || 0);

      const paymentForOrder = Math.min(
        remainingPayment,
        currentDebt
      );

      const newPaidAmount =
        currentPaid + paymentForOrder;

      const newDebtAmount =
        currentDebt - paymentForOrder;

      // ---------------------------------------
      // 9. Update order
      // ---------------------------------------
      const { error: updateErr } = await supabase
        .from("orders")
        .update({
          paid_amount: newPaidAmount,
          debt_amount: newDebtAmount,
        })
        .eq("id", order.id)
        .eq("user_id", userId)
        .eq("customer_id", customerIdNumber);

      if (updateErr) {
        console.error(
          `Order ${order.id} update error:`,
          updateErr
        );

        throw updateErr;
      }

      updatedOrders.push({
        orderId: order.id,
        paymentApplied: paymentForOrder,
        previousDebt: currentDebt,
        remainingDebt: newDebtAmount,
      });

      remainingPayment -= paymentForOrder;
    }

    // -----------------------------------------
    // 10. Calculate remaining customer debt
    // -----------------------------------------
    const remainingDebt = Math.max(
      0,
      totalDebt - actualPayment
    );

    // -----------------------------------------
    // 11. Return result
    // -----------------------------------------
    return NextResponse.json({
      success: true,

      customer: {
        id: customer.id,
        phone: customer.phone,
      },

      paymentAmount: actualPayment,

      requestedPayment: payment,

      remainingPayment: Math.max(
        0,
        payment - totalDebt
      ),

      previousDebt: totalDebt,

      remainingDebt,

      updatedOrders,
    });
  } catch (err) {
    console.error(
      "Error processing debt payment:",
      err
    );

    return NextResponse.json(
      {
        success: false,
        error:
          err?.message ||
          "Failed to process payment",
      },
      {
        status: 500,
      }
    );
  }
}

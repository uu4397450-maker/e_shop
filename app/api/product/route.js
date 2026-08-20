import { supabase } from "@/lib/db";
import { NextResponse } from "next/server";

// =============================================
// Decode authToken
// =============================================
function decodeToken(token) {
  try {
    const raw = Buffer.from(token, "base64").toString("utf8");
    const [id] = raw.split(":");

    const userId = Number(id);

    if (!Number.isFinite(userId)) {
      return null;
    }

    return userId;
  } catch (error) {
    console.error("Token decode error:", error);
    return null;
  }
}

// =============================================
// Get logged-in user ID
// =============================================
function getUserId(req) {
  const token = req.cookies.get("authToken")?.value;

  if (!token) {
    return null;
  }

  return decodeToken(token);
}

// =============================================
// GET PRODUCTS
// =============================================
export async function GET(req) {
  try {
    const userId = getUserId(req);

    console.log("GET PRODUCTS USER ID:", userId);

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const {
      data: products,
      error,
    } = await supabase
      .from("products")
      .select(`
        id,
        name,
        description,
        price,
        image,
        status,
        barcode,
        stock,
        createdAt,
        user_id,
        base_unit_id,
        min_stock,
        purchase_price,
        selling_price,

        product_units (
          id,
          product_id,
          unit_name,
          unit_symbol,
          unit_type,
          conversion_to_base,
          purchase_price,
          selling_price,
          barcode,
          is_base_unit,
          is_active,
          created_at
        )
      `)
      .eq("user_id", userId)
      .order("id", {
        ascending: false,
      });

    if (error) {
      console.error("GET PRODUCTS SUPABASE ERROR:", error);

      return NextResponse.json(
        {
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
        { status: 500 }
      );
    }

    console.log("PRODUCTS FOUND:", products);

    // IMPORTANT:
    // The variable is `products`, not `data`
    return NextResponse.json(products || []);

  } catch (error) {
    console.error("GET PRODUCTS ERROR:", error);

    return NextResponse.json(
      {
        error: error?.message || "Failed to fetch products",
      },
      { status: 500 }
    );
  }
}

// =============================================
// POST PRODUCT
// =============================================
export async function POST(req) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();

    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json(
        { error: "Product name is required" },
        { status: 400 }
      );
    }

    if (!body.base_unit) {
      return NextResponse.json(
        { error: "Base unit is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.units) || body.units.length === 0) {
      return NextResponse.json(
        { error: "At least one unit is required" },
        { status: 400 }
      );
    }

    // ---------------------------------------------
    // Find base unit from submitted units
    // ---------------------------------------------
    const baseUnit = body.units.find(
      (unit) => unit.is_base_unit === true
    );

    if (!baseUnit) {
      return NextResponse.json(
        { error: "Please mark one unit as the base unit" },
        { status: 400 }
      );
    }

    // ---------------------------------------------
    // Insert product
    // ---------------------------------------------
    const productPayload = {
      user_id: userId,
      name: String(body.name).trim(),
      description: body.description || null,

      price: Number(body.price || 0),

      image: body.image || null,
      status: body.status || "Available",
      barcode: body.barcode || null,

      stock: Number(body.stock || 0),

      min_stock: Number(body.min_stock || 0),

      purchase_price: Number(body.purchase_price || 0),

      selling_price: Number(
        body.selling_price ||
        body.price ||
        0
      ),

      createdAt: new Date().toISOString(),
    };

    const { data: product, error: productError } = await supabase
      .from("products")
      .insert(productPayload)
      .select("*")
      .single();

    if (productError) {
      console.error("PRODUCT INSERT ERROR:", productError);

      return NextResponse.json(
        {
          error: productError.message,
          details: productError.details,
          hint: productError.hint,
          code: productError.code,
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------
    // Insert units
    // ---------------------------------------------
    const unitsPayload = body.units.map((unit) => ({
      product_id: product.id,
      user_id: userId,

      unit_name: String(
        unit.name ||
        unit.unit_name ||
        ""
      ).trim(),

      unit_symbol: unit.symbol || unit.unit_symbol || null,

      unit_type: unit.type || unit.unit_type || "custom",

      conversion_to_base: Number(
        unit.conversion ||
        unit.conversion_to_base ||
        1
      ),

      purchase_price: Number(
        unit.purchase_price ||
        unit.purchasePrice ||
        0
      ),

      selling_price: Number(
        unit.price ||
        unit.selling_price ||
        0
      ),

      barcode: unit.barcode || null,

      is_base_unit:
        unit.is_base_unit === true ||
        unit.name === body.base_unit,

      is_active:
        unit.is_active !== false,
    }));

    const { data: units, error: unitsError } = await supabase
      .from("product_units")
      .insert(unitsPayload)
      .select("*");

    if (unitsError) {
      console.error("UNIT INSERT ERROR:", unitsError);

      // Remove product if units fail
      await supabase
        .from("products")
        .delete()
        .eq("id", product.id)
        .eq("user_id", userId);

      return NextResponse.json(
        {
          error: unitsError.message,
          details: unitsError.details,
          hint: unitsError.hint,
          code: unitsError.code,
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------
    // Find base unit ID
    // ---------------------------------------------
    const insertedBaseUnit = units?.find(
      (unit) => unit.is_base_unit === true
    );

    if (insertedBaseUnit) {
      await supabase
        .from("products")
        .update({
          base_unit_id: insertedBaseUnit.id,
        })
        .eq("id", product.id)
        .eq("user_id", userId);
    }

    return NextResponse.json(
      {
        success: true,
        message: "Product Added",
        product,
        units,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST PRODUCT ERROR:", error);

    return NextResponse.json(
      {
        error: error?.message || "Failed to add product",
      },
      { status: 500 }
    );
  }
}

// =============================================
// PUT PRODUCT
// =============================================
export async function PUT(req) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();

    if (!body.id) {
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400 }
      );
    }

    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json(
        { error: "Product name is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.units) || body.units.length === 0) {
      return NextResponse.json(
        { error: "At least one unit is required" },
        { status: 400 }
      );
    }

    // ---------------------------------------------
    // Check product belongs to logged-in user
    // ---------------------------------------------
    const { data: existingProduct, error: existingError } =
      await supabase
        .from("products")
        .select("id")
        .eq("id", body.id)
        .eq("user_id", userId)
        .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      );
    }

    if (!existingProduct) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // ---------------------------------------------
    // Find base unit
    // ---------------------------------------------
    const baseUnit = body.units.find(
      (unit) =>
        unit.name === body.base_unit ||
        unit.unit_name === body.base_unit ||
        unit.is_base_unit === true
    );

    if (!baseUnit) {
      return NextResponse.json(
        { error: "Base unit was not found in units" },
        { status: 400 }
      );
    }

    // ---------------------------------------------
    // Update product
    // ---------------------------------------------
    const productUpdate = {
      name: String(body.name).trim(),

      description: body.description || null,

      price: Number(body.price || 0),

      image: body.image || null,

      status: body.status || "Available",

      barcode: body.barcode || null,

      stock: Number(body.stock || 0),

      min_stock: Number(body.min_stock || 0),

      purchase_price: Number(body.purchase_price || 0),

      selling_price: Number(
        body.selling_price ||
        body.price ||
        0
      ),
    };

    const { data: product, error: productError } =
      await supabase
        .from("products")
        .update(productUpdate)
        .eq("id", body.id)
        .eq("user_id", userId)
        .select("*")
        .single();

    if (productError) {
      console.error("PRODUCT UPDATE ERROR:", productError);

      return NextResponse.json(
        {
          error: productError.message,
          details: productError.details,
          hint: productError.hint,
          code: productError.code,
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------
    // Delete existing units
    // ---------------------------------------------
    const { error: deleteUnitsError } = await supabase
      .from("product_units")
      .delete()
      .eq("product_id", body.id)
      .eq("user_id", userId);

    if (deleteUnitsError) {
      console.error(
        "DELETE OLD UNITS ERROR:",
        deleteUnitsError
      );

      return NextResponse.json(
        { error: deleteUnitsError.message },
        { status: 500 }
      );
    }

    // ---------------------------------------------
    // Create new units
    // ---------------------------------------------
    const unitsPayload = body.units.map((unit) => ({
      product_id: body.id,
      user_id: userId,

      unit_name: String(
        unit.name ||
        unit.unit_name ||
        ""
      ).trim(),

      unit_symbol:
        unit.symbol ||
        unit.unit_symbol ||
        null,

      unit_type:
        unit.type ||
        unit.unit_type ||
        "custom",

      conversion_to_base: Number(
        unit.conversion ||
        unit.conversion_to_base ||
        1
      ),

      purchase_price: Number(
        unit.purchase_price ||
        unit.purchasePrice ||
        0
      ),

      selling_price: Number(
        unit.price ||
        unit.selling_price ||
        0
      ),

      barcode: unit.barcode || null,

      is_base_unit:
        unit.is_base_unit === true ||
        unit.name === body.base_unit,

      is_active:
        unit.is_active !== false,
    }));

    const {
      data: units,
      error: unitsError,
    } = await supabase
      .from("product_units")
      .insert(unitsPayload)
      .select("*");

    if (unitsError) {
      console.error("UNIT UPDATE ERROR:", unitsError);

      return NextResponse.json(
        {
          error: unitsError.message,
          details: unitsError.details,
          hint: unitsError.hint,
          code: unitsError.code,
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------
    // Set base_unit_id
    // ---------------------------------------------
    const insertedBaseUnit = units?.find(
      (unit) => unit.is_base_unit === true
    );

    if (insertedBaseUnit) {
      const { error: baseError } = await supabase
        .from("products")
        .update({
          base_unit_id: insertedBaseUnit.id,
        })
        .eq("id", body.id)
        .eq("user_id", userId);

      if (baseError) {
        return NextResponse.json(
          { error: baseError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Product Updated",
      product,
      units,
    });
  } catch (error) {
    console.error("PUT PRODUCT ERROR:", error);

    return NextResponse.json(
      {
        error: error?.message || "Failed to update product",
      },
      { status: 500 }
    );
  }
}

// =============================================
// DELETE PRODUCT
// =============================================
export async function DELETE(req) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400 }
      );
    }

    // Delete units first
    const { error: unitsError } = await supabase
      .from("product_units")
      .delete()
      .eq("product_id", id)
      .eq("user_id", userId);

    if (unitsError) {
      return NextResponse.json(
        { error: unitsError.message },
        { status: 500 }
      );
    }

    // Delete product
    const { data, error } = await supabase
      .from("products")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("DELETE PRODUCT ERROR:", error);

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Product Deleted",
    });
  } catch (error) {
    console.error("DELETE PRODUCT ERROR:", error);

    return NextResponse.json(
      {
        error: error?.message || "Failed to delete product",
      },
      { status: 500 }
    );
  }
}
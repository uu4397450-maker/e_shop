import { supabase } from "@/lib/db";
import { NextResponse } from "next/server";

// =============================================
// AUTH
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

function getUserId(req) {
  const token = req.cookies.get("authToken")?.value;

  if (!token) {
    return null;
  }

  return decodeToken(token);
}

// =============================================
// POST /api/product/import
// =============================================

export async function POST(req) {
  try {
    console.log("=================================");
    console.log("EXCEL IMPORT STARTED");
    console.log("=================================");

    // -----------------------------------------
    // USER
    // -----------------------------------------

    const userId = getUserId(req);

    console.log("IMPORT USER ID:", userId);

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
    // BODY
    // -----------------------------------------

    const body = await req.json();

    const products = body?.products;

    if (!Array.isArray(products)) {
      return NextResponse.json(
        {
          success: false,
          error: "Products array is required",
        },
        { status: 400 }
      );
    }

    if (products.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No products found in Excel file",
        },
        { status: 400 }
      );
    }

    console.log("PRODUCT COUNT:", products.length);

    // -----------------------------------------
    // RESULTS
    // -----------------------------------------

    const imported = [];
    const errors = [];

    // =========================================
    // PROCESS EACH PRODUCT
    // =========================================

    for (let index = 0; index < products.length; index++) {
      const product = products[index];

      const rowNumber =
        product.rowNumber || index + 2;

      try {
        // -------------------------------------
        // VALIDATION
        // -------------------------------------

        if (
          !product.name ||
          !String(product.name).trim()
        ) {
          throw new Error(
            "Product name is required"
          );
        }

        if (
          !product.base_unit ||
          !String(product.base_unit).trim()
        ) {
          throw new Error(
            "Base unit is required"
          );
        }

        if (
          Number(product.stock) < 0
        ) {
          throw new Error(
            "Stock cannot be negative"
          );
        }

        // -------------------------------------
        // UNITS
        // -------------------------------------

        const units = Array.isArray(product.units)
          ? product.units
          : [];

        if (units.length === 0) {
          throw new Error(
            "At least one unit is required"
          );
        }

        // -------------------------------------
        // CHECK BASE UNIT
        // -------------------------------------

        const baseUnit = units.find((unit) => {
          const name =
            String(unit.name || "")
              .trim()
              .toLowerCase();

          const symbol =
            String(unit.symbol || "")
              .trim()
              .toLowerCase();

          const requested =
            String(product.base_unit || "")
              .trim()
              .toLowerCase();

          return (
            name === requested ||
            symbol === requested
          );
        });

        if (!baseUnit) {
          throw new Error(
            `Base unit "${product.base_unit}" was not found in units`
          );
        }

        // =====================================
        // INSERT PRODUCT
        // =====================================

        const productPayload = {
          user_id: userId,

          name: String(product.name).trim(),

          description:
            product.description
              ? String(product.description).trim()
              : null,

          price:
            Number(product.selling_price) || 0,

          stock:
            Number(product.stock) || 0,

          status:
            product.status || "Available",

          barcode:
            product.barcode
              ? String(product.barcode).trim()
              : null,

          image:
            product.image || null,

          min_stock:
            Number(product.min_stock) || 0,

          purchase_price:
            Number(product.purchase_price) || 0,

          selling_price:
            Number(product.selling_price) || 0,

          base_unit_id: null,
        };

        console.log(
          `INSERTING ROW ${rowNumber}:`,
          productPayload
        );

        const {
          data: insertedProduct,
          error: productError,
        } = await supabase
          .from("products")
          .insert(productPayload)
          .select("*")
          .single();

        if (productError) {
          throw new Error(
            `Product insert failed: ${productError.message}`
          );
        }

        if (!insertedProduct) {
          throw new Error(
            "Product was not created"
          );
        }

        const productId =
          insertedProduct.id;

        console.log(
          `PRODUCT CREATED: ${productId}`
        );

        // =====================================
        // INSERT UNITS
        // =====================================

        const unitRows = [];

        for (const unit of units) {
          if (!unit.name) {
            continue;
          }

          const unitName =
            String(unit.name).trim();

          const unitSymbol =
            String(unit.symbol || "").trim();

          const conversion =
            Number(unit.conversion);

          if (
            !Number.isFinite(conversion) ||
            conversion <= 0
          ) {
            throw new Error(
              `Invalid conversion for unit "${unitName}"`
            );
          }

          const isBaseUnit =
            unitName.toLowerCase() ===
              String(product.base_unit)
                .trim()
                .toLowerCase() ||
            unitSymbol.toLowerCase() ===
              String(product.base_unit)
                .trim()
                .toLowerCase();

          unitRows.push({
            product_id: productId,

            user_id: userId,

            unit_name: unitName,

            unit_symbol:
              unitSymbol || null,

            unit_type:
              unit.type || "custom",

            conversion_to_base:
              conversion,

            purchase_price:
              Number(unit.purchase_price) || 0,

            selling_price:
              Number(unit.selling_price) || 0,

            barcode:
              unit.barcode
                ? String(unit.barcode).trim()
                : null,

            is_base_unit:
              isBaseUnit,

            is_active: true,
          });
        }

        if (unitRows.length === 0) {
          throw new Error(
            "No valid units found"
          );
        }

        console.log(
          "INSERTING UNITS:",
          unitRows
        );

        const {
          data: insertedUnits,
          error: unitsError,
        } = await supabase
          .from("product_units")
          .insert(unitRows)
          .select("*");

        if (unitsError) {
          // Remove product if units failed
          await supabase
            .from("products")
            .delete()
            .eq("id", productId)
            .eq("user_id", userId);

          throw new Error(
            `Unit insert failed: ${unitsError.message}`
          );
        }

        // =====================================
        // FIND BASE UNIT ID
        // =====================================

        const createdBaseUnit =
          insertedUnits.find(
            (unit) =>
              unit.is_base_unit === true
          );

        if (!createdBaseUnit) {
          // Remove units and product
          await supabase
            .from("product_units")
            .delete()
            .eq("product_id", productId)
            .eq("user_id", userId);

          await supabase
            .from("products")
            .delete()
            .eq("id", productId)
            .eq("user_id", userId);

          throw new Error(
            "Base unit was not created"
          );
        }

        // =====================================
        // UPDATE PRODUCT BASE UNIT
        // =====================================

        const {
          error: baseUnitUpdateError,
        } = await supabase
          .from("products")
          .update({
            base_unit_id:
              createdBaseUnit.id,
          })
          .eq("id", productId)
          .eq("user_id", userId);

        if (baseUnitUpdateError) {
          throw new Error(
            `Failed to set base unit: ${baseUnitUpdateError.message}`
          );
        }

        // =====================================
        // STOCK MOVEMENT
        // =====================================

        const initialStock =
          Number(product.stock) || 0;

        if (initialStock > 0) {
          const {
            error: stockError,
          } = await supabase
            .from("stock_movements")
            .insert({
              user_id: userId,

              product_id: productId,

              unit_id:
                createdBaseUnit.id,

              movement_type: "opening",

              quantity: initialStock,

              base_quantity: initialStock,

              stock_before: 0,

              stock_after: initialStock,

              note: "Opening stock imported from Excel",

              reference_id: null,
            });

          if (stockError) {
            console.error(
              "Stock movement error:",
              stockError
            );

            // Don't fail the complete import
            // because product and units already exist.
          }
        }

        // =====================================
        // SUCCESS
        // =====================================

        imported.push({
          row: rowNumber,

          productId,

          name: product.name,

          units: insertedUnits.length,
        });

      } catch (error) {
        console.error(
          `IMPORT ROW ${rowNumber} ERROR:`,
          error
        );

        errors.push({
          row: rowNumber,

          message:
            error?.message ||
            "Unknown error",
        });
      }
    }

    // =========================================
    // RESPONSE
    // =========================================

    console.log(
      "IMPORT FINISHED",
      {
        imported: imported.length,
        errors: errors.length,
      }
    );

    return NextResponse.json({
      success:
        imported.length > 0,

      message:
        imported.length > 0
          ? "Import completed"
          : "No products imported",

      imported:
        imported.length,

      failed:
        errors.length,

      products:
        imported,

      errors,
    });

  } catch (error) {
    console.error(
      "IMPORT API ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "Excel import failed",
      },
      { status: 500 }
    );
  }
}
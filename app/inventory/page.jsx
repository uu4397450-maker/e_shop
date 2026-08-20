"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";

const UNIT_OPTIONS = [
  { value: "piece", label: "Piece", symbol: "pcs", type: "quantity" },
  { value: "box", label: "Box", symbol: "box", type: "package" },
  { value: "packet", label: "Packet", symbol: "pkt", type: "package" },
  { value: "carton", label: "Carton", symbol: "ctn", type: "package" },
  { value: "dozen", label: "Dozen", symbol: "doz", type: "package" },

  { value: "kg", label: "Kilogram", symbol: "kg", type: "weight" },
  { value: "g", label: "Gram", symbol: "g", type: "weight" },
  { value: "mg", label: "Milligram", symbol: "mg", type: "weight" },

  { value: "litre", label: "Litre", symbol: "L", type: "volume" },
  { value: "ml", label: "Millilitre", symbol: "ml", type: "volume" },

  { value: "meter", label: "Meter", symbol: "m", type: "length" },
  { value: "cm", label: "Centimeter", symbol: "cm", type: "length" },
  { value: "feet", label: "Feet", symbol: "ft", type: "length" },

  {
    value: "sqft",
    label: "Square Feet",
    symbol: "sq ft",
    type: "area",
  },

  {
    value: "custom",
    label: "Custom",
    symbol: "",
    type: "custom",
  },
];

const emptyUnit = {
  id: null,
  name: "",
  symbol: "",
  type: "quantity",
  conversion: 1,
  price: "",
  purchase_price: "",
  barcode: "",
  is_base_unit: false,
  is_active: true,
};

const emptyForm = {
  id: null,

  name: "",
  description: "",

  barcode: "",

  stock: "",
  min_stock: "",

  purchase_price: "",
  selling_price: "",
  price: "",

  status: "Available",

  base_unit: "piece",

  package_enabled: false,
  package_quantity: 1,

  image: "",

  units: [
    {
      ...emptyUnit,
      name: "Piece",
      symbol: "pcs",
      type: "quantity",
      conversion: 1,
      is_base_unit: true,
    },
  ],
};

function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "0.00";

  return number.toFixed(2);
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getProductUnits(product) {
  if (Array.isArray(product.units)) {
    return product.units;
  }

  if (Array.isArray(product.product_units)) {
    return product.product_units;
  }

  return [];
}

function getProductPrice(product) {
  const units = getProductUnits(product);

  if (units.length > 0) {
    const base =
      units.find(
        (unit) =>
          unit.is_base_unit === true ||
          unit.is_base_unit === 1 ||
          unit.conversion === 1 ||
          Number(unit.conversion_to_base) === 1
      ) || units[0];

    const price =
      base.price ??
      base.selling_price ??
      product.selling_price ??
      product.price ??
      0;

    return money(price);
  }

  return money(
    product.selling_price ??
      product.price ??
      product.purchase_price ??
      0
  );
}

function getStockStatus(product) {
  const stock = Number(product.stock || 0);
  const minStock = Number(product.min_stock || 0);

  if (stock <= 0) {
    return {
      text: "Out of Stock",
      className:
        "bg-red-500/10 text-red-300 border-red-400/20",
    };
  }

  if (minStock > 0 && stock <= minStock) {
    return {
      text: "Low Stock",
      className:
        "bg-yellow-500/10 text-yellow-300 border-yellow-400/20",
    };
  }

  return {
    text: "Available",
    className:
      "bg-green-500/10 text-green-300 border-green-400/20",
  };
}

export default function InventoryPage() {
  const fileInputRef = useRef(null);

  const [products, setProducts] = useState([]);

  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState(emptyForm);

  const [imagePreview, setImagePreview] = useState("");

  const [loading, setLoading] = useState(false);

  const [importing, setImporting] = useState(false);

  const [error, setError] = useState("");

  const [importResult, setImportResult] = useState(null);

  /* ============================================================
     FETCH PRODUCTS
  ============================================================ */

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    try {
      setError("");

      const res = await fetch("/api/product", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const text = await res.text();

      let data = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(
          "Server returned invalid JSON. Check /api/product route."
        );
      }

      if (!res.ok) {
        throw new Error(
          data?.error || `Failed to load products (${res.status})`
        );
      }

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.products)
        ? data.products
        : Array.isArray(data?.data)
        ? data.data
        : [];

      setProducts(list);
    } catch (err) {
      console.error("FETCH PRODUCTS:", err);
      setError(err.message || "Failed to load products");
      setProducts([]);
    }
  }

  /* ============================================================
     INPUT
  ============================================================ */

  function handleChange(e) {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  /* ============================================================
     IMAGE
  ============================================================ */

  function handleImageChange(e) {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }

    const reader = new FileReader();

    reader.onloadend = () => {
      const result = String(reader.result || "");

      setImagePreview(result);

      setFormData((prev) => ({
        ...prev,
        image: result,
      }));
    };

    reader.readAsDataURL(file);
  }

  /* ============================================================
     BASE UNIT
  ============================================================ */

  function handleBaseUnitChange(e) {
    const value = e.target.value;

    const selected = UNIT_OPTIONS.find(
      (unit) => unit.value === value
    );

    setFormData((prev) => {
      let units = [...prev.units];

      const baseIndex = units.findIndex(
        (unit) => unit.is_base_unit
      );

      const baseUnit = {
        ...emptyUnit,

        name: selected?.label || value,

        symbol: selected?.symbol || "",

        type: selected?.type || "custom",

        conversion: 1,

        price: prev.selling_price || "",

        purchase_price: prev.purchase_price || "",

        barcode: prev.barcode || "",

        is_base_unit: true,

        is_active: true,
      };

      if (baseIndex >= 0) {
        units[baseIndex] = {
          ...units[baseIndex],
          ...baseUnit,
        };
      } else {
        units.unshift(baseUnit);
      }

      units = units.map((unit, index) => ({
        ...unit,
        is_base_unit: index === 0,
      }));

      return {
        ...prev,
        base_unit: value,
        units,
      };
    });
  }

  /* ============================================================
     UNIT CHANGE
  ============================================================ */

  function updateUnit(index, field, value) {
    setFormData((prev) => {
      const units = [...prev.units];

      units[index] = {
        ...units[index],
        [field]: value,
      };

      return {
        ...prev,
        units,
      };
    });
  }

  function addUnit() {
    setFormData((prev) => ({
      ...prev,
      units: [
        ...prev.units,
        {
          ...emptyUnit,
          name: "",
          symbol: "",
          conversion: 1,
          price: "",
        },
      ],
    }));
  }

  function removeUnit(index) {
    setFormData((prev) => {
      if (prev.units.length <= 1) {
        alert("At least one unit is required.");
        return prev;
      }

      if (prev.units[index]?.is_base_unit) {
        alert("Base unit cannot be removed.");
        return prev;
      }

      return {
        ...prev,
        units: prev.units.filter((_, i) => i !== index),
      };
    });
  }

  /* ============================================================
     RESET
  ============================================================ */

  function resetForm() {
    setFormData({
      ...emptyForm,
      units: [
        {
          ...emptyUnit,
          name: "Piece",
          symbol: "pcs",
          type: "quantity",
          conversion: 1,
          is_base_unit: true,
        },
      ],
    });

    setImagePreview("");

    setShowModal(false);

    setError("");
  }

  /* ============================================================
     EDIT
  ============================================================ */

  function handleRowClick(product) {
    const productUnits = getProductUnits(product);

    const normalizedUnits =
      productUnits.length > 0
        ? productUnits.map((unit) => ({
            id: unit.id ?? null,

            name:
              unit.name ??
              unit.unit_name ??
              "",

            symbol:
              unit.symbol ??
              unit.unit_symbol ??
              "",

            type:
              unit.type ??
              unit.unit_type ??
              "custom",

            conversion:
              unit.conversion ??
              unit.conversion_to_base ??
              1,

            price:
              unit.price ??
              unit.selling_price ??
              "",

            purchase_price:
              unit.purchase_price ??
              "",

            barcode:
              unit.barcode ??
              "",

            is_base_unit:
              Boolean(
                unit.is_base_unit === true ||
                  unit.is_base_unit === 1
              ),

            is_active:
              unit.is_active !== false,
          }))
        : [
            {
              ...emptyUnit,

              name:
                product.base_unit ||
                "Piece",

              symbol:
                product.base_unit === "kg"
                  ? "kg"
                  : product.base_unit === "g"
                  ? "g"
                  : "pcs",

              type: "quantity",

              conversion: 1,

              price:
                product.selling_price ??
                product.price ??
                "",

              purchase_price:
                product.purchase_price ??
                "",

              barcode:
                product.barcode ??
                "",

              is_base_unit: true,
            },
          ];

    const baseUnit =
      product.base_unit ||
      normalizedUnits.find((u) => u.is_base_unit)?.name ||
      "piece";

    setFormData({
      ...emptyForm,

      id: product.id,

      name: product.name || "",

      description: product.description || "",

      barcode: product.barcode || "",

      stock: product.stock ?? "",

      min_stock: product.min_stock ?? "",

      purchase_price:
        product.purchase_price ?? "",

      selling_price:
        product.selling_price ??
        product.price ??
        "",

      price:
        product.price ??
        product.selling_price ??
        "",

      status: product.status || "Available",

      base_unit: baseUnit,

      package_enabled: false,

      package_quantity: 1,

      image: product.image || "",

      units: normalizedUnits,
    });

    setImagePreview(product.image || "");

    setShowModal(true);
  }

  /* ============================================================
     SAVE
  ============================================================ */

  async function handleSubmit(e) {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("Product name is required.");
      return;
    }

    if (
      formData.stock === "" ||
      Number(formData.stock) < 0
    ) {
      alert("Enter valid stock.");
      return;
    }

    if (!formData.base_unit) {
      alert("Select base unit.");
      return;
    }

    if (!formData.units.length) {
      alert("Add at least one unit.");
      return;
    }

    const baseUnitExists = formData.units.some(
      (unit) =>
        unit.is_base_unit === true &&
        Number(unit.conversion) === 1
    );

    if (!baseUnitExists) {
      alert(
        "Base unit was not found in units. The base unit must have conversion = 1."
      );
      return;
    }

    for (const unit of formData.units) {
      if (!unit.name?.trim()) {
        alert("Please enter unit name for every unit.");
        return;
      }

      if (
        unit.conversion === "" ||
        Number(unit.conversion) <= 0
      ) {
        alert(
          `Invalid conversion for ${unit.name}.`
        );
        return;
      }

      if (
        unit.price === "" ||
        Number(unit.price) < 0
      ) {
        alert(
          `Please enter selling price for ${unit.name}.`
        );
        return;
      }
    }

    try {
      setLoading(true);

      const method = formData.id ? "PUT" : "POST";

      const payload = {
        id: formData.id,

        name: formData.name.trim(),

        description:
          formData.description?.trim() || null,

        barcode:
          formData.barcode?.trim() || null,

        stock: Number(formData.stock),

        min_stock:
          formData.min_stock === ""
            ? 0
            : Number(formData.min_stock),

        purchase_price:
          formData.purchase_price === ""
            ? 0
            : Number(formData.purchase_price),

        selling_price:
          formData.selling_price === ""
            ? Number(formData.price || 0)
            : Number(formData.selling_price),

        price:
          formData.price === ""
            ? Number(formData.selling_price || 0)
            : Number(formData.price),

        status: formData.status,

        base_unit: formData.base_unit,

        package_enabled:
          Boolean(formData.package_enabled),

        package_quantity:
          formData.package_enabled
            ? Number(
                formData.package_quantity || 1
              )
            : 1,

        image: formData.image || null,

        units: formData.units.map((unit) => ({
          id: unit.id || null,

          name: String(unit.name).trim(),

          symbol:
            String(unit.symbol || "").trim(),

          type:
            unit.type || "custom",

          conversion: Number(
            unit.conversion || 1
          ),

          price: Number(unit.price || 0),

          purchase_price: Number(
            unit.purchase_price || 0
          ),

          barcode:
            String(unit.barcode || "").trim() ||
            null,

          is_base_unit:
            Boolean(unit.is_base_unit),

          is_active:
            unit.is_active !== false,
        })),
      };

      const res = await fetch("/api/product", {
        method,

        headers: {
          "Content-Type": "application/json",
        },

        credentials: "include",

        body: JSON.stringify(payload),
      });

      const text = await res.text();

      let data = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(
          `Server returned invalid response (${res.status}). Check /api/product route.`
        );
      }

      if (!res.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            `Failed to save product (${res.status})`
        );
      }

      alert(
        formData.id
          ? "Product updated successfully ✅"
          : "Product added successfully ✅"
      );

      resetForm();

      await fetchProducts();
    } catch (err) {
      console.error("SAVE PRODUCT:", err);

      alert(
        err.message ||
          "Something went wrong while saving product."
      );
    } finally {
      setLoading(false);
    }
  }

  /* ============================================================
     DELETE
  ============================================================ */

  async function handleDelete(id) {
    const ok = window.confirm(
      "Are you sure you want to delete this product?"
    );

    if (!ok) return;

    try {
      const res = await fetch(
        `/api/product?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const text = await res.text();

      let data = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(
          "Server returned invalid JSON while deleting."
        );
      }

      if (!res.ok) {
        throw new Error(
          data?.error ||
            `Delete failed (${res.status})`
        );
      }

      await fetchProducts();
    } catch (err) {
      console.error(err);

      alert(
        err.message ||
          "Failed to delete product."
      );
    }
  }

  /* ============================================================
     EXCEL TEMPLATE
  ============================================================ */

  function downloadExcelTemplate() {
    const rows = [
      {
        "Product Name": "Leather Safety Shoes",

        Description:
          "Industrial leather safety shoes",

        Barcode: "100001",

        Stock: 50,

        "Min Stock": 10,

        "Base Unit": "piece",

        "Purchase Price": 1800,

        "Selling Price": 2500,

        Status: "Available",

        "Unit Name": "Piece",

        "Unit Symbol": "pcs",

        "Unit Type": "quantity",

        "Conversion To Base": 1,

        "Unit Purchase Price": 1800,

        "Unit Selling Price": 2500,

        "Unit Barcode": "100001",
      },

      {
        "Product Name": "Leather Gloves",

        Description:
          "Leather safety gloves",

        Barcode: "100002",

        Stock: 100,

        "Min Stock": 20,

        "Base Unit": "piece",

        "Purchase Price": 200,

        "Selling Price": 350,

        Status: "Available",

        "Unit Name": "Piece",

        "Unit Symbol": "pcs",

        "Unit Type": "quantity",

        "Conversion To Base": 1,

        "Unit Purchase Price": 200,

        "Unit Selling Price": 350,

        "Unit Barcode": "100002",
      },

      {
        "Product Name": "Leather Gloves",

        Description:
          "Leather safety gloves",

        Barcode: "100002",

        Stock: 100,

        "Min Stock": 20,

        "Base Unit": "piece",

        "Purchase Price": 200,

        "Selling Price": 350,

        Status: "Available",

        "Unit Name": "Box",

        "Unit Symbol": "box",

        "Unit Type": "package",

        "Conversion To Base": 12,

        "Unit Purchase Price": 2200,

        "Unit Selling Price": 3500,

        "Unit Barcode": "100002-B",
      },

      {
        "Product Name": "Leather",

        Description:
          "Finished leather material",

        Barcode: "100003",

        Stock: 500,

        "Min Stock": 50,

        "Base Unit": "sqft",

        "Purchase Price": 40,

        "Selling Price": 75,

        Status: "Available",

        "Unit Name": "Square Feet",

        "Unit Symbol": "sq ft",

        "Unit Type": "area",

        "Conversion To Base": 1,

        "Unit Purchase Price": 40,

        "Unit Selling Price": 75,

        "Unit Barcode": "100003",
      },

      {
        "Product Name": "Milk",

        Description:
          "Fresh milk",

        Barcode: "100004",

        Stock: 100,

        "Min Stock": 10,

        "Base Unit": "litre",

        "Purchase Price": 45,

        "Selling Price": 60,

        Status: "Available",

        "Unit Name": "Litre",

        "Unit Symbol": "L",

        "Unit Type": "volume",

        "Conversion To Base": 1,

        "Unit Purchase Price": 45,

        "Unit Selling Price": 60,

        "Unit Barcode": "100004",
      },

      {
        "Product Name": "Milk",

        Description:
          "Fresh milk",

        Barcode: "100004",

        Stock: 100,

        "Min Stock": 10,

        "Base Unit": "litre",

        "Purchase Price": 45,

        "Selling Price": 60,

        Status: "Available",

        "Unit Name": "Millilitre",

        "Unit Symbol": "ml",

        "Unit Type": "volume",

        "Conversion To Base": 0.001,

        "Unit Purchase Price": 0.045,

        "Unit Selling Price": 0.06,

        "Unit Barcode": "100004-ML",
      },
    ];

    const worksheet =
      XLSX.utils.json_to_sheet(rows);

    worksheet["!cols"] = [
      { wch: 25 },
      { wch: 30 },
      { wch: 15 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 18 },
      { wch: 18 },
      { wch: 15 },
      { wch: 20 },
      { wch: 15 },
      { wch: 18 },
      { wch: 20 },
      { wch: 22 },
      { wch: 22 },
      { wch: 20 },
    ];

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Products"
    );

    XLSX.writeFile(
      workbook,
      "inventory_import_template.xlsx"
    );
  }

  /* ============================================================
     EXCEL IMPORT
  ============================================================ */

  async function handleExcelImport(e) {
    const file = e.target.files?.[0];

    if (!file) return;

    try {
      setImporting(true);

      setImportResult(null);

      const buffer =
        await file.arrayBuffer();

      const workbook =
        XLSX.read(buffer, {
          type: "array",
        });

      const sheetName =
        workbook.SheetNames[0];

      if (!sheetName) {
        throw new Error(
          "Excel file has no worksheet."
        );
      }

      const worksheet =
        workbook.Sheets[sheetName];

      const rows =
        XLSX.utils.sheet_to_json(
          worksheet,
          {
            defval: "",
          }
        );

      if (!rows.length) {
        throw new Error(
          "Excel file is empty."
        );
      }

      const errors = [];

      let successCount = 0;

      /*
       * Group rows by product name + barcode.
       *
       * This allows:
       *
       * Leather Gloves | Piece
       * Leather Gloves | Box
       *
       * to become ONE product with TWO units.
       */

      const grouped = new Map();

      rows.forEach((rawRow, index) => {
        const rowNumber = index + 2;

        const normalized = {};

        Object.entries(rawRow).forEach(
          ([key, value]) => {
            normalized[
              normalizeHeader(key)
            ] = value;
          }
        );

        const name = String(
          normalized.productname ||
            normalized.name ||
            normalized.itemname ||
            ""
        ).trim();

        if (!name) {
          errors.push(
            `Row ${rowNumber}: Product name is required.`
          );

          return;
        }

        const barcode = String(
          normalized.barcode ||
            normalized.productbarcode ||
            ""
        ).trim();

        const key =
          `${name.toLowerCase()}|${barcode}`;

        if (!grouped.has(key)) {
          grouped.set(key, {
            name,

            description: String(
              normalized.description || ""
            ).trim(),

            barcode:
              barcode || null,

            stock: Number(
              normalized.stock || 0
            ),

            min_stock: Number(
              normalized.minstock ||
                normalized.minimumstock ||
                0
            ),

            base_unit: String(
              normalized.baseunit ||
                "piece"
            ).trim(),

            purchase_price: Number(
              normalized.purchaseprice ||
                0
            ),

            selling_price: Number(
              normalized.sellingprice ||
                normalized.price ||
                0
            ),

            status:
              String(
                normalized.status ||
                  "Available"
              ).trim(),

            units: [],
          });
        }

        const product =
          grouped.get(key);

        const unitName = String(
          normalized.unitname ||
            normalized.unit ||
            ""
        ).trim();

        /*
         * If Unit Name is empty,
         * create a base unit from Base Unit.
         */

        const finalUnitName =
          unitName ||
          product.base_unit ||
          "Piece";

        const conversionRaw =
          normalized.conversiontobase ||
          normalized.conversion ||
          1;

        const conversion =
          Number(conversionRaw);

        if (
          !Number.isFinite(conversion) ||
          conversion <= 0
        ) {
          errors.push(
            `Row ${rowNumber}: Invalid conversion for ${finalUnitName}.`
          );

          return;
        }

        const unitPriceRaw =
          normalized.unitsellingprice ||
          normalized.price ||
          product.selling_price ||
          0;

        const unitPurchasePriceRaw =
          normalized.unitpurchaseprice ||
          product.purchase_price ||
          0;

        const unit = {
          name: finalUnitName,

          symbol: String(
            normalized.unitsymbol ||
              ""
          ).trim(),

          type:
            String(
              normalized.unittype ||
                "custom"
            ).trim(),

          conversion,

          price: Number(
            unitPriceRaw || 0
          ),

          purchase_price: Number(
            unitPurchasePriceRaw || 0
          ),

          barcode:
            String(
              normalized.unitbarcode ||
                ""
            ).trim() || null,

          is_base_unit:
            conversion === 1 &&
            product.units.length === 0,

          is_active: true,
        };

        product.units.push(unit);
      });

      const groupedProducts =
        Array.from(grouped.values());

      for (const product of groupedProducts) {
        if (!product.units.length) {
          errors.push(
            `${product.name}: No unit found.`
          );

          continue;
        }

        /*
         * Make sure a base unit exists.
         */

        const baseExists =
          product.units.some(
            (unit) =>
              unit.is_base_unit &&
              Number(unit.conversion) === 1
          );

        if (!baseExists) {
          product.units.unshift({
            name:
              product.base_unit ||
              "Piece",

            symbol: "",

            type: "custom",

            conversion: 1,

            price:
              product.selling_price,

            purchase_price:
              product.purchase_price,

            barcode:
              product.barcode,

            is_base_unit: true,

            is_active: true,
          });
        }

        /*
         * POST product
         */

        try {
          const res = await fetch(
            "/api/product",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              credentials: "include",

              body: JSON.stringify({
                name: product.name,

                description:
                  product.description ||
                  null,

                barcode:
                  product.barcode,

                stock: product.stock,

                min_stock:
                  product.min_stock,

                purchase_price:
                  product.purchase_price,

                selling_price:
                  product.selling_price,

                price:
                  product.selling_price,

                status:
                  product.status,

                base_unit:
                  product.base_unit,

                units:
                  product.units,

                image: null,
              }),
            }
          );

          const text =
            await res.text();

          let result = null;

          try {
            result = text
              ? JSON.parse(text)
              : null;
          } catch {
            throw new Error(
              `Server returned invalid response for ${product.name}.`
            );
          }

          if (!res.ok) {
            throw new Error(
              result?.error ||
                result?.message ||
                `HTTP ${res.status}`
            );
          }

          successCount++;
        } catch (err) {
          errors.push(
            `${product.name}: ${
              err.message ||
              "Failed to import."
            }`
          );
        }
      }

      setImportResult({
        success: successCount,

        failed: errors.length,

        errors,
      });

      await fetchProducts();

      if (successCount > 0) {
        alert(
          `${successCount} product(s) imported successfully ✅`
        );
      } else {
        alert(
          "No products imported. Check the import errors."
        );
      }
    } catch (err) {
      console.error(
        "EXCEL IMPORT ERROR:",
        err
      );

      alert(
        err.message ||
          "Failed to import Excel file."
      );
    } finally {
      setImporting(false);

      e.target.value = "";
    }
  }

  /* ============================================================
     FILTER
  ============================================================ */

  const filteredProducts =
    products.filter((product) => {
      const searchText =
        search.trim().toLowerCase();

      if (!searchText) return true;

      return (
        String(
          product.name || ""
        )
          .toLowerCase()
          .includes(searchText) ||

        String(
          product.barcode || ""
        )
          .toLowerCase()
          .includes(searchText)
      );
    });

  /* ============================================================
     UI
  ============================================================ */

  return (
    <div
      className="
        min-h-screen
        bg-[#081426]
        text-white
        p-3
        sm:p-5
        lg:p-7
      "
    >
      {/* HEADER */}

      <div
        className="
          flex
          flex-col
          gap-4
          lg:flex-row
          lg:items-center
          lg:justify-between
          mb-6
        "
      >
        <div>
          <h1
            className="
              text-2xl
              sm:text-3xl
              font-bold
              tracking-tight
            "
          >
            Inventory
          </h1>

          <p className="text-sm text-gray-400 mt-1">
            Manage products, stock, units and prices
          </p>
        </div>

        <div
          className="
            grid
            grid-cols-2
            sm:flex
            gap-2
          "
        >
          {/* IMPORT */}

          <button
            type="button"
            disabled={importing}
            onClick={() =>
              fileInputRef.current?.click()
            }
            className="
              px-4
              py-3
              rounded-2xl
              bg-purple-500/15
              border
              border-purple-400/20
              text-purple-300
              hover:bg-purple-500/25
              transition
              font-semibold
              text-sm
            "
          >
            {importing
              ? "Importing..."
              : "📥 Import Excel"}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleExcelImport}
            className="hidden"
          />

          {/* TEMPLATE */}

          <button
            type="button"
            onClick={downloadExcelTemplate}
            className="
              px-4
              py-3
              rounded-2xl
              bg-white/5
              border
              border-white/10
              hover:bg-white/10
              transition
              font-semibold
              text-sm
            "
          >
            📄 Template
          </button>

          {/* ADD */}

          <button
            type="button"
            onClick={() => {
              resetForm();

              setShowModal(true);
            }}
            className="
              col-span-2
              sm:col-span-1
              px-5
              py-3
              rounded-2xl
              bg-blue-500
              hover:bg-blue-600
              transition
              font-semibold
              shadow-lg
            "
          >
            + Add Product
          </button>
        </div>
      </div>

      {/* ERROR */}

      {error && (
        <div
          className="
            mb-5
            p-4
            rounded-2xl
            bg-red-500/10
            border
            border-red-400/20
            text-red-300
          "
        >
          {error}
        </div>
      )}

      {/* IMPORT RESULT */}

      {importResult && (
        <div
          className="
            mb-5
            p-4
            rounded-2xl
            bg-white/[0.04]
            border
            border-white/10
          "
        >
          <div className="font-semibold">
            Import Result
          </div>

          <div className="text-sm text-gray-300 mt-1">
            Successful:{" "}
            <span className="text-green-400">
              {importResult.success}
            </span>{" "}
            | Failed:{" "}
            <span className="text-red-400">
              {importResult.failed}
            </span>
          </div>

          {importResult.errors?.length > 0 && (
            <div className="mt-3 max-h-40 overflow-auto text-sm text-red-300 space-y-1">
              {importResult.errors.map(
                (item, index) => (
                  <div key={index}>
                    {item}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* SEARCH */}

      <div
        className="
          mb-6
          bg-white/[0.04]
          border
          border-white/10
          rounded-3xl
          p-4
          sm:p-5
        "
      >
        <input
          type="text"
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          placeholder="Search product name or barcode..."
          className="
            w-full
            bg-white/[0.05]
            border
            border-white/10
            rounded-2xl
            px-5
            py-4
            outline-none
            focus:border-blue-400
            focus:ring-2
            focus:ring-blue-400/20
            transition
          "
        />
      </div>

      {/* ========================================================
          MOBILE PRODUCT CARDS
      ======================================================== */}

      <div className="md:hidden space-y-3">
        {filteredProducts.length === 0 ? (
          <div
            className="
              text-center
              py-16
              bg-white/[0.03]
              border
              border-white/10
              rounded-3xl
              text-gray-400
            "
          >
            No products found.
          </div>
        ) : (
          filteredProducts.map(
            (product) => {
              const stockStatus =
                getStockStatus(product);

              const units =
                getProductUnits(product);

              return (
                <div
                  key={product.id}
                  onClick={() =>
                    handleRowClick(product)
                  }
                  className="
                    bg-white/[0.04]
                    border
                    border-white/10
                    rounded-3xl
                    p-4
                    active:scale-[0.99]
                    transition
                  "
                >
                  <div className="flex gap-3">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="
                          w-16
                          h-16
                          rounded-2xl
                          object-cover
                          border
                          border-white/10
                        "
                      />
                    ) : (
                      <div
                        className="
                          w-16
                          h-16
                          rounded-2xl
                          bg-white/10
                          flex
                          items-center
                          justify-center
                          text-2xl
                        "
                      >
                        📦
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-lg truncate">
                        {product.name}
                      </div>

                      <div className="text-xs text-gray-500 mt-1">
                        {product.barcode ||
                          "No barcode"}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();

                        handleDelete(
                          product.id
                        );
                      }}
                      className="
                        w-9
                        h-9
                        shrink-0
                        rounded-xl
                        bg-red-500/10
                        text-red-400
                      "
                    >
                      🗑️
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div
                      className="
                        bg-white/[0.04]
                        rounded-2xl
                        p-3
                      "
                    >
                      <div className="text-xs text-gray-500">
                        Stock
                      </div>

                      <div className="font-bold mt-1">
                        {product.stock ?? 0}
                      </div>

                      <div className="text-xs text-gray-500">
                        {product.base_unit ||
                          "unit"}
                      </div>
                    </div>

                    <div
                      className="
                        bg-white/[0.04]
                        rounded-2xl
                        p-3
                      "
                    >
                      <div className="text-xs text-gray-500">
                        Price
                      </div>

                      <div className="font-bold text-blue-300 mt-1">
                        ₹
                        {getProductPrice(
                          product
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 mt-3">
                    {units
                      .slice(0, 4)
                      .map(
                        (
                          unit,
                          index
                        ) => (
                          <span
                            key={
                              unit.id ??
                              index
                            }
                            className="
                              px-2
                              py-1
                              text-xs
                              rounded-lg
                              bg-blue-500/10
                              text-blue-300
                            "
                          >
                            {unit.name ||
                              unit.unit_name}
                          </span>
                        )
                      )}
                  </div>

                  <div className="mt-3">
                    <span
                      className={`
                        inline-flex
                        px-3
                        py-1
                        rounded-full
                        text-xs
                        border
                        ${stockStatus.className}
                      `}
                    >
                      {stockStatus.text}
                    </span>
                  </div>
                </div>
              );
            }
          )
        )}
      </div>

      {/* ========================================================
          DESKTOP TABLE
      ======================================================== */}

      <div
        className="
          hidden
          md:block
          bg-white/[0.04]
          border
          border-white/10
          rounded-3xl
          overflow-hidden
          shadow-xl
        "
      >
        <div
          className="
            px-5
            py-4
            border-b
            border-white/10
            flex
            items-center
            justify-between
          "
        >
          <h2 className="font-semibold text-lg">
            Product List
          </h2>

          <span className="text-sm text-gray-500">
            {filteredProducts.length} products
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr
                className="
                  text-xs
                  uppercase
                  tracking-wide
                  text-gray-400
                  border-b
                  border-white/10
                "
              >
                <th className="p-4">
                  Product
                </th>

                <th className="p-4">
                  Stock
                </th>

                <th className="p-4">
                  Units
                </th>

                <th className="p-4">
                  Price
                </th>

                <th className="p-4">
                  Status
                </th>

                <th className="p-4 text-right">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredProducts.map(
                (product) => {
                  const stockStatus =
                    getStockStatus(
                      product
                    );

                  const units =
                    getProductUnits(
                      product
                    );

                  return (
                    <tr
                      key={product.id}
                      onClick={() =>
                        handleRowClick(
                          product
                        )
                      }
                      className="
                        border-b
                        border-white/5
                        hover:bg-blue-500/[0.05]
                        cursor-pointer
                        transition
                      "
                    >
                      {/* PRODUCT */}

                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {product.image ? (
                            <img
                              src={
                                product.image
                              }
                              alt={
                                product.name
                              }
                              className="
                                w-12
                                h-12
                                rounded-xl
                                object-cover
                                border
                                border-white/10
                              "
                            />
                          ) : (
                            <div
                              className="
                                w-12
                                h-12
                                rounded-xl
                                bg-white/10
                                flex
                                items-center
                                justify-center
                              "
                            >
                              📦
                            </div>
                          )}

                          <div>
                            <div className="font-medium">
                              {
                                product.name
                              }
                            </div>

                            <div className="text-xs text-gray-500">
                              {product.barcode ||
                                "No barcode"}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* STOCK */}

                      <td className="p-4">
                        <div className="font-semibold">
                          {product.stock ??
                            0}
                        </div>

                        <div className="text-xs text-gray-500">
                          {product.base_unit ||
                            "unit"}
                        </div>
                      </td>

                      {/* UNITS */}

                      <td className="p-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {units
                            .slice(0, 4)
                            .map(
                              (
                                unit,
                                index
                              ) => (
                                <span
                                  key={
                                    unit.id ??
                                    index
                                  }
                                  className="
                                    px-2
                                    py-1
                                    text-xs
                                    rounded-lg
                                    bg-blue-500/10
                                    text-blue-300
                                  "
                                >
                                  {unit.name ||
                                    unit.unit_name}
                                </span>
                              )
                            )}
                        </div>
                      </td>

                      {/* PRICE */}

                      <td className="p-4">
                        <div className="font-semibold">
                          ₹
                          {getProductPrice(
                            product
                          )}
                        </div>

                        <div className="text-xs text-gray-500">
                          per{" "}
                          {units?.[0]
                            ?.symbol ||
                            units?.[0]
                              ?.unit_symbol ||
                            product.base_unit ||
                            "unit"}
                        </div>
                      </td>

                      {/* STATUS */}

                      <td className="p-4">
                        <span
                          className={`
                            inline-flex
                            px-3
                            py-1
                            rounded-full
                            text-xs
                            border
                            ${stockStatus.className}
                          `}
                        >
                          {
                            stockStatus.text
                          }
                        </span>
                      </td>

                      {/* ACTION */}

                      <td
                        className="p-4 text-right"
                        onClick={(e) =>
                          e.stopPropagation()
                        }
                      >
                        <button
                          type="button"
                          onClick={() =>
                            handleDelete(
                              product.id
                            )
                          }
                          className="
                            w-9
                            h-9
                            rounded-xl
                            bg-red-500/10
                            text-red-400
                            hover:bg-red-500/20
                            transition
                          "
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================
          PRODUCT MODAL
      ======================================================== */}

      {showModal && (
        <div
          className="
            fixed
            inset-0
            z-50
            bg-black/70
            backdrop-blur-sm
            flex
            items-center
            justify-center
            p-2
            sm:p-5
          "
        >
          <div
            className="
              w-full
              max-w-4xl
              max-h-[96vh]
              overflow-y-auto
              bg-gradient-to-br
              from-[#13294B]
              to-[#081426]
              border
              border-blue-400/20
              rounded-3xl
              shadow-2xl
              p-4
              sm:p-6
              lg:p-8
            "
          >
            {/* MODAL HEADER */}

            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-blue-300">
                  {formData.id
                    ? "Update Product"
                    : "Add Product"}
                </h2>

                <p className="text-sm text-gray-400 mt-1">
                  Configure stock, units and pricing
                </p>
              </div>

              <button
                type="button"
                onClick={resetForm}
                className="
                  w-10
                  h-10
                  rounded-xl
                  bg-white/5
                  hover:bg-white/10
                  text-gray-300
                "
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-6"
            >
              {/* IMAGE */}

              <div className="flex justify-center">
                <div
                  onClick={() =>
                    document
                      .getElementById(
                        "inventory-image-input"
                      )
                      ?.click()
                  }
                  className="
                    w-28
                    h-28
                    sm:w-32
                    sm:h-32
                    rounded-3xl
                    border-2
                    border-blue-400/30
                    bg-white/5
                    flex
                    items-center
                    justify-center
                    overflow-hidden
                    cursor-pointer
                    hover:bg-white/10
                    transition
                  "
                >
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center text-gray-400">
                      <div className="text-3xl">
                        📷
                      </div>

                      <div className="text-xs mt-1">
                        Product Image
                      </div>
                    </div>
                  )}
                </div>

                <input
                  id="inventory-image-input"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>

              {/* BASIC DETAILS */}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400">
                    Product Name *
                  </label>

                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Example: Safety Shoes"
                    required
                    className="
                      mt-2
                      w-full
                      bg-white/5
                      border
                      border-white/10
                      rounded-xl
                      px-4
                      py-3
                      outline-none
                      focus:border-blue-400
                    "
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-400">
                    Barcode
                  </label>

                  <input
                    name="barcode"
                    value={formData.barcode}
                    onChange={handleChange}
                    placeholder="Scan or enter barcode"
                    className="
                      mt-2
                      w-full
                      bg-white/5
                      border
                      border-white/10
                      rounded-xl
                      px-4
                      py-3
                      outline-none
                      focus:border-blue-400
                    "
                  />
                </div>
              </div>

              {/* DESCRIPTION */}

              <div>
                <label className="text-sm text-gray-400">
                  Description
                </label>

                <textarea
                  name="description"
                  value={
                    formData.description
                  }
                  onChange={handleChange}
                  rows={3}
                  placeholder="Product description..."
                  className="
                    mt-2
                    w-full
                    bg-white/5
                    border
                    border-white/10
                    rounded-xl
                    px-4
                    py-3
                    outline-none
                    focus:border-blue-400
                    resize-none
                  "
                />
              </div>

              {/* STOCK */}

              <div
                className="
                  grid
                  grid-cols-1
                  sm:grid-cols-3
                  gap-4
                "
              >
                <div>
                  <label className="text-sm text-gray-400">
                    Stock *
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="any"
                    name="stock"
                    value={formData.stock}
                    onChange={handleChange}
                    className="
                      mt-2
                      w-full
                      bg-white/5
                      border
                      border-white/10
                      rounded-xl
                      px-4
                      py-3
                      outline-none
                      focus:border-blue-400
                    "
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-400">
                    Minimum Stock
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="any"
                    name="min_stock"
                    value={
                      formData.min_stock
                    }
                    onChange={handleChange}
                    className="
                      mt-2
                      w-full
                      bg-white/5
                      border
                      border-white/10
                      rounded-xl
                      px-4
                      py-3
                      outline-none
                      focus:border-blue-400
                    "
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-400">
                    Status
                  </label>

                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="
                      mt-2
                      w-full
                      bg-[#13294B]
                      text-white
                      border
                      border-white/10
                      rounded-xl
                      px-4
                      py-3
                      outline-none
                    "
                  >
                    <option value="Available">
                      Available
                    </option>

                    <option value="Out of Stock">
                      Out of Stock
                    </option>

                    <option value="Inactive">
                      Inactive
                    </option>
                  </select>
                </div>
              </div>

              {/* BASE UNIT */}

              <div
                className="
                  p-4
                  sm:p-5
                  rounded-3xl
                  bg-white/[0.03]
                  border
                  border-white/10
                "
              >
                <h3 className="font-semibold text-lg text-blue-300">
                  Base Unit
                </h3>

                <p className="text-xs text-gray-500 mt-1">
                  Stock is stored using this unit.
                </p>

                <select
                  name="base_unit"
                  value={
                    formData.base_unit
                  }
                  onChange={
                    handleBaseUnitChange
                  }
                  className="
                    mt-3
                    w-full
                    bg-[#13294B]
                    text-white
                    border
                    border-white/10
                    rounded-xl
                    px-4
                    py-3
                    outline-none
                    focus:border-blue-400
                  "
                >
                  {UNIT_OPTIONS.map(
                    (unit) => (
                      <option
                        key={unit.value}
                        value={
                          unit.value
                        }
                        className="bg-[#13294B] text-white"
                      >
                        {unit.label} (
                        {unit.symbol ||
                          unit.value}
                        )
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* PRICES */}

              <div
                className="
                  grid
                  grid-cols-1
                  sm:grid-cols-2
                  gap-4
                "
              >
                <div>
                  <label className="text-sm text-gray-400">
                    Purchase Price
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    name="purchase_price"
                    value={
                      formData.purchase_price
                    }
                    onChange={handleChange}
                    placeholder="₹ Purchase"
                    className="
                      mt-2
                      w-full
                      bg-white/5
                      border
                      border-white/10
                      rounded-xl
                      px-4
                      py-3
                      outline-none
                    "
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-400">
                    Default Selling Price
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    name="selling_price"
                    value={
                      formData.selling_price
                    }
                    onChange={handleChange}
                    placeholder="₹ Selling"
                    className="
                      mt-2
                      w-full
                      bg-white/5
                      border
                      border-white/10
                      rounded-xl
                      px-4
                      py-3
                      outline-none
                    "
                  />
                </div>
              </div>

              {/* UNITS */}

              <div
                className="
                  p-4
                  sm:p-5
                  rounded-3xl
                  bg-white/[0.03]
                  border
                  border-white/10
                "
              >
                <div
                  className="
                    flex
                    flex-col
                    sm:flex-row
                    sm:items-center
                    sm:justify-between
                    gap-3
                    mb-4
                  "
                >
                  <div>
                    <h3 className="font-semibold text-lg text-blue-300">
                      Units & Pricing
                    </h3>

                    <p className="text-xs text-gray-500 mt-1">
                      Example: Piece, Box, Packet,
                      Carton etc.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={addUnit}
                    className="
                      px-4
                      py-2
                      rounded-xl
                      bg-blue-500/15
                      border
                      border-blue-400/20
                      text-blue-300
                      hover:bg-blue-500/25
                    "
                  >
                    + Add Unit
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.units.map(
                    (unit, index) => (
                      <div
                        key={
                          unit.id ??
                          `unit-${index}`
                        }
                        className="
                          rounded-2xl
                          bg-black/10
                          border
                          border-white/10
                          p-4
                        "
                      >
                        <div
                          className="
                            flex
                            items-center
                            justify-between
                            mb-4
                          "
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">
                              Unit #
                              {index + 1}
                            </span>

                            {unit.is_base_unit && (
                              <span
                                className="
                                  px-2
                                  py-1
                                  rounded-lg
                                  text-xs
                                  bg-green-500/10
                                  text-green-300
                                "
                              >
                                Base Unit
                              </span>
                            )}
                          </div>

                          {!unit.is_base_unit && (
                            <button
                              type="button"
                              onClick={() =>
                                removeUnit(
                                  index
                                )
                              }
                              className="text-red-400 text-sm"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div
                          className="
                            grid
                            grid-cols-1
                            sm:grid-cols-2
                            lg:grid-cols-3
                            gap-3
                          "
                        >
                          <input
                            value={
                              unit.name
                            }
                            onChange={(e) =>
                              updateUnit(
                                index,
                                "name",
                                e.target
                                  .value
                              )
                            }
                            placeholder="Unit name"
                            className="
                              w-full
                              bg-white/5
                              border
                              border-white/10
                              rounded-xl
                              px-3
                              py-3
                              outline-none
                            "
                          />

                          <input
                            value={
                              unit.symbol
                            }
                            onChange={(e) =>
                              updateUnit(
                                index,
                                "symbol",
                                e.target
                                  .value
                              )
                            }
                            placeholder="Symbol e.g. pcs"
                            className="
                              w-full
                              bg-white/5
                              border
                              border-white/10
                              rounded-xl
                              px-3
                              py-3
                              outline-none
                            "
                          />

                          <input
                            type="number"
                            min="0.000001"
                            step="any"
                            value={
                              unit.conversion
                            }
                            disabled={
                              unit.is_base_unit
                            }
                            onChange={(e) =>
                              updateUnit(
                                index,
                                "conversion",
                                e.target
                                  .value
                              )
                            }
                            placeholder="Conversion"
                            className="
                              w-full
                              bg-white/5
                              border
                              border-white/10
                              rounded-xl
                              px-3
                              py-3
                              outline-none
                              disabled:opacity-50
                            "
                          />

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={
                              unit.purchase_price
                            }
                            onChange={(e) =>
                              updateUnit(
                                index,
                                "purchase_price",
                                e.target
                                  .value
                              )
                            }
                            placeholder="Purchase price"
                            className="
                              w-full
                              bg-white/5
                              border
                              border-white/10
                              rounded-xl
                              px-3
                              py-3
                              outline-none
                            "
                          />

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={
                              unit.price
                            }
                            onChange={(e) =>
                              updateUnit(
                                index,
                                "price",
                                e.target
                                  .value
                              )
                            }
                            placeholder="Selling price"
                            className="
                              w-full
                              bg-white/5
                              border
                              border-white/10
                              rounded-xl
                              px-3
                              py-3
                              outline-none
                            "
                          />

                          <input
                            value={
                              unit.barcode
                            }
                            onChange={(e) =>
                              updateUnit(
                                index,
                                "barcode",
                                e.target
                                  .value
                              )
                            }
                            placeholder="Unit barcode"
                            className="
                              w-full
                              bg-white/5
                              border
                              border-white/10
                              rounded-xl
                              px-3
                              py-3
                              outline-none
                            "
                          />
                        </div>

                        {!unit.is_base_unit && (
                          <div className="mt-3 text-xs text-gray-500">
                            1{" "}
                            {unit.name ||
                              "unit"}{" "}
                            ={" "}
                            {unit.conversion ||
                              1}{" "}
                            {
                              formData.base_unit
                            }
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* BUTTONS */}

              <div
                className="
                  grid
                  grid-cols-1
                  sm:grid-cols-2
                  gap-3
                  pt-2
                "
              >
                <button
                  type="button"
                  onClick={resetForm}
                  className="
                    order-2
                    sm:order-1
                    py-4
                    rounded-2xl
                    bg-white/10
                    hover:bg-white/15
                    font-semibold
                  "
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="
                    order-1
                    sm:order-2
                    py-4
                    rounded-2xl
                    bg-blue-500
                    hover:bg-blue-600
                    disabled:opacity-50
                    font-semibold
                    shadow-lg
                  "
                >
                  {loading
                    ? "Saving..."
                    : formData.id
                    ? "Update Product"
                    : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
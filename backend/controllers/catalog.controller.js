import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";

// Validation Schemas
const categorySchema = z.object({
  name: z.string().min(2, "Category name is required"),
  description: z.string().optional(),
  type: z.enum(["ONE_TIME", "SERVICE", "SUBSCRIPTION"]).optional(),
});

const productSchema = z.object({
  name: z.string().min(2, "Product name is required"),
  sku: z.string().min(2, "SKU is required"),
  description: z.string().optional(),
  categoryId: z.string().min(1, "Category ID is required"),
  productType: z.enum(["ONE_TIME", "SERVICE", "SUBSCRIPTION"]).default("ONE_TIME"),
  basePrice: z.number().min(0, "Base price cannot be negative"),
  costPrice: z.number().min(0, "Cost price cannot be negative"),
  unit: z.string().default("unit"),
  taxRate: z.number().min(0).default(0),
  isPromoted: z.boolean().default(false),
});

const updateProductSchema = productSchema.partial();

const variantSchema = z.object({
  attribute: z.string().min(1, "Attribute name is required (e.g. Size, Pack)"),
  value: z.string().min(1, "Attribute value is required (e.g. Large, 12-pack)"),
  extraPrice: z.number().min(0).default(0),
});

/**
 * ============================================================================
 *  PRODUCT CATEGORIES
 * ============================================================================
 */

export const getCategories = asyncHandler(async (req, res) => {
  const { type } = req.query;

  const allCategories = await prisma.productCategory.findMany({
    include: {
      _count: {
        select: { products: true },
      },
    },
    orderBy: { name: "asc" },
  });

  if (!type) {
    return res
      .status(200)
      .json(new ApiResponse(200, { categories: allCategories }, "Categories retrieved"));
  }

  const filtered = allCategories.filter((c) => {
    const desc = c.description || "";
    const name = c.name.toLowerCase();

    if (type === "ONE_TIME") {
      if (desc.includes("[TYPE:ONE_TIME]")) return true;
      if (desc.includes("[TYPE:SERVICE]") || desc.includes("[TYPE:SUBSCRIPTION]")) return false;
      if (name.includes("service") || name.includes("subscription") || name.includes("saas")) return false;
      return true;
    }

    if (type === "SERVICE") {
      if (desc.includes("[TYPE:SERVICE]")) return true;
      if (desc.includes("[TYPE:ONE_TIME]") || desc.includes("[TYPE:SUBSCRIPTION]")) return false;
      if (name.includes("hardware") || name.includes("subscription") || name.includes("saas")) return false;
      return name.includes("service") || name.includes("support") || name.includes("consulting") || name.includes("maintenance");
    }

    if (type === "SUBSCRIPTION") {
      if (desc.includes("[TYPE:SUBSCRIPTION]")) return true;
      if (desc.includes("[TYPE:ONE_TIME]") || desc.includes("[TYPE:SERVICE]")) return false;
      if (name.includes("hardware")) return false;
      return name.includes("subscription") || name.includes("saas") || name.includes("cloud") || name.includes("software");
    }

    return true;
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { categories: filtered }, "Categories retrieved"));
});

export const createCategory = asyncHandler(async (req, res) => {
  const validated = categorySchema.parse(req.body);

  const existing = await prisma.productCategory.findUnique({
    where: { name: validated.name.trim() },
  });

  if (existing) {
    throw new ApiError(409, "A category with this name already exists");
  }

  let description = validated.description?.trim() || "";
  if (validated.type && !description.includes(`[TYPE:${validated.type}]`)) {
    description = description ? `${description} [TYPE:${validated.type}]` : `[TYPE:${validated.type}]`;
  }

  const category = await prisma.productCategory.create({
    data: {
      name: validated.name.trim(),
      description: description || null,
    },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { category }, "Category created successfully"));
});

/**
 * ============================================================================
 *  PRODUCTS
 * ============================================================================
 */

export const getProducts = asyncHandler(async (req, res) => {
  const { search, categoryId, productType, isPromoted } = req.query;

  const where = {
    isActive: true,
    ...(categoryId && { categoryId: String(categoryId) }),
    ...(productType && { productType: String(productType) }),
    ...(isPromoted !== undefined && { isPromoted: isPromoted === "true" }),
    ...(search && {
      OR: [
        { name: { contains: String(search), mode: "insensitive" } },
        { sku: { contains: String(search), mode: "insensitive" } },
      ],
    }),
  };

  const products = await prisma.product.findMany({
    where,
    include: {
      category: true,
      variants: {
        where: { isActive: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { products }, "Products retrieved successfully"));
});

export const getProductById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      variants: { where: { isActive: true } },
    },
  });

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { product }, "Product retrieved"));
});

export const createProduct = asyncHandler(async (req, res) => {
  const validated = productSchema.parse(req.body);

  // Check SKU uniqueness
  const existingSku = await prisma.product.findUnique({
    where: { sku: validated.sku.toUpperCase().trim() },
  });

  if (existingSku) {
    throw new ApiError(409, `Product with SKU '${validated.sku}' already exists`);
  }

  // Verify Category
  const category = await prisma.productCategory.findUnique({
    where: { id: validated.categoryId },
  });

  if (!category) {
    throw new ApiError(400, "Selected category does not exist");
  }

  const product = await prisma.product.create({
    data: {
      sku: validated.sku.toUpperCase().trim(),
      name: validated.name.trim(),
      description: validated.description?.trim() || null,
      categoryId: category.id,
      productType: validated.productType,
      basePrice: validated.basePrice,
      costPrice: validated.costPrice,
      unit: validated.unit || "unit",
      taxRate: validated.taxRate,
      isPromoted: validated.isPromoted,
      isActive: true,
    },
    include: {
      category: true,
      variants: true,
    },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { product }, "Product created successfully"));
});

export const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const validated = updateProductSchema.parse(req.body);

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(validated.name && { name: validated.name.trim() }),
      ...(validated.sku && { sku: validated.sku.toUpperCase().trim() }),
      ...(validated.description !== undefined && {
        description: validated.description,
      }),
      ...(validated.categoryId && { categoryId: validated.categoryId }),
      ...(validated.productType && { productType: validated.productType }),
      ...(validated.basePrice !== undefined && {
        basePrice: validated.basePrice,
      }),
      ...(validated.costPrice !== undefined && {
        costPrice: validated.costPrice,
      }),
      ...(validated.unit !== undefined && { unit: validated.unit }),
      ...(validated.taxRate !== undefined && { taxRate: validated.taxRate }),
      ...(validated.isPromoted !== undefined && {
        isPromoted: validated.isPromoted,
      }),
    },
    include: {
      category: true,
      variants: true,
    },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { product }, "Product updated successfully"));
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await prisma.product.update({
    where: { id },
    data: { isActive: false },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Product deactivated successfully"));
});

/**
 * ============================================================================
 *  PRODUCT VARIANTS
 * ============================================================================
 */

export const createVariant = asyncHandler(async (req, res) => {
  const { id: productId } = req.params;
  const validated = variantSchema.parse(req.body);

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    throw new ApiError(404, "Parent product not found");
  }

  const variant = await prisma.productVariant.upsert({
    where: {
      productId_attribute_value: {
        productId,
        attribute: validated.attribute.trim(),
        value: validated.value.trim(),
      },
    },
    update: {
      extraPrice: validated.extraPrice,
      isActive: true,
    },
    create: {
      productId,
      attribute: validated.attribute.trim(),
      value: validated.value.trim(),
      extraPrice: validated.extraPrice,
      isActive: true,
    },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { variant }, "Product variant saved"));
});

export default {
  getCategories,
  createCategory,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  createVariant,
};

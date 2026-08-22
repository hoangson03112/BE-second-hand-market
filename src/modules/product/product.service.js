const Product = require("../../models/Product");
const Category = require("../../models/Category");
const SubCategory = require("../../models/SubCategory");
const Address = require("../../models/Address");
const Seller = require("../../models/Seller");
const PersonalDiscount = require("../../models/PersonalDiscount");
const { MESSAGES } = require("../../utils/messages");

function mapProductsWithSeller(products, { accountId, sellerMap }) {
  return products.map((product) => {
    const sellerId = product.sellerId?._id;

    return {
      _id: product._id,
      name: product.name,
      description: product.description,
      price: product.price,
      stock: product.stock ?? 0,
      avatar: product.avatar,
      images: product.images,
      category: product.categoryId,
      subCategory: product.subcategoryId,
      slug: product.slug,
      condition: product.condition,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      status: product.status,
      views: product.views || 0,
      soldCount: product.soldCount || 0,
      address: {
        provinceId: product.address?.provinceId,
      },
      seller: {
        _id: sellerId,
        name: product.sellerId?.fullName,
        avatar: product.sellerId?.avatar ?? null,
        role: product.sellerId?.role,
      },
    };
  });
}

async function applyPersonalDiscounts(productsWithSeller, accountId) {
  if (!accountId || productsWithSeller.length === 0) return productsWithSeller;

  const productIds = productsWithSeller.map((product) => product._id);
  const personalDiscounts = await PersonalDiscount.find({
    productId: { $in: productIds },
    buyerId: accountId,
    isUse: false,
    endDate: { $gt: new Date() },
  });

  const discountMap = new Map();
  personalDiscounts.forEach((discount) =>
    discountMap.set(discount.productId.toString(), discount),
  );

  productsWithSeller.forEach((product) => {
    const discount = discountMap.get(product._id.toString());
    if (discount) {
      product.originalPrice = product.price;
      product.price = discount.price;
      product.hasPersonalDiscount = true;
      product.personalDiscountId = discount._id;
    }
  });

  return productsWithSeller;
}

async function getFeaturedProductsData({ accountId, limit = 4 }) {
  const query = {
    status: { $in: ["approved", "active"] },
    stock: { $gt: 0 },
  };

  const products = await Product.find(query)
    .populate({ path: "sellerId", select: "fullName avatar role" })
    .populate({ path: "categoryId", select: "name slug" })
    .populate({ path: "subcategoryId", select: "name slug" })
    .populate({
      path: "address",
      select:
        "provinceId districtId wardCode specificAddress fullName phoneNumber",
    })
    .sort({ soldCount: -1, views: -1, createdAt: -1 })
    .limit(limit);

  const sellerAccountIds = products
    .map((product) => product.sellerId?._id)
    .filter(Boolean);
  const sellers = await Seller.find({ accountId: { $in: sellerAccountIds } });
  const sellerMap = new Map();
  sellers.forEach((seller) => {
    if (seller.accountId) sellerMap.set(seller.accountId.toString(), seller);
  });

  const productsWithSeller = mapProductsWithSeller(products, {
    accountId,
    sellerMap,
  });
  const finalProducts = await applyPersonalDiscounts(
    productsWithSeller,
    accountId,
  );

  return {
    success: true,
    data: finalProducts,
    total: finalProducts.length,
  };
}

async function getAllPublicProductsData(queryParams) {
  const {
    categorySlug,
    subCategorySlug,
    sortBy = "newest",
    page = 1,
    limit = 20,
    minPrice,
    maxPrice,
    condition,
    search,
    transactionMethod,
    provinceId,
  } = queryParams;

  let categoryId = null;
  if (categorySlug) {
    const category = await Category.findOne({ slug: categorySlug });
    if (!category) {
      throw Object.assign(new Error(MESSAGES.PRODUCT.CATEGORY_NOT_FOUND), {
        status: 404,
      });
    }
    categoryId = category._id;
  }

  let subcategoryId = null;
  if (subCategorySlug) {
    const subcategory = await SubCategory.findOne({ slug: subCategorySlug });
    if (!subcategory) {
      throw Object.assign(new Error(MESSAGES.PRODUCT.SUBCATEGORY_NOT_FOUND), {
        status: 404,
      });
    }
    subcategoryId = subcategory._id;
  }

  const query = { status: { $in: ["approved", "active"] }, stock: { $gt: 0 } };

  if (subcategoryId) {
    query.subcategoryId = subcategoryId;
  } else if (categoryId) {
    query.categoryId = categoryId;
  }

  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = parseFloat(minPrice);
    if (maxPrice) query.price.$lte = parseFloat(maxPrice);
  }

  if (condition) query.condition = condition;

  if (transactionMethod === "meeting") {
    query["deliveryOptions.localPickup"] = true;
  } else if (transactionMethod === "shipping") {
    query["deliveryOptions.codShipping"] = true;
  }

  if (provinceId != null && String(provinceId).trim() !== "") {
    const normalizedProvinceId = String(provinceId).trim();
    const addressesWithProvince = await Address.find({
      provinceId: normalizedProvinceId,
    })
      .select("_id")
      .lean();
    const addressIds = addressesWithProvince.map((address) => address._id);
    query.address = addressIds.length > 0 ? { $in: addressIds } : { $in: [] };
  }

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  let sortObject = {};
  switch (sortBy) {
    case "newest":
      sortObject = { createdAt: -1 };
      break;
    case "oldest":
      sortObject = { createdAt: 1 };
      break;
    case "price_low":
      sortObject = { price: 1 };
      break;
    case "price_high":
      sortObject = { price: -1 };
      break;
    case "popular":
      sortObject = { soldCount: -1, views: -1 };
      break;
    default:
      sortObject = { createdAt: -1 };
  }

  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 20;
  const skip = (pageNum - 1) * limitNum;

  const total = await Product.countDocuments(query);

  const products = await Product.find(query)
    .populate({ path: "sellerId", select: "fullName avatar role" })
    .populate({ path: "categoryId", select: "name slug" })
    .populate({ path: "subcategoryId", select: "name slug" })
    .populate({
      path: "address",
      select:
        "provinceId districtId wardCode specificAddress fullName phoneNumber",
    })
    .sort(sortObject)
    .skip(skip)
    .limit(limitNum);

  const sellerAccountIds = products
    .map((product) => product.sellerId?._id)
    .filter(Boolean);
  const sellers = await Seller.find({ accountId: { $in: sellerAccountIds } });
  const sellerMap = new Map();
  sellers.forEach((seller) => {
    if (seller.accountId) sellerMap.set(seller.accountId.toString(), seller);
  });

  const productsWithSeller = mapProductsWithSeller(products, {
    accountId: queryParams.accountId,
    sellerMap,
  });
  const finalProducts = await applyPersonalDiscounts(
    productsWithSeller,
    queryParams.accountId,
  );

  return {
    success: true,
    data: finalProducts,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  };
}

module.exports = {
  getFeaturedProductsData,
  getAllPublicProductsData,
};

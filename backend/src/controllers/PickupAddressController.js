const PickupAddress = require("../models/PickupAddress");
const Account = require("../models/Account");

/**
 * GET /pickup-address
 * Lấy địa chỉ lấy hàng của user hiện tại (dùng cho user chưa verify seller).
 */
async function getPickupAddress(req, res) {
  try {
    const pickup = await PickupAddress.findOne({ accountId: req.accountID }).lean();
    if (!pickup) {
      return res.status(200).json({ hasAddress: false, data: null });
    }
    return res.status(200).json({ hasAddress: true, data: pickup });
  } catch (error) {
    console.error("Error getPickupAddress:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy địa chỉ lấy hàng",
      error: error.message,
    });
  }
}

/**
 * PUT /pickup-address
 * Tạo hoặc cập nhật địa chỉ lấy hàng (body: province, district, ward, from_district_id, from_ward_code, businessAddress).
 */
async function upsertPickupAddress(req, res) {
  try {
    const { province, district, ward, from_district_id, from_ward_code, businessAddress } =
      req.body;

    if (
      !province ||
      !district ||
      !ward ||
      !from_district_id ||
      !from_ward_code ||
      !businessAddress?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Thiếu thông tin: province, district, ward, from_district_id, from_ward_code, businessAddress",
      });
    }

    const account = await Account.findById(req.accountID).select("role");
    if (account?.role === "seller") {
      return res.status(400).json({
        success: false,
        message: "Bạn đã là seller, địa chỉ lấy hàng lấy từ hồ sơ seller.",
      });
    }

    const pickup = await PickupAddress.findOneAndUpdate(
      { accountId: req.accountID },
      {
        accountId: req.accountID,
        province,
        district,
        ward,
        from_district_id: String(from_district_id),
        from_ward_code: String(from_ward_code),
        businessAddress: businessAddress.trim(),
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Đã lưu địa chỉ lấy hàng",
      data: pickup,
    });
  } catch (error) {
    console.error("Error upsertPickupAddress:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lưu địa chỉ lấy hàng",
      error: error.message,
    });
  }
}

module.exports = {
  getPickupAddress,
  upsertPickupAddress,
};

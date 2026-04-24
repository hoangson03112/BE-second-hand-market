const Address = require("../../models/Address");
const Account = require("../../models/Account");
const { MESSAGES } = require('../../utils/messages');

const GHN_PHONE_REGEX = /^0\d{9}$/;

function normalizeAndValidatePhoneNumber(rawPhoneNumber) {
  const normalizedPhoneNumber = String(rawPhoneNumber || "").replace(/\D/g, "");
  if (!GHN_PHONE_REGEX.test(normalizedPhoneNumber)) {
    throw Object.assign(
      new Error("Số điện thoại không hợp lệ. Vui lòng nhập đúng 10 số và bắt đầu bằng số 0 (ví dụ: 0332454556)."),
      { status: 400 }
    );
  }
  return normalizedPhoneNumber;
}

class AddressController {
  async createAddress(req, res) {
    const {
      fullName,
      specificAddress,
      phoneNumber,
      wardCode,
      districtId,
      provinceId,
      isDefault,
      type,
    } = req.body;
    const normalizedPhoneNumber = normalizeAndValidatePhoneNumber(phoneNumber);
    let resolvedFullName = fullName;
    if (!resolvedFullName) {
      const account = await Account.findById(req.accountID).select("fullName").lean();
      resolvedFullName = account?.fullName || null;
    }
    const address = new Address({
      accountId: req.accountID,
      fullName: resolvedFullName,
      specificAddress,
      phoneNumber: normalizedPhoneNumber,
      provinceId,
      isDefault,
      wardCode,
      districtId,
      type: type || "delivery",
    });
    let addresses= await Address.find({ accountId: req.accountID });
    if (isDefault) {
      addresses.forEach(async (address) => {
        address.isDefault = false;
        await address.save();
      });
    }

    const savedAddress = await address.save();
    res.status(201).json(savedAddress);
  }
  async getAddresses(req, res) {
    const { type } = req.query;
    const filter = { accountId: req.accountID };
    if (type) filter.type = type;
    const addresses = await Address.find(filter).lean();
    res.status(200).json(addresses);
  }

  async updateAddress(req, res) {
    const { id } = req.params;
    const {
      fullName,
      specificAddress,
      phoneNumber,
      wardCode,
      districtId,
      provinceId,
      isDefault,
      type,
    } = req.body;
    const normalizedPhoneNumber = normalizeAndValidatePhoneNumber(phoneNumber);

    // Verify address belongs to user
    const existing = await Address.findOne({ _id: id, accountId: req.accountID });
    if (!existing) {
      return res.status(403).json({ message: MESSAGES.ADDRESS.UNAUTHORIZED });
    }

    // If setting as default, unset other defaults of same type
    if (isDefault) {
      await Address.updateMany(
        { accountId: req.accountID, type: existing.type },
        { isDefault: false }
      );
    }

    const updatedAddress = await Address.findByIdAndUpdate(
      id,
      {
        fullName,
        specificAddress,
        phoneNumber: normalizedPhoneNumber,
        provinceId,
        wardCode,
        ...(type && { type }),
        districtId,
        isDefault,
      },
      { new: true }
    );

    res.status(200).json(updatedAddress);
  }

  async deleteAddress(req, res) {
    const { id } = req.params;

    const existing = await Address.findOne({ _id: id, accountId: req.accountID });
    if (!existing) {
      return res.status(403).json({ message: MESSAGES.ADDRESS.UNAUTHORIZED });
    }

    await Address.findByIdAndDelete(id);
    res.status(200).json({ message: MESSAGES.ADDRESS.DELETE_SUCCESS });
  }
}

module.exports = new AddressController();


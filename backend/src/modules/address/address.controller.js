const Address = require("../../models/Address");
const Account = require("../../models/Account");
const { MESSAGES } = require('../../utils/messages');

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
    let resolvedFullName = fullName;
    if (!resolvedFullName) {
      const account = await Account.findById(req.accountID).select("fullName").lean();
      resolvedFullName = account?.fullName || null;
    }
    const address = new Address({
      accountId: req.accountID,
      fullName: resolvedFullName,
      specificAddress,
      phoneNumber,
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
        phoneNumber,
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


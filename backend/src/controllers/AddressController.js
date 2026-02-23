const Address = require("../models/Address");

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
    const address = new Address({
      accountID: req.accountID,
      fullName,
      specificAddress,
      phoneNumber,
      provinceId,
      isDefault,
      wardCode,
      districtId,
      type: type || "delivery",
    });
    let addresses= await Address.find({ accountID: req.accountID });
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
    const filter = { accountID: req.accountID };
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
    const existing = await Address.findOne({ _id: id, accountID: req.accountID });
    if (!existing) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // If setting as default, unset other defaults of same type
    if (isDefault) {
      await Address.updateMany(
        { accountID: req.accountID, type: existing.type },
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

    const existing = await Address.findOne({ _id: id, accountID: req.accountID });
    if (!existing) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await Address.findByIdAndDelete(id);
    res.status(200).json({ message: "Address deleted successfully" });
  }
}

module.exports = new AddressController();

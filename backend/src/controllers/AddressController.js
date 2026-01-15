const Account = require("../models/Account");
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
    } = req.body;
    const address = new Address({
      fullName,
      specificAddress,
      phoneNumber,
      provinceId,
      isDefault,
      wardCode,
      districtId,
    });
    const user = await Account.findById(req.accountID).populate("addresses");
    if (isDefault) {
      user.addresses.forEach(async (address) => {
        address.isDefault = false;
        await address.save();
      });
    }

    const savedAddress = await address.save();
    user.addresses.push(savedAddress._id);
    await user.save();
    res.status(201).json(savedAddress);
  }
  async getAddresses(req, res) {
    const user = await Account.findById(req.accountID).populate("addresses");

    res.status(200).json(user.addresses);
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
    } = req.body;

    // Verify address belongs to user
    const user = await Account.findById(req.accountID).populate("addresses");
    const addressExists = user.addresses.some(
      (addr) => addr._id.toString() === id
    );

    if (!addressExists) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await Address.updateMany(
        { _id: { $in: user.addresses } },
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
        districtId,
        isDefault,
      },
      { new: true }
    );

    res.status(200).json(updatedAddress);
  }

  async deleteAddress(req, res) {
    const { id } = req.params;

    // Verify address belongs to user
    const user = await Account.findById(req.accountID).populate("addresses");
    const addressIndex = user.addresses.findIndex(
      (addr) => addr._id.toString() === id
    );

    if (addressIndex === -1) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Remove from user's addresses array
    user.addresses.splice(addressIndex, 1);
    await user.save();

    // Delete the address
    await Address.findByIdAndDelete(id);

    res.status(200).json({ message: "Address deleted successfully" });
  }
}

module.exports = new AddressController();

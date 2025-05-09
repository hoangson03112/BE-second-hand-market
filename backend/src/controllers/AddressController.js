const Account = require("../models/Account");
const Address = require("../models/Address");

class AddressController {
  async createAddress(req, res) {
    const {
      fullName,
      specificAddress,
      phoneNumber,
      ward,
      district,
      province,
      isDefault,
    } = req.body;
    const address = new Address({
      fullName,
      specificAddress,
      phoneNumber,
      district,
      province,
      isDefault,
      ward,
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
}

module.exports = new AddressController();

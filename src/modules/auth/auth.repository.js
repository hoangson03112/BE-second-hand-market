const Account = require("../../models/Account");

class AuthRepository {
  async findById(id) {
    return Account.findById(id);
  }

  async findByIdentifier(identifier) {
    return Account.findOne({
      $or: [{ username: identifier }, { email: identifier.toLowerCase() }],
    });
  }

  async findByEmail(email) {
    return Account.findOne({ email: email.toLowerCase() });
  }

  async save(accountDocument) {
    return accountDocument.save();
  }

  async updateById(id, updateData) {
    return Account.findByIdAndUpdate(id, updateData, { new: true });
  }

  async create(accountData) {
    return Account.create(accountData);
  }
}

module.exports = new AuthRepository();

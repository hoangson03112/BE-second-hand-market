const { asyncHandler } = require("../../core/middlewares/errorHandler");
const { OKResponse } = require("../../core/responses");
const Account = require("../../models/Account");
const Address = require("../../models/Address");
const Seller = require("../../models/Seller");
const { sendAccountChangeEmail } = require("../../services/email.service");
const { MESSAGES } = require("../../utils/messages");
const { changePassword, setPassword } = require("../auth/auth.service");
const { clearAuthCookies } = require("../../utils/cookieHelper");
const {
  validateChangePasswordPayload,
  validateSetPasswordPayload,
} = require("../auth/auth.validator");

class AccountController {
  async updateAccountInfo(req, res) {
    try {
      const accountUpdate = req.body;

      const account = await Account.findById(req.accountID);
      if (!account) {
        return res
          .status(404)
          .json({ message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND });
      }

      const oldEmail = account.email;
      const oldPhoneNumber = account.phoneNumber;
      let emailChanged = false;
      let phoneChanged = false;

      account.fullName = accountUpdate.fullName;

      if (accountUpdate.phoneNumber !== oldPhoneNumber) {
        phoneChanged = true;
        account.phoneNumber = accountUpdate.phoneNumber;
      }

      if (!account.googleId) {
        if (accountUpdate.email !== oldEmail) {
          emailChanged = true;
          account.email = accountUpdate.email;
        }
      }

      await account.save();

      if (emailChanged) {
        try {
          await sendAccountChangeEmail(
            accountUpdate.email,
            account.fullName,
            "email",
            accountUpdate.email,
          );
        } catch (emailError) {
          console.error("Lỗi gửi email xác nhận thay đổi email:", emailError);
        }
      }

      if (phoneChanged) {
        try {
          await sendAccountChangeEmail(
            account.email,
            account.fullName,
            "phoneNumber",
            accountUpdate.phoneNumber,
          );
        } catch (emailError) {
          console.error("Lỗi gửi email xác nhận thay đổi SĐT:", emailError);
        }
      }

      return res.status(200).json({
        message: MESSAGES.AUTH.UPDATE_SUCCESS,
        updatedAccount: account,
      });
    } catch (error) {
      console.error("Lỗi cập nhật tài khoản:", error);
      return res.status(500).json({ message: MESSAGES.SERVER_ERROR });
    }
  }

  async getAccountById(req, res) {
    const accountId = req.params.id;
    try {
      const account = await Account.findById(accountId).lean();
      if (!account) {
        return res
          .status(404)
          .json({ message: MESSAGES.AUTH.ACCOUNT_NOT_FOUND });
      }

      if (account.role === "seller") {
        const [seller, pickupAddr] = await Promise.all([
          Seller.findOne({ accountId: accountId })
            .select("province from_ward_code from_district_id businessAddress")
            .lean(),
          Address.findOne({ accountId: accountId, type: "pickup" }).lean(),
        ]);

        const addr = pickupAddr || seller;
        return res.status(200).json({
          ...account,
          province: seller?.province,
          from_ward_code: addr?.wardCode ?? addr?.from_ward_code,
          from_district_id: addr?.districtId ?? addr?.from_district_id,
          businessAddress: addr?.specificAddress ?? addr?.businessAddress,
        });
      }

      return res.status(200).json(account);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: MESSAGES.SERVER_ERROR });
    }
  }

  changePassword = asyncHandler(async (req, res) => {
    validateChangePasswordPayload(req.body);
    const result = await changePassword({
      accountId: req.accountID,
      oldPassword: req.body.oldPassword,
      newPassword: req.body.newPassword,
      clearCookie: () => clearAuthCookies(res),
    });
    return new OKResponse({ data: result }).send(res);
  });
  setPassword = asyncHandler(async (req, res) => {
    validateSetPasswordPayload(req.body.newPassword);
    const result = await setPassword({
      accountId: req.accountID,
      newPassword: req.body.newPassword,
      clearCookie: () => clearAuthCookies(res),
    });
    return new OKResponse({ data: result }).send(res);
  });
}
module.exports = new AccountController();

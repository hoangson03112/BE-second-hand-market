const nodemailer = require("nodemailer");
require("dotenv").config();

const generateVerificationCode = () => {
  return Math.floor(1000 + Math.random() * 9000);
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.USERNAME_GMAIL,
    pass: process.env.PASSWORD_GMAIL,
  },
});

const sendVerificationEmail = (userEmail, verificationCode) => {
  const mailOptions = {
    from: process.env.USERNAME_GMAIL,
    to: userEmail,
    subject: "Mã xác thực tài khoản",
    text: `Mã xác thực của bạn là: ${verificationCode}`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Lỗi khi gửi email:", error);
    } else {
      console.log("Email đã được gửi:", info.response);
    }
  });
};

module.exports = {
  generateVerificationCode,
  sendVerificationEmail,
};

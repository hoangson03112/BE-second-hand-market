const express = require("express");
const router = express.Router();
const PayOS = require("@payos/node");
const payOS = new PayOS(
  process.env.PAYOS_CLIENT_ID,
  process.env.PAYOS_API_KEY,
  process.env.PAYOS_CHECKSUM_KEY
);
const Order = require("../models/Order");

router.post("/create-payment-link", async (req, res) => {
  const { orderId, amount, items } = req.body;
  const YOUR_DOMAIN = `https://localhost:3000/eco-market/`;

  try {
    const order = await Order.findById(orderId);
    const body = {
      orderCode: Number(String(Date.now()).slice(-6)),
      amount,
      description: "Order " + order.ghnOrderCode,
      items,
      returnUrl: `${YOUR_DOMAIN}payment-success?orderId=${orderId}`,
      cancelUrl: `${YOUR_DOMAIN}payment-cancel?orderId=${orderId}`,
    };

    const paymentLinkResponse = await payOS.createPaymentLink(body);
    res.json({ checkoutUrl: paymentLinkResponse.checkoutUrl }); // ✅ trả về link
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong" });
  }
});

module.exports = router;

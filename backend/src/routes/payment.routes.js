const express = require("express");
const router = express.Router();
const PayOS = require("@payos/node");
const payOS = new PayOS(
  process.env.PAYOS_CLIENT_ID,
  process.env.PAYOS_API_KEY,
  process.env.PAYOS_CHECKSUM_KEY
);

router.post("/create-payment-link", async (req, res) => {
  const { orderId, amount, items } = req.body;
  const YOUR_DOMAIN = `https://localhost:3000/eco-market/`;
  const orderCode = Number(String(Date.now()).slice(-6));
  try {
    const body = {
      orderCode: orderCode,
      amount,
      description: "Order " + orderCode,
      items: items,
      returnUrl: `${YOUR_DOMAIN}payment-success?orderId=${orderId}`,
      cancelUrl: `${YOUR_DOMAIN}payment-cancel?orderId=${orderId}`,
    };
    console.log(body);
    const paymentLinkResponse = await payOS.createPaymentLink(body);
    res.json({ checkoutUrl: paymentLinkResponse.checkoutUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong" });
  }
});

module.exports = router;

require("dotenv").config();
const express = require("express");
const app = express();
app.use(express.json());

const PRICE_XRP = "0.5";
const PAY_TO_ADDRESS = process.env.VERIFIER_ADDRESS;

app.post("/verify", (req, res) => {
  const paymentProof = req.headers["x-payment-proof"];

  if (!paymentProof) {
    return res.status(402).json({
      error: "Payment Required",
      amount: PRICE_XRP,
      currency: "XRP",
      destination: PAY_TO_ADDRESS,
    });
  }

  const { fileContent } = req.body;
  const checks = [
    { name: "has_nav_element", pass: fileContent.includes("<nav") },
    { name: "has_footer_element", pass: fileContent.includes("<footer") },
    { name: "has_title", pass: fileContent.includes("<title") },
  ];
  const allPass = checks.every(c => c.pass);

  res.json({ pass: allPass, checks });
});

app.listen(4001, () => console.log("Verification service running on port 4001"));

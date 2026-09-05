require("dotenv").config();
const express = require("express");
const xrpl = require("xrpl");
const app = express();
app.use(express.json());

const PRICE_XRP = "0.5";
const PRICE_DROPS = xrpl.xrpToDrops(PRICE_XRP);
const PAY_TO_ADDRESS = process.env.VERIFIER_ADDRESS;

// Tracks proofs already spent, so the same payment can't be replayed for free repeat checks
const usedProofs = new Set();

async function isValidPayment(txHash) {
  if (usedProofs.has(txHash)) {
    return { valid: false, reason: "Payment proof already used (replay)" };
  }

  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
  await client.connect();

  try {
    const response = await client.request({
      command: "tx",
      transaction: txHash,
    });
    const tx = response.result;
    console.log("DEBUG raw tx response:", JSON.stringify(tx, null, 2)); // temporary debug line

    const checks = {
      isPayment: tx.TransactionType === "Payment",
      isValidated: tx.validated === true,
      succeeded: tx.meta && tx.meta.TransactionResult === "tesSUCCESS",
      correctDestination: tx.Destination === PAY_TO_ADDRESS,
      correctAmount: typeof tx.Amount === "string" && BigInt(tx.Amount) >= BigInt(PRICE_DROPS),
    };

    const allGood = Object.values(checks).every(Boolean);

    if (allGood) {
      usedProofs.add(txHash);
      return { valid: true };
    }
    return { valid: false, reason: `Payment check failed: ${JSON.stringify(checks)}` };
  } catch (err) {
    return { valid: false, reason: `Could not verify transaction: ${err.message}` };
  } finally {
    await client.disconnect();
  }
}

app.post("/verify", async (req, res) => {
  const paymentProof = req.headers["x-payment-proof"];

  if (!paymentProof) {
    return res.status(402).json({
      error: "Payment Required",
      amount: PRICE_XRP,
      currency: "XRP",
      destination: PAY_TO_ADDRESS,
    });
  }

  const paymentCheck = await isValidPayment(paymentProof);
  if (!paymentCheck.valid) {
    return res.status(402).json({
      error: "Payment Required",
      reason: paymentCheck.reason,
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

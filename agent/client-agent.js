require("dotenv").config();
const xrpl = require("xrpl");
const { generateCondition } = require("./condition");

const BUDGET = 150;

function selectFreelancer(freelancers) {
  const affordable = freelancers.filter(f => f.rate <= BUDGET);
  if (affordable.length === 0) {
    throw new Error("No freelancers available within budget.");
  }
  const scored = affordable.map(f => ({ ...f, score: f.reliability / f.rate }));
  scored.sort((a, b) => b.score - a.score);
  console.log(`→ Chose ${scored[0].name} (best reliability-per-dollar among affordable options)`);
  return scored[0];
}

function enforceSpendingCap(amount) {
  if (amount > BUDGET) {
    throw new Error(`Blocked: ${amount} exceeds hard spending cap of ${BUDGET}`);
  }
  console.log(`→ Safeguard check passed: ${amount} is within hard cap of ${BUDGET}`);
}

async function lockEscrow(client, clientWallet, freelancerAddress, amountXRP, condition) {
  const finishAfter = xrpl.isoTimeToRippleTime(new Date(Date.now() + 30 * 1000));
  const tx = {
    TransactionType: "EscrowCreate",
    Account: clientWallet.address,
    Destination: freelancerAddress,
    Amount: xrpl.xrpToDrops(amountXRP),
    FinishAfter: finishAfter,
    Condition: condition,
  };
  const prepared = await client.autofill(tx);
  const signed = clientWallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  console.log("→ Escrow locked (condition-gated):", result.result.hash);
  return prepared.Sequence;
}

async function payForVerification(client, clientWallet, verifierAddress, amountXRP) {
  const tx = {
    TransactionType: "Payment",
    Account: clientWallet.address,
    Destination: verifierAddress,
    Amount: xrpl.xrpToDrops(amountXRP),
  };
  const prepared = await client.autofill(tx);
  const signed = clientWallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  console.log("→ Paid verification service:", result.result.hash);
  return result.result.hash;
}

async function releaseEscrow(client, freelancerWallet, ownerAddress, offerSequence, condition, fulfillmentHex) {
  const tx = {
    TransactionType: "EscrowFinish",
    Account: freelancerWallet.address,
    Owner: ownerAddress,
    OfferSequence: offerSequence,
    Condition: condition,
    Fulfillment: fulfillmentHex,
  };
  const prepared = await client.autofill(tx);
  prepared.Fee = "1000";
  const signed = freelancerWallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  console.log("→ Escrow released via fulfillment, freelancer paid:", result.result.hash);
}

async function run() {
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");

  try {
    await client.connect();

    const clientWallet = xrpl.Wallet.fromSeed(process.env.CLIENT_SEED);
    const freelancerWallet = xrpl.Wallet.fromSeed(process.env.FREELANCER_SEED);

    let freelancers;
    try {
      const res = await fetch("http://localhost:4000/freelancers");
      freelancers = await res.json();
    } catch (err) {
      throw new Error(`Could not reach freelancer pool service (is it running on port 4000?): ${err.message}`);
    }

    const chosen = selectFreelancer(freelancers);
    enforceSpendingCap(chosen.rate);

    const { condition, fulfillmentHex } = generateCondition();
    console.log("→ Condition committed on-ledger:", condition);

    // Escrow amount now matches the freelancer actually chosen, instead of a hardcoded value
    const sequence = await lockEscrow(client, clientWallet, freelancerWallet.address, chosen.rate.toString(), condition);

    const fileContent = "<html><nav>menu</nav><footer>copyright</footer><title>Test</title></html>";

    let proofHash;
    try {
      proofHash = await payForVerification(client, clientWallet, process.env.VERIFIER_ADDRESS, "0.5");
    } catch (err) {
      throw new Error(`Payment to verification service failed: ${err.message}`);
    }

    console.log("Waiting for escrow window...");
    await new Promise(r => setTimeout(r, 35000));

    let pass, checks;
    try {
      const verifyRes = await fetch("http://localhost:4001/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-payment-proof": proofHash },
        body: JSON.stringify({ fileContent }),
      });
      if (!verifyRes.ok) {
        throw new Error(`Verification service returned status ${verifyRes.status}`);
      }
      ({ pass, checks } = await verifyRes.json());
    } catch (err) {
      throw new Error(`Could not reach verification service (is it running on port 4001?): ${err.message}`);
    }

    console.log("→ Verification result:", checks);

    if (pass) {
      await releaseEscrow(client, freelancerWallet, clientWallet.address, sequence, condition, fulfillmentHex);
      console.log("✅ Job complete, freelancer paid.");
    } else {
      console.log("❌ Verification failed — escrow remains locked. Fulfillment was never revealed.");
    }
  } catch (err) {
    console.error("🛑 Job failed:", err.message);
  } finally {
    await client.disconnect();
  }
}

run();

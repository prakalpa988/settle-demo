require("dotenv").config();
const xrpl = require("xrpl");
const { generateCondition } = require("./condition");

const BUDGET = 150;

function selectFreelancer(freelancers) {
  const affordable = freelancers.filter(f => f.rate <= BUDGET);
  const scored = affordable.map(f => ({ ...f, score: f.reliability / f.rate }));
  scored.sort((a, b) => b.score - a.score);
  console.log(`→ Chose ${scored[0].name} (best reliability-per-dollar among affordable options)`);
  return scored[0];
}

// SAFEGUARD: enforced independently of the agent's own decision logic
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
    Condition: condition, // <-- funds now cryptographically locked to this condition
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
  prepared.Fee = "1000"; // conditional EscrowFinish needs a slightly higher fee than a plain tx
  const signed = freelancerWallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  console.log("→ Escrow released via fulfillment, freelancer paid:", result.result.hash);
}

async function run() {
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
  await client.connect();

  const clientWallet = xrpl.Wallet.fromSeed(process.env.CLIENT_SEED);
  const freelancerWallet = xrpl.Wallet.fromSeed(process.env.FREELANCER_SEED);

  const freelancers = await (await fetch("http://localhost:4000/freelancers")).json();
  const chosen = selectFreelancer(freelancers);

  enforceSpendingCap(chosen.rate);

  // Generate the secret BEFORE locking funds. Nobody — not even the freelancer,
  // who holds their own private key — can release this escrow without it.
  const { condition, fulfillmentHex } = generateCondition();
  console.log("→ Condition committed on-ledger:", condition);

  const sequence = await lockEscrow(client, clientWallet, freelancerWallet.address, "10", condition);

  const fileContent = "<html><nav>menu</nav><footer>copyright</footer><title>Test</title></html>";
  const proofHash = await payForVerification(client, clientWallet, process.env.VERIFIER_ADDRESS, "0.5");

  console.log("Waiting for escrow window...");
  await new Promise(r => setTimeout(r, 35000));

  const verifyRes = await fetch("http://localhost:4001/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-payment-proof": proofHash },
    body: JSON.stringify({ fileContent }),
  });
  const { pass, checks } = await verifyRes.json();
  console.log("→ Verification result:", checks);

  if (pass) {
    // Only now, because verification passed, do we use the fulfillment to unlock funds.
    await releaseEscrow(client, freelancerWallet, clientWallet.address, sequence, condition, fulfillmentHex);
    console.log("✅ Job complete, freelancer paid.");
  } else {
    console.log("❌ Verification failed — escrow remains locked. Fulfillment was never revealed.");
  }

  await client.disconnect();
}

run();

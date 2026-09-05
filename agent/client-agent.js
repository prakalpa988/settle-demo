require("dotenv").config();
const xrpl = require("xrpl");

const BUDGET = 150;

function selectFreelancer(freelancers) {
  const affordable = freelancers.filter(f => f.rate <= BUDGET);
  const scored = affordable.map(f => ({ ...f, score: f.reliability / f.rate }));
  scored.sort((a, b) => b.score - a.score);
  console.log(`→ Chose ${scored[0].name} (best reliability-per-dollar among affordable options)`);
  return scored[0];
}

async function lockEscrow(client, clientWallet, freelancerAddress, amountXRP) {
  const finishAfter = xrpl.isoTimeToRippleTime(new Date(Date.now() + 30 * 1000));
  const tx = {
    TransactionType: "EscrowCreate",
    Account: clientWallet.address,
    Destination: freelancerAddress,
    Amount: xrpl.xrpToDrops(amountXRP),
    FinishAfter: finishAfter,
  };
  const prepared = await client.autofill(tx);
  const signed = clientWallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  console.log("→ Escrow locked:", result.result.hash);
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

async function releaseEscrow(client, freelancerWallet, ownerAddress, offerSequence) {
  const tx = {
    TransactionType: "EscrowFinish",
    Account: freelancerWallet.address,
    Owner: ownerAddress,
    OfferSequence: offerSequence,
  };
  const prepared = await client.autofill(tx);
  const signed = freelancerWallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  console.log("→ Escrow released, freelancer paid:", result.result.hash);
}

async function run() {
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
  await client.connect();

  const clientWallet = xrpl.Wallet.fromSeed(process.env.CLIENT_SEED);
  const freelancerWallet = xrpl.Wallet.fromSeed(process.env.FREELANCER_SEED);

  const freelancers = await (await fetch("http://localhost:4000/freelancers")).json();
  const chosen = selectFreelancer(freelancers);

  const sequence = await lockEscrow(client, clientWallet, freelancerWallet.address, "10");

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
    await releaseEscrow(client, freelancerWallet, clientWallet.address, sequence);
    console.log("✅ Job complete, freelancer paid.");
  } else {
    console.log("❌ Verification failed — escrow remains locked.");
  }

  await client.disconnect();
}

run();

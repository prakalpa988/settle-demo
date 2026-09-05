const xrpl = require("xrpl");

async function main() {
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
  await client.connect();

  const clientWallet = (await client.fundWallet()).wallet;
  const freelancerWallet = (await client.fundWallet()).wallet;
  const verifierWallet = (await client.fundWallet()).wallet;

  console.log("CLIENT_SEED=" + clientWallet.seed);
  console.log("CLIENT_ADDRESS=" + clientWallet.address);
  console.log("FREELANCER_SEED=" + freelancerWallet.seed);
  console.log("FREELANCER_ADDRESS=" + freelancerWallet.address);
  console.log("VERIFIER_SEED=" + verifierWallet.seed);
  console.log("VERIFIER_ADDRESS=" + verifierWallet.address);

  await client.disconnect();
}

main();

const cc = require("five-bells-condition");
const crypto = require("crypto");

function generateCondition() {
  const preimage = crypto.randomBytes(32);
  const fulfillment = new cc.PreimageSha256();
  fulfillment.setPreimage(preimage);

  const condition = fulfillment.getConditionBinary().toString("hex").toUpperCase();
  const fulfillmentHex = fulfillment.serializeBinary().toString("hex").toUpperCase();

  return { condition, fulfillmentHex };
}

module.exports = { generateCondition };

const { handleSubscribe } = require("../subscribe-handler");

module.exports = async (req, res) => {
  await handleSubscribe(req, res);
};

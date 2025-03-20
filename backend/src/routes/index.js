const router = require("./site");

function route(app) {
  app.use("/eco-market", router);

}

module.exports = route;

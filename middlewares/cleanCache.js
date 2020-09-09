const { clearHash } = require('../services/cache');

module.exports = async (req, res, next) => {
    // Let run route handler first and then do something after that.
    await next();
    clearHash(req.user.id)
};

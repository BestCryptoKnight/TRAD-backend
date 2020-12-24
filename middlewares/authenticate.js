const Logger = require('../services/logger');
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Config = require('../config');

let authMiddleWare = async (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).send();
  }
  let token = req.header('authorization');
  if (token) {
    try {
      let user = await User.findByToken(token);
      if (user) {
        req.user = user;
        req.token = token;
        next();
      } else {
        res.status(401).send('Auth-Token is not valid');
      }
    } catch (e) {
      Logger.log.error('Error occurred.', e.message || e);
      return res.status(401).send('Invalid Auth-Token');
    }
  } else {
    Logger.log.warn('JWT - Auth-Token not set in header');
    return res.status(401).send('Auth-Token not set in header');
  }
};

module.exports = {
  authMiddleWare,
};

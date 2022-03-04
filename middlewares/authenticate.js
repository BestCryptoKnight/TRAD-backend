/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const User = mongoose.model('user');
const ClientUser = mongoose.model('client-user');

/*
 * Local Imports
 * */
const Logger = require('../services/logger');

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
        return res.status(401).send({
          status: 'ERROR',
          messageCode: 'UNAUTHORIZED',
          message: 'Auth-Token is not valid',
        });
      }
    } catch (e) {
      Logger.log.warn('Error occurred.', e.message || e);
      return res.status(401).send({
        status: 'ERROR',
        messageCode: 'UNAUTHORIZED',
        message: 'Auth-Token is not valid',
      });
    }
  } else {
    Logger.log.warn('JWT - Auth-Token not set in header');
    return res.status(401).send({
      status: 'ERROR',
      messageCode: 'TOKEN_NOT_FOUND',
      message: 'Auth-Token not set in header',
    });
  }
};

let checkModuleAccess = (req, res, next) => {
  try {
    if (!req.user) {
      Logger.log.warn('User not found, please login again.');
      return res.status(401).send({
        status: 'ERROR',
        messageCode: 'USER_NOT_FOUND',
        message: 'User not found, please login again.',
      });
    }
    if (!req.user.moduleAccess || req.user.moduleAccess.length === 0) {
      Logger.log.warn('User not found, please login again.');
      return res.status(403).send({
        status: 'ERROR',
        messageCode: 'INSUFFICIENT_RIGHTS',
        message: 'Contact Admin to provide rights.',
      });
    }
    let urlParameters = req.url.split('?').shift();
    urlParameters = urlParameters.split('/');
    let moduleName =
      urlParameters[0] !== '' ? urlParameters[0] : urlParameters[1];
    let userModule = req.user.moduleAccess
      .filter((userModule) => userModule.name === moduleName)
      .shift();
    if (
      (!userModule || userModule?.accessTypes?.length === 0) &&
      req.query.requestFrom
    ) {
      userModule = req.user.moduleAccess
        .filter((userModule) => userModule.name === req.query.requestFrom)
        .shift();
    }
    if (userModule) {
      req.accessTypes = userModule.accessTypes;
      let allowRequest = false;
      switch (req.method) {
        case 'GET':
          if (
            req.accessTypes.indexOf('read') !== -1 ||
            req.accessTypes.indexOf('full-access') !== -1
          ) {
            allowRequest = true;
          }
          break;
        case 'POST':
        case 'PUT':
        case 'DELETE':
          if (
            req.accessTypes.indexOf('write') !== -1 ||
            req.accessTypes.indexOf('full-access') !== -1 ||
            (req.accessTypes.indexOf('read') !== -1 &&
              urlParameters.includes('column-name'))
          ) {
            allowRequest = true;
          }
          break;
      }
      if (allowRequest) {
        next();
      } else {
        Logger.log.warn(
          `User with id ${req.user._id} is forbidden cannot make ${req.method} request`,
        );
        return res.status(403).send({
          status: 'ERROR',
          messageCode: 'FORBIDDEN_ACCESS',
          message: `You're forbidden to perform ${req.method} operation.`,
        });
        //TODO add Audit log
      }
    } else {
      Logger.log.warn(
        `User with id ${req.user._id} is forbidden to access module ${moduleName}`,
      );
      return res.status(403).send({
        status: 'ERROR',
        messageCode: 'FORBIDDEN_ACCESS',
        message: "You're forbidden to access this module",
      });
      //TODO add Audit log
    }
  } catch (e) {
    Logger.log.error('Error in checking user right middleware', e.message);
    return res.status(401).send({
      status: 'ERROR',
      message: 'Something went wrong, please try again later.',
    });
  }
};

const clientAuthMiddleWare = async (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).send();
  }
  let token = req.header('authorization');
  if (token) {
    try {
      let user = await ClientUser.findByToken(token);
      if (user) {
        req.user = user;
        req.token = token;
        next();
      } else {
        res.status(401).send({
          status: 'ERROR',
          messageCode: 'UNAUTHORIZED',
          message: 'Auth-Token is not valid',
        });
      }
    } catch (e) {
      Logger.log.warn('Error occurred.', e.message || e);
      res.status(401).send({
        status: 'ERROR',
        messageCode: 'UNAUTHORIZED',
        message: 'Auth-Token is not valid',
      });
    }
  } else {
    Logger.log.warn('JWT - Auth-Token not set in header');
    res.status(401).send({
      status: 'ERROR',
      messageCode: 'TOKEN_NOT_FOUND',
      message: 'Auth-Token not set in header',
    });
  }
};

module.exports = {
  authMiddleWare,
  checkModuleAccess,
  clientAuthMiddleWare,
};

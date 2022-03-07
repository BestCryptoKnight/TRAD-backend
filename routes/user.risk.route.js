/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
let mongoose = require('mongoose');
const User = mongoose.model('user');
const Client = mongoose.model('client');

/*
 * Local Imports
 * */
const config = require('../config');
const MailHelper = require('./../helper/mailer.helper');
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const {
  addAuditLog,
  getRegexForSearch,
} = require('./../helper/audit-log.helper');
const { sendNotification } = require('../helper/socket.helper');

/**
 * Gets the List of Module Access
 */
router.get('/module-access', async function (req, res) {
  try {
    let userData = await User.findById(req.user._id).select({
      moduleAccess: 1,
    });
    res.status(200).send({ status: 'SUCCESS', data: userData });
  } catch (e) {
    Logger.log.error(
      'Error occurred in getting user module access',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later',
    });
  }
});

/**
 * Get Column Names
 */
router.get('/column-name', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'user');
    const userColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'user',
    );
    let customFields = [];
    let defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (userColumn.columns.includes(module.manageColumns[i].name)) {
        if (module.defaultColumns.includes(module.manageColumns[i].name)) {
          defaultFields.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            isChecked: true,
          });
        } else {
          customFields.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            isChecked: true,
          });
        }
      } else {
        if (module.defaultColumns.includes(module.manageColumns[i].name)) {
          defaultFields.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            isChecked: false,
          });
        } else {
          customFields.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            isChecked: false,
          });
        }
      }
    }
    res
      .status(200)
      .send({ status: 'SUCCESS', data: { defaultFields, customFields } });
  } catch (e) {
    Logger.log.error('Error occurred in get column names', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later',
    });
  }
});

/**
 * Get Client Names
 */
router.get('/client-name', async function (req, res) {
  try {
    const [riskAnalystList, serviceManagerList] = await Promise.all([
      Client.find({
        $or: [
          { riskAnalystId: { $exists: false } },
          { riskAnalystId: { $eq: null } },
        ],
      })
        .select({ name: 1, _id: 1 })
        .lean(),
      Client.find({
        $or: [
          { serviceManagerId: { $exists: false } },
          { serviceManagerId: { $eq: null } },
        ],
      })
        .select({ name: 1, _id: 1 })
        .lean(),
    ]);
    res.status(200).send({
      status: 'SUCCESS',
      data: { riskAnalystList, serviceManagerList },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get client name list ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later',
    });
  }
});

/**
 * Resend Mail to User
 */
router.get('/send-mail/:userId', async function (req, res) {
  if (
    !req.params.userId ||
    !mongoose.Types.ObjectId.isValid(req.params.userId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const user = await User.findOne({ _id: req.params.userId });
    const signUpToken = jwt.sign(
      JSON.stringify({
        _id: user._id,
        expiredTime: config.jwt.linkExpireTime * 60 * 60 * 1000 + Date.now(),
      }),
      config.jwt.secret,
    );
    user.signUpToken = signUpToken;
    const promises = [];
    promises.push(user.save());
    const mailObj = {
      toAddress: [user.email],
      subject: 'Welcome to TCR',
      text: {
        name: user.name ? user.name : '',
        setPasswordLink:
          config.server.frontendUrls.adminPanelBase +
          config.server.frontendUrls.setPasswordPage +
          '?token=' +
          signUpToken,
      },
      mailFor: 'newAdminUser',
    };
    promises.push(MailHelper.sendMail(mailObj));
    await Promise.all(promises);
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Mail sent successfully' });
  } catch (e) {
    Logger.log.error('Error occurred in sending mail to user ', e.message || e);
  }
});

/**
 * Get details of a user
 */
router.get('/:userId', async function (req, res) {
  if (
    !req.params.userId ||
    !mongoose.Types.ObjectId.isValid(req.params.userId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  let userId = req.params.userId;
  try {
    const systemModules = require('./../static-files/systemModules');
    const userData = await User.findById(userId)
      .select({
        name: 1,
        email: 1,
        contactNumber: 1,
        role: 1,
        moduleAccess: 1,
        signUpToken: 1,
        maxCreditLimit: 1,
      })
      .lean();
    if (userData) {
      const query =
        userData.role === 'riskAnalyst'
          ? { riskAnalystId: req.params.userId }
          : { serviceManagerId: req.params.userId };
      const clientIds = await Client.find(query)
        .select({ name: 1, _id: 1 })
        .lean();
      const moduleNames = userData.moduleAccess.map((i) => i.name);
      let modules = {};
      systemModules.modules.forEach((i) => {
        modules[i.name] = i;
        if (!moduleNames.includes(i.name)) {
          userData.moduleAccess.push({ name: i.name, accessTypes: [] });
        }
      });
      userData.moduleAccess.forEach((i) => {
        if (modules[i.name]) {
          i.isDefault = modules[i.name]['isDefault'];
          i.label = modules[i.name]['label'];
        }
      });
      userData.clientIds = clientIds;
      userData.clientIds.forEach((i) => {
        i.value = i._id;
        i.label = i.name;
        delete i._id;
        delete i.name;
      });
      userData.status = userData.signUpToken ? 'Pending' : 'Active';
      delete userData.signUpToken;
      Logger.log.info('Fetched details of user successfully.');
      res.status(200).send({ status: 'SUCCESS', data: userData });
    } else {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'NO_USER_FOUND',
        message: 'No user found',
      });
    }
  } catch (e) {
    Logger.log.error('Error occurred in get user by id', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later',
    });
  }
});

/**
 * Get the List of User
 */
router.get('/', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'user');
    const userColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'user',
    );
    let queryFilter = {
      isDeleted: false,
    };
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      queryFilter._id = req.user._id;
    }
    let sortingOptions = {};
    if (req.query.sortBy && req.query.sortOrder) {
      sortingOptions[req.query.sortBy] = req.query.sortOrder;
    }
    if (req.query.search)
      queryFilter.name = {
        $regex: getRegexForSearch(req.query.search),
        $options: 'i',
      };
    if (req.query.role) {
      queryFilter.role = req.query.role;
    }
    if (req.query.startDate && req.query.endDate) {
      queryFilter.createdAt = {
        $gte: req.query.startDate,
        $lte: req.query.endDate,
      };
    }
    let option = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 5,
    };
    // option.select = {name: 1, email: 1, role: 1, createdAt: 1, contactNumber: 1, signUpToken: 1, moduleAccess: 1};
    option.select =
      userColumn.columns.toString().replace(/,/g, ' ') + ' signUpToken';
    option.sort = sortingOptions;
    option.lean = true;
    let responseObj = await User.paginate(queryFilter, option);
    responseObj.headers = [];
    let showStatus = false;
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (userColumn.columns.includes(module.manageColumns[i].name)) {
        if (module.manageColumns[i].name === 'status') {
          showStatus = true;
        }
        responseObj.headers.push(module.manageColumns[i]);
      }
    }
    if (responseObj && responseObj.docs && responseObj.docs.length !== 0) {
      responseObj.docs.forEach((user) => {
        if (user.role) {
          user.role =
            user.role.charAt(0).toUpperCase() +
            user.role
              .slice(1)
              .replace(/([A-Z])/g, ' $1')
              .trim();
        }
        if (showStatus) {
          if (!user.signUpToken) user.status = 'Active';
          else user.status = 'Pending';
        }
        delete user.signUpToken;
        delete user.id;
      });
    }
    res.status(200).send({ status: 'SUCCESS', data: responseObj });
  } catch (e) {
    Logger.log.error('Error occurred in list users', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later',
    });
  }
});

/**
 * Creates User
 */
router.post('/', async function (req, res) {
  if (!req.body.email) {
    Logger.log.warn('Email not present for new user');
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'EMAIL_NOT_FOUND',
      message: 'Please enter email for new user',
    });
  }
  try {
    const userData = await User.findOne({
      email: {
        $regex: new RegExp('^' + req.body.email.toLowerCase() + '$', 'i'),
      },
      isDeleted: false,
    }).lean();
    if (userData) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'USER_EXISTS',
        message: 'User already exists',
      });
    } else {
      // TODO add basic/default modules for the right
      let manageColumns = [];
      for (let i = 0; i < StaticFile.modules.length; i++) {
        manageColumns.push({
          moduleName: StaticFile.modules[i].name,
          columns: StaticFile.modules[i].defaultColumns,
        });
      }
      let objToSave = req.body;
      objToSave.maxCreditLimit = req.body.maxCreditLimit
        ? req.body.maxCreditLimit
        : 0;
      objToSave.createdBy = req.user._id;
      objToSave.organizationId = req.user.organizationId;
      objToSave.manageColumns = manageColumns;
      let user = new User(objToSave);
      Logger.log.info('New user created successfully.');
      if (
        req.body.hasOwnProperty('clientIds') &&
        req.body.clientIds.length !== 0
      ) {
        const update =
          objToSave.role === 'riskAnalyst'
            ? { riskAnalystId: user._id }
            : { serviceManagerId: user._id };
        await Client.updateMany({ _id: req.body.clientIds }, { $set: update });
      }

      //NOTE - token will expire in 12 hours
      const signUpToken = jwt.sign(
        JSON.stringify({
          _id: user._id,
          expiredTime: config.jwt.linkExpireTime * 60 * 60 * 1000 + Date.now(),
        }),
        config.jwt.secret,
      );
      user.signUpToken = signUpToken;
      await user.save();
      let mailObj = {
        toAddress: [user.email],
        subject: 'Welcome to TCR',
        text: {
          name: user.name ? user.name : '',
          setPasswordLink:
            config.server.frontendUrls.adminPanelBase +
            config.server.frontendUrls.setPasswordPage +
            '?token=' +
            signUpToken,
        },
        mailFor: 'newAdminUser',
      };
      await addAuditLog({
        entityType: 'user',
        entityRefId: user._id,
        userType: 'user',
        userRefId: req.user._id,
        actionType: 'add',
        logDescription: `A new user ${user.name} is created by ${req.user.name}`,
      });
      res.status(200).send({
        status: 'SUCCESS',
        message: 'User created successfully',
        userId: user._id,
      });
      await MailHelper.sendMail(mailObj);
      Logger.log.info('Mail sent to new user successfully.');
    }
  } catch (e) {
    Logger.log.error('Error occurred in create user', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update Column Names
 */
router.put('/column-name', async function (req, res) {
  if (!req.body.hasOwnProperty('isReset') || !req.body.columns) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let updateColumns = [];
    if (req.body.isReset) {
      const module = StaticFile.modules.find((i) => i.name === 'user');
      updateColumns = module.defaultColumns;
    } else {
      updateColumns = req.body.columns;
    }
    await User.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': 'user' },
      { $set: { 'manageColumns.$.columns': updateColumns } },
    );
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Columns updated successfully' });
  } catch (e) {
    Logger.log.error('Error occurred in update column names', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Updates a User
 */
router.put('/:userId', async function (req, res) {
  Logger.log.info('In user update call');
  if (
    !req.params.userId ||
    !mongoose.Types.ObjectId.isValid(req.params.userId)
  ) {
    Logger.log.warn('User id not found in request query params.');
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    let updateObj = {};
    let sendSocketEvent = false;
    const user = await User.findById(req.params.userId).lean();
    if (req.body.name) updateObj.name = req.body.name;
    updateObj.maxCreditLimit = req.body.maxCreditLimit
      ? req.body.maxCreditLimit
      : null;
    updateObj.contactNumber = req.body.contactNumber
      ? req.body.contactNumber
      : '';
    if (req.body.role) updateObj.role = req.body.role;
    if (req.body.moduleAccess) {
      updateObj.moduleAccess = req.body.moduleAccess;
      sendSocketEvent = true;
    }
    let promises = [];
    if (updateObj.role !== user.role) {
      const query =
        user.role === 'riskAnalyst'
          ? { riskAnalystId: req.params.userId }
          : { serviceManagerId: req.params.userId };
      const removeUser =
        user.role === 'riskAnalyst'
          ? { riskAnalystId: null }
          : { serviceManagerId: null };
      await Client.updateMany(query, removeUser);
    } else if (req.body.role === user.role && req.body.clientIds.length === 0) {
      const query =
        user.role === 'riskAnalyst'
          ? { riskAnalystId: req.params.userId }
          : { serviceManagerId: req.params.userId };
      const removeUser =
        user.role === 'riskAnalyst'
          ? { riskAnalystId: null }
          : { serviceManagerId: null };
      await Client.updateMany(query, removeUser);
    }
    if (
      req.body.hasOwnProperty('clientIds') &&
      req.body.clientIds.length !== 0
    ) {
      const query =
        updateObj.role === 'riskAnalyst'
          ? { riskAnalystId: req.params.userId }
          : { serviceManagerId: req.params.userId };
      const removeUser =
        updateObj.role === 'riskAnalyst'
          ? { riskAnalystId: null }
          : { serviceManagerId: null };
      const clients = await Client.find(query).lean();
      const oldClients = clients.map((i) => i._id.toString());

      if (clients.length === 0) {
        promises.push(
          Client.updateMany(
            { _id: { $in: req.body.clientIds } },
            { $set: query },
          ),
        );
      } else {
        let newClients = [];
        let sameClients = [];
        req.body.clientIds.forEach((id) => {
          if (oldClients.includes(id)) {
            oldClients.splice(oldClients.indexOf(id), 1);
            sameClients.push(id);
          } else {
            newClients.push(id);
          }
        });
        sameClients = sameClients.concat(newClients);
        promises.push(
          Client.updateMany({ _id: { $in: sameClients } }, { $set: query }),
        );
        promises.push(
          Client.updateMany({ _id: { $in: oldClients } }, { $set: removeUser }),
        );
      }
    }
    await User.updateOne({ _id: req.params.userId }, updateObj, { new: true });
    await addAuditLog({
      entityType: 'user',
      entityRefId: req.params.userId,
      userType: 'user',
      userRefId: req.user._id,
      actionType: 'edit',
      logDescription: `User ${user.name} is updated by ${req.user.name}`,
    });
    await Promise.all(promises);
    Logger.log.info('User Updated successfully.');
    if (sendSocketEvent) {
      sendNotification({
        notificationObj: {
          type: 'UPDATE_USER_PRIVILEGE',
          data: req.body.moduleAccess,
        },
        type: 'user',
        userId: req.params.userId,
      });
    }
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'User updated successfully.' });
  } catch (e) {
    Logger.log.error('Error occurred in update user', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Deletes a user
 */
router.delete('/:userId', async function (req, res) {
  if (
    !req.params.userId ||
    !mongoose.Types.ObjectId.isValid(req.params.userId)
  ) {
    Logger.log.warn('User id not found.');
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    if (req.user._id.toString() === req.params.userId) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'CAN_NOT_DELETE_SELF',
        message: "User can't remove him/her-self",
      });
    }
    await User.updateOne({ _id: req.params.userId }, { isDeleted: true });
    const user = await User.findOne({ _id: req.params.userId })
      .select('name')
      .lean();
    await Promise.all([
      addAuditLog({
        entityType: 'user',
        entityRefId: req.params.userId,
        userType: 'user',
        userRefId: req.user._id,
        actionType: 'delete',
        logDescription: `User ${
          user && user.name ? user.name : ''
        } is deleted by ${req.user.name}`,
      }),
      Client.updateMany(
        { riskAnalystId: req.params.userId },
        {
          riskAnalystId: null,
        },
        { multi: true },
      ),
      Client.updateMany(
        { serviceManagerId: req.params.userId },
        { serviceManagerId: null },
        { multi: true },
      ),
    ]);
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'User deleted successfully' });
  } catch (e) {
    Logger.log.error('Error occurred in delete user by id', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Export Router
 */
module.exports = router;

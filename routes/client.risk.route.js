/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
let mongoose = require('mongoose');
let User = mongoose.model('user');
const Client = mongoose.model('client');
const ClientUser = mongoose.model('client-user');

/*
 * Local Imports
 * */
const config = require('../config');
const Logger = require('./../services/logger');
const MailHelper = require('./../helper/mailer.helper');
const RssHelper = require('./../helper/rss.helper');
const StaticFile = require('./../static-files/moduleColumn');
const { addAuditLog } = require('./../helper/audit-log.helper');
const { getUserList } = require('./../helper/user.helper');

//client
/**
 * Search Client from RSS
 */
router.get('/search-from-crm', async function (req, res) {
  if (!req.query.searchKeyword) {
    Logger.log.error('No text passed to perform search.');
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Pass some text to perform search.',
    });
  }
  try {
    let searchKeyword = req.query.searchKeyword;
    let clients = await RssHelper.getClients({ searchKeyword });
    let clientIds = clients.map((client) => client.id);
    let dbClients = await Client.find({
      isDeleted: false,
      crmClientId: { $in: clientIds },
    }).select({ crmClientId: 1 });
    let responseArr = [];
    dbClients = dbClients.map((dbClient) => dbClient.crmClientId);
    for (let i = 0; i < clients.length; i++) {
      if (dbClients.indexOf(clients[i].id.toString()) === -1) {
        responseArr.push({ crmId: clients[i].id, name: clients[i].name });
      }
    }
    res.status(200).send({ status: 'SUCCESS', data: responseArr });
  } catch (e) {
    Logger.log.error(
      'Error occurred in getting client list for search.',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Column Names
 */
router.get('/user/column-name', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'client-user');
    const clientUserColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'client-user',
    );
    const customFields = [];
    const defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (
        clientUserColumn &&
        clientUserColumn.columns.includes(module.manageColumns[i].name)
      ) {
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
    Logger.log.error(
      'Error occurred in get client-user column names',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get User List
 */
router.get('/user-list', async function (req, res) {
  try {
    const { riskAnalystList, serviceManagerList } = await getUserList();
    res.status(200).send({
      status: 'SUCCESS',
      data: { riskAnalystList, serviceManagerList },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get user list ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * List Client User details
 */
router.get('/user/:clientId', async function (req, res) {
  if (!req.params.clientId) {
    Logger.log.error('No clientId passed.');
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const module = StaticFile.modules.find((i) => i.name === 'client-user');
    const clientColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'client-user',
    );
    const fields = clientColumn.columns.map((i) => [i, 1]);
    let queryFilter = {
      isDeleted: false,
      clientId: mongoose.Types.ObjectId(req.params.clientId),
    };
    let sortingOptions = {};
    let aggregationQuery = [
      { $match: queryFilter },
      {
        $project: fields.reduce((obj, [key, val]) => {
          obj[key] = val;
          return obj;
        }, {}),
      },
    ];
    if (req.query.sortBy && req.query.sortOrder) {
      sortingOptions[req.query.sortBy] =
        req.query.sortOrder === 'desc' ? -1 : 1;
      aggregationQuery.push({ $sort: sortingOptions });
    }
    aggregationQuery.push({
      $skip: (parseInt(req.query.page) - 1) * parseInt(req.query.limit),
    });
    aggregationQuery.push({ $limit: parseInt(req.query.limit) });
    const [clientUsers, total] = await Promise.all([
      ClientUser.aggregate(aggregationQuery).allowDiskUse(true),
      ClientUser.countDocuments(queryFilter).lean(),
    ]);

    const headers = [];
    let checkForLink = false;
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (clientColumn.columns.includes(module.manageColumns[i].name)) {
        if (
          module.manageColumns[i].name === 'name' ||
          module.manageColumns[i].name === 'hasPortalAccess'
        ) {
          checkForLink = true;
        }
        headers.push(module.manageColumns[i]);
      }
    }
    if (checkForLink && clientUsers.length !== 0) {
      clientUsers.forEach((user) => {
        if (user.name && user.name.length !== 0) {
          user.name = {
            id: user._id,
            value: user.name,
          };
        }
        if (user.hasOwnProperty('hasPortalAccess')) {
          user.hasPortalAccess = {
            id: user._id,
            value: user.hasPortalAccess,
          };
        }
        if (user.isDecisionMaker && user.isDecisionMaker.length !== 0) {
          user.isDecisionMaker = user.isDecisionMaker ? 'Yes' : 'No';
        }
        if (user.hasLeftCompany && user.hasLeftCompany.length !== 0) {
          user.hasLeftCompany = user.hasLeftCompany ? 'Yes' : 'No';
        }
      });
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: clientUsers,
        headers,
        total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(total / parseInt(req.query.limit)),
      },
    });
  } catch (e) {
    Logger.log.error('Error occurred in listing clients.', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Client User details
 */
router.get('/user-details/:clientUserId', async function (req, res) {
  if (!req.params.clientUserId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const module = StaticFile.modules.find((i) => i.name === 'client-user');
    const clientUser = await ClientUser.findOne({
      _id: req.params.clientUserId,
    })
      .select(
        'name contactNumber department hasPortalAccess hasLeftCompany isDecisionMaker email createdAt updatedAt',
      )
      .lean();
    let response = [];
    module.manageColumns.forEach((i) => {
      if (clientUser.hasOwnProperty(i.name)) {
        if (
          i.name === 'isDecisionMaker' ||
          i.name === 'hasPortalAccess' ||
          i.name === 'hasLeftCompany'
        ) {
          clientUser[i.name] = clientUser[i.name] ? 'Yes' : 'No';
        }
        response.push({
          label: i.label,
          value: clientUser[i.name] || '-',
          type: i.type,
        });
      }
    });
    res.status(200).send({ status: 'SUCCESS', data: response });
  } catch (e) {
    Logger.log.error('Error occurred in listing clients.', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Column Names
 */
router.get('/column-name', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'client');
    const clientColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'client',
    );
    let customFields = [];
    let defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (
        clientColumn &&
        clientColumn.columns.includes(module.manageColumns[i].name)
      ) {
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
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

//client
/**
 * List Clients
 */
router.get('/', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'client');
    const clientColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'client',
    );
    let queryFilter = { isDeleted: false };
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      queryFilter = {
        isDeleted: false,
        $or: [
          { riskAnalystId: req.user._id },
          { serviceManagerId: req.user._id },
        ],
      };
    }
    if (req.query.sector) {
      queryFilter.sector = req.query.sector;
    }
    if (req.query.inceptionStartDate && req.query.inceptionEndDate) {
      queryFilter.inceptionDate = {
        $gte: req.query.inceptionStartDate,
        $lt: req.query.inceptionEndDate,
      };
    }
    if (req.query.expiryStartDate && req.query.expiryEndDate) {
      queryFilter.expiryDate = {
        $gte: req.query.expiryStartDate,
        $lt: req.query.expiryEndDate,
      };
    }
    let sortingOptions = {};

    let aggregationQuery = [];
    if (
      req.query.serviceManagerId ||
      clientColumn.columns.includes('serviceManagerId')
    ) {
      aggregationQuery.push({
        $lookup: {
          from: 'users',
          localField: 'serviceManagerId',
          foreignField: '_id',
          as: 'serviceManagerId',
        },
      });
    }
    if (req.query.serviceManagerId) {
      aggregationQuery.push({
        $match: {
          'serviceManagerId.name': req.query.serviceManagerId,
        },
      });
    }
    if (
      req.query.riskAnalystId ||
      clientColumn.columns.includes('riskAnalystId')
    ) {
      aggregationQuery.push({
        $lookup: {
          from: 'users',
          localField: 'riskAnalystId',
          foreignField: '_id',
          as: 'riskAnalystId',
        },
      });
    }
    if (req.query.riskAnalystId) {
      aggregationQuery.push({
        $match: {
          'riskAnalystId.name': req.query.riskAnalystId,
        },
      });
    }
    clientColumn.columns.push('address');
    const fields = clientColumn.columns.map((i) => {
      if (i === 'serviceManagerId' || i === 'riskAnalystId') {
        i = i + '.name';
      }
      return [i, 1];
    });
    aggregationQuery.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });
    if (req.query.sortBy && req.query.sortOrder) {
      const addressFields = [
        'fullAddress',
        'addressLine',
        'city',
        'state',
        'country',
        'zipCode',
      ];
      if (addressFields.includes(req.query.sortBy)) {
        req.query.sortBy = 'address.' + req.query.sortBy;
      }
      sortingOptions[req.query.sortBy] =
        req.query.sortOrder === 'desc' ? -1 : 1;
      aggregationQuery.push({ $sort: sortingOptions });
    }
    aggregationQuery.push({
      $skip: (parseInt(req.query.page) - 1) * parseInt(req.query.limit),
    });
    aggregationQuery.push({ $limit: parseInt(req.query.limit) });
    aggregationQuery.unshift({ $match: queryFilter });

    const [clients, total] = await Promise.all([
      Client.aggregate(aggregationQuery).allowDiskUse(true),
      Client.countDocuments(queryFilter).lean(),
    ]);

    const headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (clientColumn.columns.includes(module.manageColumns[i].name)) {
        headers.push(module.manageColumns[i]);
      }
    }
    if (clients && clients.length !== 0) {
      clients.forEach((user) => {
        if (
          clientColumn.columns.includes('riskAnalystId') &&
          user.riskAnalystId
        ) {
          user.riskAnalystId = user.riskAnalystId[0]
            ? user.riskAnalystId[0].name
            : '';
        }
        if (
          clientColumn.columns.includes('serviceManagerId') &&
          user.serviceManagerId
        ) {
          user.serviceManagerId = user.serviceManagerId[0]
            ? user.serviceManagerId[0].name
            : '';
        }
        if (clientColumn.columns.includes('fullAddress')) {
          user.fullAddress = Object.values(user.address)
            .toString()
            .replace(/,,/g, ',');
        }
        if (clientColumn.columns.includes('addressLine')) {
          user.addressLine = user.address.addressLine;
        }
        if (clientColumn.columns.includes('city')) {
          user.city = user.address.city;
        }
        if (clientColumn.columns.includes('state')) {
          user.state = user.address.state;
        }
        if (clientColumn.columns.includes('country')) {
          user.country = user.address.country;
        }
        if (clientColumn.columns.includes('zipCode')) {
          user.zipCode = user.address.zipCode;
        }
        delete user.address;
      });
    }

    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: clients,
        headers,
        total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(total / parseInt(req.query.limit)),
      },
    });
  } catch (e) {
    Logger.log.error('Error occurred in listing clients.', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

//client
/**
 * Get Client
 */
router.get('/:clientId', async function (req, res) {
  try {
    if (!req.params.clientId) {
      Logger.log.error('No clientId passed.');
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Require fields are missing',
      });
    }
    const client = await Client.findOne({ _id: req.params.clientId })
      .populate({ path: 'riskAnalystId serviceManagerId', select: 'name' })
      .lean();
    const { riskAnalystList, serviceManagerList } = await getUserList();
    client.riskAnalystList = riskAnalystList;
    client.serviceManagerList = serviceManagerList;
    res.status(200).send({ status: 'SUCCESS', data: client });
  } catch (e) {
    Logger.log.error('Error occurred in listing clients.', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

//client
/**
 * Add Client from RSS
 */
router.post('/', async function (req, res) {
  try {
    if (!req.body.crmIds || req.body.crmIds.length === 0) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Please pass client id.',
      });
    }
    let clients = await Client.find({
      isDeleted: false,
      crmClientId: { $in: req.body.crmIds },
    });
    if (clients && clients.length !== 0) {
      const clientIds = clients.map((i) => i.crmClientId);
      let newClients = [];
      req.body.crmIds.forEach((id) => {
        if (!clientIds.includes(id)) {
          newClients.push(id);
        }
      });
      if (newClients.length === 0) {
        return res.status(400).send({
          status: 'ERROR',
          message: 'Client already exists in the system.',
        });
      }
      req.body.crmIds = newClients;
    }
    const clientData = await RssHelper.getClientsById({
      crmIds: req.body.crmIds,
    });
    let promiseArr = [];
    for (let i = 0; i < clientData.length; i++) {
      let client = new Client(clientData[i]);
      await RssHelper.fetchInsurerDetails({
        underwriterName: clientData[i].underWriter,
        crmClientId: clientData[i].crmClientId,
        clientId: client._id,
      });
      const contactsFromCrm = await RssHelper.getClientContacts({
        clientId: clientData[i].crmClientId,
      });
      contactsFromCrm.forEach((crmContact) => {
        let clientUser = new ClientUser(crmContact);
        clientUser.clientId = client._id;
        let signUpToken = jwt.sign(
          JSON.stringify({ _id: clientUser._id }),
          config.jwt.secret,
        );
        clientUser.signUpToken = signUpToken;
        promiseArr.push(clientUser.save());
        const userName =
          (clientUser.firstName ? clientUser.firstName + ' ' : '') +
          (clientUser.lastName ? clientUser.lastName : '');
        let mailObj = {
          toAddress: [clientUser.email],
          subject: 'Welcome to TRAD CLIENT PORTAL',
          text: {
            name: userName,
            setPasswordLink:
              config.server.frontendUrls.clientPanelBase +
              config.server.frontendUrls.setPasswordPage +
              clientUser._id +
              '?token=' +
              signUpToken,
          },
          mailFor: 'newClientUser',
        };
        promiseArr.push(MailHelper.sendMail(mailObj));
      });
      promiseArr.push(client.save());
    }
    await Promise.all(promiseArr);
    /*await addAuditLog({
      entityType: 'client',
      entityRefId: client._id,
      userType: 'user',
      userRefId: req.user._id,
      actionType: 'add',
      logDescription: 'Client added successfully.',
    });*/
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'client data synced successfully' });
  } catch (e) {
    console.log('ERROR ::: ', e);
  }
});

//client
/**
 * Sync Client from RSS - Update
 */
router.put('/sync-from-crm/:clientId', async function (req, res) {
  try {
    if (!req.params.clientId) {
      Logger.log.error('No clientId passed.');
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Require fields are missing',
      });
    }
    let client = await Client.findOne({ _id: req.params.clientId });
    if (!client) {
      Logger.log.error('No Client found', req.params.crmId);
      return res
        .status(400)
        .send({ status: 'ERROR', message: 'Client not found.' });
    }
    let clientDataFromCrm = await RssHelper.getClientById({
      clientId: client.crmClientId,
    });
    await Client.updateOne({ _id: req.params.clientId }, clientDataFromCrm);
    await addAuditLog({
      entityType: 'client',
      entityRefId: req.params.clientId,
      userType: 'user',
      userRefId: req.user._id,
      actionType: 'sync',
      logDescription: 'Client synced successfully.',
    });
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Client synced successfully' });
  } catch (e) {
    Logger.log.error(
      'Error occurred in getting client list for search.',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Sync Client Users from RSS - Update
 */
router.put('/user/sync-from-crm/:clientId', async function (req, res) {
  try {
    if (!req.params.clientId) {
      Logger.log.error('No clientId passed.');
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Require fields are missing',
      });
    }
    let client = await Client.findOne({ _id: req.params.clientId });
    if (!client) {
      Logger.log.error('No Client found', req.params.crmId);
      return res
        .status(400)
        .send({ status: 'ERROR', message: 'Client not found.' });
    }
    let contactsFromCrm = await RssHelper.getClientContacts({
      clientId: client.crmClientId,
    });
    let promiseArr = [];
    contactsFromCrm.forEach((crmContact) => {
      promiseArr.push(
        ClientUser.findOneAndUpdate(
          { crmContactId: crmContact.crmContactId, isDeleted: false },
          crmContact,
          { upsert: true },
        ),
      );
    });
    await Promise.all(promiseArr);
    await addAuditLog({
      entityType: 'client',
      entityRefId: req.params.clientId,
      userType: 'user',
      userRefId: req.user._id,
      actionType: 'sync',
      logDescription: 'Client contacts synced successfully.',
    });
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Client Contacts synced successfully',
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in getting client list for search.',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update Column Names
 */
router.put('/user/column-name', async function (req, res) {
  if (!req.user || !req.user._id) {
    Logger.log.error('User data not found in req');
    return res.status(401).send({
      status: 'ERROR',
      message: 'Please first login to update the profile.',
    });
  }
  if (!req.body.hasOwnProperty('isReset') || !req.body.columns) {
    Logger.log.error('Require fields are missing');
    return res.status(400).send({
      status: 'ERROR',
      message: 'Something went wrong, please try again.',
    });
  }
  try {
    let updateColumns = [];
    if (req.body.isReset) {
      const module = StaticFile.modules.find((i) => i.name === 'client-user');
      updateColumns = module.defaultColumns;
    } else {
      updateColumns = req.body.columns;
    }
    await User.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': 'client-user' },
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
 * Update Client User
 */
router.put('/user/:clientUserId', async function (req, res) {
  try {
    if (!req.params.clientUserId) {
      Logger.log.error('No clientUserId passed.');
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Require fields are missing',
      });
    }
    //TODO send mail on Portal-Access
    await ClientUser.updateOne({ _id: req.params.clientUserId }, req.body);
    await addAuditLog({
      entityType: 'client',
      entityRefId: req.params.clientUserId,
      userType: 'user',
      userRefId: req.user._id,
      actionType: 'edit',
      logDescription: 'Client user updated successfully.',
    });
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Client User updated successfully' });
  } catch (e) {
    Logger.log.error(
      'Error occurred in getting client list for search.',
      e.message || e,
    );
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
  if (!req.user || !req.user._id) {
    Logger.log.error('User data not found in req');
    return res.status(401).send({
      status: 'ERROR',
      message: 'Please first login to update the profile.',
    });
  }
  if (!req.body.hasOwnProperty('isReset') || !req.body.columns) {
    Logger.log.error('Require fields are missing');
    return res.status(400).send({
      status: 'ERROR',
      message: 'Something went wrong, please try again.',
    });
  }
  try {
    let updateColumns = [];
    if (req.body.isReset) {
      const module = StaticFile.modules.find((i) => i.name === 'client');
      updateColumns = module.defaultColumns;
    } else {
      updateColumns = req.body.columns;
    }
    await User.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': 'client' },
      { 'manageColumns.$.columns': updateColumns },
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

//client
/**
 * Update Client
 */
router.put('/:clientId', async function (req, res) {
  try {
    if (!req.params.clientId) {
      Logger.log.error('No clientId passed.');
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Require fields are missing',
      });
    }
    await Client.updateOne({ _id: req.params.clientId }, req.body);
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Client updated successfully' });
  } catch (e) {
    Logger.log.error(
      'Error occurred in getting client list for search.',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

//client
/**
 * Delete Client
 */
router.delete('/:clientId', async function (req, res) {
  try {
    if (!req.params.clientId) {
      Logger.log.error('No clientId passed.');
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Require fields are missing',
      });
    }
    let promiseArr = [];
    promiseArr.push(
      Client.updateOne({ _id: req.params.clientId }, { isDeleted: true }),
    );
    promiseArr.push(
      ClientUser.updateMany(
        { clientId: req.params.clientId },
        { isDeleted: true },
      ),
    );
    await Promise.all(promiseArr);
    await addAuditLog({
      entityType: 'client',
      entityRefId: req.params.clientId,
      userType: 'user',
      userRefId: req.user._id,
      actionType: 'delete',
      logDescription: 'Client removed successfully.',
    });
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Client deleted successfully' });
  } catch (e) {
    Logger.log.error(
      'Error occurred in getting client list for search.',
      e.message || e,
    );
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

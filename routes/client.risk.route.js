/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
let mongoose = require('mongoose');
let User = mongoose.model('user');
const Client = mongoose.model('client');
const ClientDebtor = mongoose.model('client-debtor');
const ClientUser = mongoose.model('client-user');
const Application = mongoose.model('application');

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
const { getClientDebtorDetails } = require('./../helper/client-debtor.helper');
const { getDebtorFullAddress } = require('./../helper/debtor.helper');
const { generateNewApplication } = require('./../helper/application.helper');

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
    let responseArr = [];
    if (clients) {
      let clientIds = clients.map((client) => client.id);
      let dbClients = await Client.find({
        isDeleted: false,
        crmClientId: { $in: clientIds },
      }).select({ crmClientId: 1 });
      dbClients = dbClients.map((dbClient) => dbClient.crmClientId);
      for (let i = 0; i < clients.length; i++) {
        if (dbClients.indexOf(clients[i].id.toString()) === -1) {
          responseArr.push({ crmId: clients[i].id, name: clients[i].name });
        }
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
 * Get Column Names
 */
router.get('/credit-limit/column-name', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'credit-limit');
    const clientUserColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'credit-limit',
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
 * Get Credit-Limit Modal details
 */
router.get('/credit-limit/drawer-details/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const module = StaticFile.modules.find((i) => i.name === 'debtor');
    const debtor = await ClientDebtor.findOne({
      _id: req.params.debtorId,
    })
      .populate({
        path: 'debtorId',
        select: { _id: 0, isDeleted: 0, createdAt: 0, updatedAt: 0 },
      })
      .select({ _id: 0, isDeleted: 0, clientId: 0, __v: 0 })
      .lean();
    if (!debtor) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'NO_DEBTOR_FOUND',
        message: 'No debtor found',
      });
    }
    const response = await getClientDebtorDetails({
      debtor,
      manageColumns: module.manageColumns,
    });
    res.status(200).send({ status: 'SUCCESS', data: response });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get debtor modal details ',
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
  if (
    !req.params.clientId ||
    !mongoose.Types.ObjectId.isValid(req.params.clientId)
  ) {
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
    req.query.sortBy = req.query.sortBy || '_id';
    req.query.sortOrder = req.query.sortOrder || 'desc';
    req.query.limit = req.query.limit || 5;
    req.query.page = req.query.page || 1;
    if (req.query.search) {
      queryFilter = Object.assign({}, queryFilter, {
        $or: [
          { name: { $regex: req.query.search.trim(), $options: 'i' } },
          { email: { $regex: req.query.search.trim(), $options: 'i' } },
          { contactNumber: { $regex: req.query.search.trim(), $options: 'i' } },
        ],
      });
    }
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
      $facet: {
        paginatedResult: [
          {
            $skip: (parseInt(req.query.page) - 1) * parseInt(req.query.limit),
          },
          { $limit: parseInt(req.query.limit) },
        ],
        totalCount: [
          {
            $count: 'count',
          },
        ],
      },
    });
    const clientUsers = await ClientUser.aggregate(
      aggregationQuery,
    ).allowDiskUse(true);
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
      clientUsers[0]['paginatedResult'].forEach((user) => {
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
    const total =
      clientUsers[0]['totalCount'].length !== 0
        ? clientUsers[0]['totalCount'][0]['count']
        : 0;
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: clientUsers[0].paginatedResult,
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
          value: clientUser[i.name] || '',
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
 * Get Client Modal details
 */
router.get('/details/:clientId', async function (req, res) {
  if (!req.params.clientId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const module = StaticFile.modules.find((i) => i.name === 'client');
    const client = await Client.findOne({
      _id: req.params.clientId,
    })
      .populate({ path: 'riskAnalystId serviceManagerId', select: 'name' })
      .select({ isDeleted: 0, crmClientId: 0, __v: 0 })
      .lean();
    let response = [];
    module.manageColumns.forEach((i) => {
      if (
        i.name === 'addressLine' ||
        i.name === 'city' ||
        i.name === 'state' ||
        i.name === 'country' ||
        i.name === 'zipCode'
      ) {
        response.push({
          label: i.label,
          value: client['address'][i.name] || '',
          type: i.type,
        });
      }
      if (client.hasOwnProperty(i.name)) {
        response.push({
          label: i.label,
          value:
            i.name === 'riskAnalystId' || i.name === 'serviceManagerId'
              ? client[i.name]
                ? client[i.name]['name']
                : ''
              : client[i.name] || '',
          type: i.type,
        });
      }
    });
    res.status(200).send({ status: 'SUCCESS', data: response });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get client modal details ',
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

/**
 * Get Debtor Credit-Limit
 */
router.get('/credit-limit/:clientId', async function (req, res) {
  if (
    !req.params.clientId ||
    !mongoose.Types.ObjectId.isValid(req.params.clientId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const module = StaticFile.modules.find((i) => i.name === 'credit-limit');
    const debtorColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'credit-limit',
    );
    let queryFilter = {
      isActive: true,
      clientId: mongoose.Types.ObjectId(req.params.clientId),
      creditLimit: { $exists: true, $ne: null },
    };
    const aggregationQuery = [
      {
        $lookup: {
          from: 'debtors',
          localField: 'debtorId',
          foreignField: '_id',
          as: 'debtorId',
        },
      },
      {
        $unwind: {
          path: '$debtorId',
        },
      },
    ];

    const fields = debtorColumn.columns.map((i) => {
      const clientDebtorDetails = ['creditLimit', 'createdAt', 'updatedAt'];
      i = clientDebtorDetails.includes(i) ? i : 'debtorId.' + i;
      return [i, 1];
    });
    fields.push(['debtorId.address', 1]);
    aggregationQuery.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });

    if (req.query.search) {
      aggregationQuery.push({
        $match: {
          'debtorId.entityName': { $regex: req.query.search, $options: 'i' },
        },
      });
    }

    const sortingOptions = {};
    if (req.query.sortBy && req.query.sortOrder) {
      const addressFields = [
        'fullAddress',
        'property',
        'unitNumber',
        'streetNumber',
        'streetName',
        'streetType',
        'suburb',
        'state',
        'country',
        'postCode',
      ];
      if (addressFields.includes(req.query.sortBy)) {
        req.query.sortBy = 'debtorId.address.' + req.query.sortBy;
      }
      const clientDebtorDetails = ['creditLimit', 'createdAt', 'updatedAt'];
      req.query.sortBy = clientDebtorDetails.includes(req.query.sortBy)
        ? req.query.sortBy
        : 'debtorId.' + req.query.sortBy;
      sortingOptions[req.query.sortBy] =
        req.query.sortOrder === 'desc' ? -1 : 1;
      aggregationQuery.push({ $sort: sortingOptions });
    }

    aggregationQuery.push({
      $facet: {
        paginatedResult: [
          {
            $skip: (parseInt(req.query.page) - 1) * parseInt(req.query.limit),
          },
          { $limit: parseInt(req.query.limit) },
        ],
        totalCount: [
          {
            $count: 'count',
          },
        ],
      },
    });
    aggregationQuery.unshift({ $match: queryFilter });

    const debtors = await ClientDebtor.aggregate(aggregationQuery).allowDiskUse(
      true,
    );
    const headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (debtorColumn.columns.includes(module.manageColumns[i].name)) {
        headers.push(module.manageColumns[i]);
      }
    }
    debtors[0].paginatedResult.forEach((debtor) => {
      if (debtor.debtorId) {
        for (let key in debtor.debtorId) {
          debtor[key] = debtor.debtorId[key];
        }
        delete debtor.debtorId;
      }
      if (debtorColumn.columns.includes('property')) {
        debtor.property = debtor.address.property;
      }
      if (debtorColumn.columns.includes('unitNumber')) {
        debtor.unitNumber = debtor.address.unitNumber;
      }
      if (debtorColumn.columns.includes('streetNumber')) {
        debtor.streetNumber = debtor.address.streetNumber;
      }
      if (debtorColumn.columns.includes('streetName')) {
        debtor.streetName = debtor.address.streetName;
      }
      if (debtorColumn.columns.includes('streetType')) {
        debtor.streetType = debtor.address.streetType;
      }
      if (debtorColumn.columns.includes('suburb')) {
        debtor.suburb = debtor.address.suburb;
      }
      if (debtorColumn.columns.includes('state')) {
        debtor.state = debtor.address.state;
      }
      if (debtorColumn.columns.includes('country')) {
        debtor.country = debtor.address.country.name;
      }
      if (debtorColumn.columns.includes('postCode')) {
        debtor.postCode = debtor.address.postCode;
      }
      if (debtorColumn.columns.includes('fullAddress')) {
        debtor.fullAddress = getDebtorFullAddress({ address: debtor.address });
      }
      if (debtor.entityType) {
        debtor.entityType = debtor.entityType
          .replace(/_/g, ' ')
          .replace(/\w\S*/g, function (txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
          });
      }
      if (debtor.entityName) {
        debtor.entityName = {
          id: debtor._id,
          value: debtor.entityName,
        };
      }
      delete debtor.address;
      delete debtor.id;
    });

    const total =
      debtors[0]['totalCount'].length !== 0
        ? debtors[0]['totalCount'][0]['count']
        : 0;
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: debtors[0].paginatedResult,
        headers,
        total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(total / parseInt(req.query.limit)),
      },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get client-debtor details ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

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
    req.query.sortBy = req.query.sortBy || '_id';
    req.query.sortOrder = req.query.sortOrder || 'desc';
    req.query.limit = req.query.limit || 5;
    req.query.page = req.query.page || 1;
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
          'serviceManagerId._id': mongoose.Types.ObjectId(
            req.query.serviceManagerId,
          ),
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
          'riskAnalystId._id': mongoose.Types.ObjectId(req.query.riskAnalystId),
        },
      });
    }
    if (req.query.insurerId || clientColumn.columns.includes('insurerId')) {
      aggregationQuery.push({
        $lookup: {
          from: 'insurers',
          localField: 'insurerId',
          foreignField: '_id',
          as: 'insurerId',
        },
      });
    }
    if (req.query.insurerId) {
      aggregationQuery.push({
        $match: {
          'insurerId._id': mongoose.Types.ObjectId(req.query.insurerId),
        },
      });
    }
    clientColumn.columns.push('address');
    const fields = clientColumn.columns.map((i) => {
      if (
        i === 'serviceManagerId' ||
        i === 'riskAnalystId' ||
        i === 'insurerId'
      ) {
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
    /*aggregationQuery.push({
      $skip: (parseInt(req.query.page) - 1) * parseInt(req.query.limit),
    });
    aggregationQuery.push({ $limit: parseInt(req.query.limit) });*/
    aggregationQuery.push({
      $facet: {
        paginatedResult: [
          {
            $skip: (parseInt(req.query.page) - 1) * parseInt(req.query.limit),
          },
          { $limit: parseInt(req.query.limit) },
        ],
        totalCount: [
          {
            $count: 'count',
          },
        ],
      },
    });
    aggregationQuery.unshift({ $match: queryFilter });

    const clients = await Client.aggregate(aggregationQuery).allowDiskUse(true);

    const headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (clientColumn.columns.includes(module.manageColumns[i].name)) {
        headers.push(module.manageColumns[i]);
      }
    }
    if (clients && clients.length !== 0) {
      clients[0].paginatedResult.forEach((user) => {
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
        if (clientColumn.columns.includes('insurerId') && user.insurerId) {
          user.insurerId = user.insurerId[0] ? user.insurerId[0].name : '';
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
        if (clientColumn.columns.includes('fullAddress')) {
          user.fullAddress = getDebtorFullAddress({ address: user.address });
        }
        delete user.address;
      });
    }

    const total =
      clients[0]['totalCount'].length !== 0
        ? clients[0]['totalCount'][0]['count']
        : 0;
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: clients[0].paginatedResult,
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
      .populate({
        path: 'riskAnalystId serviceManagerId insurerId',
        select: '_id name',
      })
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

/**
 * Add Client from RSS
 */
router.post('/', async function (req, res) {
  try {
    if (!req.body.crmIds || req.body.crmIds.length === 0) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Require fields are missing',
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
      const client = new Client(clientData[i]);
      const insurer = await RssHelper.fetchInsurerDetails({
        underwriterName: clientData[i].underWriter,
        crmClientId: clientData[i].crmClientId,
        clientId: client._id,
        auditLog: { userType: 'user', userRefId: req.user._id },
      });
      client.insurerId = insurer && insurer._id ? insurer._id : null;
      const contactsFromCrm = await RssHelper.getClientContacts({
        clientId: clientData[i].crmClientId,
      });
      contactsFromCrm.forEach((crmContact) => {
        let clientUser = new ClientUser(crmContact);
        clientUser.clientId = client._id;
        promiseArr.push(clientUser.save());
        promiseArr.push(
          addAuditLog({
            entityType: 'client-user',
            entityRefId: clientUser._id,
            userType: 'user',
            userRefId: req.user._id,
            actionType: 'add',
            logDescription: `Client contact ${clientUser.name} added successfully.`,
          }),
        );
      });
      promiseArr.push(client.save());
      promiseArr.push(
        addAuditLog({
          entityType: 'client',
          entityRefId: client._id,
          userType: 'user',
          userRefId: req.user._id,
          actionType: 'add',
          logDescription: `Client ${client.name} added successfully.`,
        }),
      );
    }
    await Promise.all(promiseArr);
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'client data synced successfully' });
  } catch (e) {
    Logger.log.error('Error occurred in add clients from CRM ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

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
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'CLIENT_NOT_FOUND',
        message: 'Client not found.',
      });
    }
    const clientDataFromCrm = await RssHelper.getClientById({
      clientId: client.crmClientId,
    });
    await Client.updateOne({ _id: req.params.clientId }, clientDataFromCrm);
    await addAuditLog({
      entityType: 'client',
      entityRefId: req.params.clientId,
      userType: 'user',
      userRefId: req.user._id,
      actionType: 'sync',
      logDescription: `Client ${clientDataFromCrm.name} synced successfully.`,
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
    for (let i = 0; i < contactsFromCrm.length; i++) {
      promiseArr.push(
        ClientUser.updateOne(
          { crmContactId: contactsFromCrm[i].crmContactId, isDeleted: false },
          contactsFromCrm[i],
          { upsert: true },
        ),
      );
      const clientUser = await ClientUser.findOne({
        crmContactId: contactsFromCrm[i].crmContactId,
        isDeleted: false,
      }).lean();
      if (clientUser && clientUser._id) {
        promiseArr.push(
          addAuditLog({
            entityType: 'client-user',
            entityRefId: clientUser._id,
            userType: 'user',
            userRefId: req.user._id,
            actionType: 'sync',
            logDescription: `Client contact ${contactsFromCrm[i].name} synced successfully.`,
          }),
        );
      }
    }
    await Promise.all(promiseArr);
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Client Contacts synced successfully',
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in sync client contacts .',
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
 * Update Column Names
 */
router.put('/credit-limit/column-name', async function (req, res) {
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
      const module = StaticFile.modules.find((i) => i.name === 'credit-limit');
      updateColumns = module.defaultColumns;
    } else {
      updateColumns = req.body.columns;
    }
    await User.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': 'credit-limit' },
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
 * Update credit-limit
 */
router.put('/credit-limit/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId) ||
    !req.body.action
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const clientDebtor = await ClientDebtor.findOne({
      _id: req.params.debtorId,
    }).lean();
    if (req.body.action === 'modify') {
      if (!req.body.creditLimit || !/^\d+$/.test(req.body.creditLimit)) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'REQUIRE_FIELD_MISSING',
          message: 'Require fields are missing',
        });
      }
      await generateNewApplication({
        clientDebtorId: clientDebtor._id,
        createdByType: 'user',
        createdById: req.user._id,
        creditLimit: req.body.creditLimit,
      });
    } else {
      await ClientDebtor.updateOne(
        { _id: req.params.debtorId },
        {
          creditLimit: undefined,
          activeApplicationId: undefined,
          isActive: false,
        },
      );
      await Application.updateOne(
        { clientDebtorId: clientDebtor._id, status: 'APPROVED' },
        { status: 'SURRENDERED' },
      );
    }
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Credit limit updated successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in update credit-limit', e.message || e);
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
  if (
    !req.params.clientUserId ||
    !mongoose.Types.ObjectId.isValid(req.params.clientUserId) ||
    !req.body.hasOwnProperty('hasPortalAccess')
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    let updateObj = {};
    let promises = [];
    let message;
    const clientUser = await ClientUser.findOne({
      _id: req.params.clientUserId,
    }).lean();
    if (req.body.hasPortalAccess) {
      const signUpToken = jwt.sign(
        JSON.stringify({ _id: req.params.clientUserId }),
        config.jwt.secret,
      );
      updateObj = {
        hasPortalAccess: req.body.hasPortalAccess,
        signUpToken: signUpToken,
      };
      //TODO uncomment for send mail on Portal-Access
      /*let mailObj = {
        toAddress: [clientUser.email],
        subject: 'Welcome to TRAD CLIENT PORTAL',
        text: {
          name: clientUser.name,
          setPasswordLink:
            config.server.frontendUrls.clientPanelBase +
            config.server.frontendUrls.setPasswordPage +
            clientUser._id +
            '?token=' +
            signUpToken,
        },
        mailFor: 'newClientUser',
      };
      promises.push(MailHelper.sendMail(mailObj));*/
      message = 'Login access sent successfully';
    } else {
      //TODO revert portal access
      updateObj = {
        hasPortalAccess: req.body.hasPortalAccess,
      };
      message = 'Portal access revert successfully';
    }
    await ClientUser.updateOne({ _id: req.params.clientUserId }, updateObj);
    promises.push(
      addAuditLog({
        entityType: 'client',
        entityRefId: req.params.clientUserId,
        userType: 'user',
        userRefId: req.user._id,
        actionType: 'edit',
        logDescription: `Client user ${clientUser.name} updated successfully.`,
      }),
    );
    await Promise.all(promises);
    res.status(200).send({ status: 'SUCCESS', message: message });
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

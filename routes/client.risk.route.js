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

/*
 * Local Imports
 * */
const config = require('../config');
const Logger = require('./../services/logger');
const MailHelper = require('./../helper/mailer.helper');
const RssHelper = require('./../helper/rss.helper');
const StaticFile = require('./../static-files/moduleColumn');
const {
  addAuditLog,
  getRegexForSearch,
} = require('./../helper/audit-log.helper');
const { getUserList } = require('./../helper/user.helper');
const {
  getClientDebtorDetails,
  convertToCSV,
  getClientCreditLimit,
  formatCSVList,
  downloadDecisionLetter,
} = require('./../helper/client-debtor.helper');
const {
  generateNewApplication,
  checkForPendingApplication,
} = require('./../helper/application.helper');
const { getClientListWithDetails } = require('./../helper/client.helper');
const {
  checkForEntityInProfile,
  checkForActiveCreditLimit,
} = require('./../helper/alert.helper');

/**
 * Search Client from RSS
 */
router.get('/search-from-crm', async function (req, res) {
  if (!req.query.searchKeyword) {
    Logger.log.warn('No text passed to perform search.');
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
      'Error occurred in get credit-limit column names',
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
router.get(
  '/credit-limit/drawer-details/:creditLimitId',
  async function (req, res) {
    if (
      !req.params.creditLimitId ||
      !mongoose.Types.ObjectId.isValid(req.params.creditLimitId)
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
        _id: req.params.creditLimitId,
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
      res.status(200).send({
        status: 'SUCCESS',
        data: { response, header: 'Debtor Details' },
      });
    } catch (e) {
      Logger.log.error(
        'Error occurred in get credit-limit modal details ',
        e.message || e,
      );
      res.status(500).send({
        status: 'ERROR',
        message: e.message || 'Something went wrong, please try again later.',
      });
    }
  },
);

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
    const hasOnlyReadAccess =
      !req.accessTypes.includes('write') &&
      !req.accessTypes.includes('full-access');
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
          {
            name: {
              $regex: getRegexForSearch(req.query.search),
              $options: 'i',
            },
          },
          {
            email: {
              $regex: getRegexForSearch(req.query.search),
              $options: 'i',
            },
          },
          {
            contactNumber: {
              $regex: getRegexForSearch(req.query.search),
              $options: 'i',
            },
          },
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
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (clientColumn.columns.includes(module.manageColumns[i].name)) {
        if (
          (module.manageColumns[i].name === 'hasPortalAccess' ||
            module.manageColumns[i].name === 'sendDecisionLetter') &&
          hasOnlyReadAccess
        ) {
          headers.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            type: 'string',
          });
        } else {
          headers.push(module.manageColumns[i]);
        }
      }
    }
    if (clientUsers.length !== 0) {
      clientUsers[0]['paginatedResult'].forEach((user) => {
        if (user.name && user.name.length !== 0) {
          user.name = {
            id: user._id,
            value: user.name,
          };
        }
        if (user.hasOwnProperty('hasPortalAccess')) {
          user.hasPortalAccess = hasOnlyReadAccess
            ? user.hasPortalAccess
              ? 'Yes'
              : 'No'
            : {
                id: user._id,
                value: user.hasPortalAccess,
              };
        }
        if (user.hasOwnProperty('sendDecisionLetter')) {
          user.sendDecisionLetter = hasOnlyReadAccess
            ? user.sendDecisionLetter
              ? 'Yes'
              : 'No'
            : {
                id: user._id,
                value: user.sendDecisionLetter,
              };
        }
        if (user.hasOwnProperty('hasLeftCompany')) {
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
 * Get Client User drawer details
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
        'name contactNumber department hasPortalAccess hasLeftCompany email createdAt updatedAt',
      )
      .lean();
    let response = [];
    module.manageColumns.forEach((i) => {
      if (clientUser.hasOwnProperty(i.name)) {
        if (i.name === 'hasPortalAccess' || i.name === 'hasLeftCompany') {
          clientUser[i.name] = clientUser[i.name] ? 'Yes' : 'No';
        }
        response.push({
          label: i.label,
          value: clientUser[i.name] || '',
          type: i.type,
        });
      }
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: { response, header: 'Contact Details' },
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in getting Client Details for drawer.',
      e.message || e,
    );
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
      .populate({
        path: 'riskAnalystId serviceManagerId insurerId',
        select: 'name',
      })
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
            i.name === 'riskAnalystId' ||
            i.name === 'serviceManagerId' ||
            i.name === 'insurerId'
              ? client[i.name] && client[i.name]['name']
              : i.name === 'isAutoApproveAllowed'
              ? client[i.name]
                ? 'Yes'
                : 'No'
              : client[i.name] || '',
          type: i.type,
        });
      }
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: { response, header: 'Client Details' },
    });
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
 * Get Client Credit-Limit
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

    const applicationModuleAccess = req.user.moduleAccess
      .filter((userModule) => userModule.name === 'application')
      .shift();
    const hasOnlyReadAccessForApplicationModule =
      applicationModuleAccess.accessTypes.length === 0;

    const debtorModuleAccess = req.user.moduleAccess
      .filter((userModule) => userModule.name === 'debtor')
      .shift();
    const hasOnlyReadAccessForDebtorModule =
      debtorModuleAccess.accessTypes.length === 0;

    const response = await getClientCreditLimit({
      requestedQuery: req.query,
      debtorColumn: debtorColumn.columns,
      clientId: req.params.clientId,
      moduleColumn: module.manageColumns,
      hasOnlyReadAccessForApplicationModule,
      hasOnlyReadAccessForDebtorModule,
      isForRisk: true,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
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
 * Download client list in CSV
 */
router.get('/download', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'client');
    const clientColumn = [
      'clientCode',
      'name',
      'contactNumber',
      'riskAnalystId',
      'serviceManagerId',
      'insurerId',
      'fullAddress',
      'addressLine',
      'city',
      'state',
      'country',
      'zipCode',
      'website',
      'sector',
      'abn',
      'acn',
      'salesPerson',
      'referredBy',
      'inceptionDate',
      'expiryDate',
      'isAutoApproveAllowed',
      'createdAt',
      'updatedAt',
    ];
    let hasFullAccess = true;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      hasFullAccess = false;
    }
    const response = await getClientListWithDetails({
      requestedQuery: req.query,
      userId: req.user._id,
      moduleColumn: module.manageColumns,
      isForDownload: true,
      hasFullAccess: hasFullAccess,
      clientColumn: clientColumn,
    });
    if (response && response.docs.length !== 0) {
      const finalArray = await formatCSVList({
        moduleColumn: clientColumn,
        response: response.docs,
      });
      const csvResponse = await convertToCSV(finalArray);
      const fileName = 'client-list-' + new Date().getTime() + '.csv';
      res.header('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=' + fileName);
      res.send(csvResponse);
    } else {
      res.status(400).send({
        status: 'ERROR',
        message: 'No data found for download file',
      });
    }
  } catch (e) {
    Logger.log.error('Error occurred in download in csv', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Download Decision Letter
 */
router.get(
  '/download/decision-letter/:creditLimitId',
  async function (req, res) {
    try {
      const { bufferData, applicationNumber } = await downloadDecisionLetter({
        creditLimitId: req.params.creditLimitId,
      });
      if (bufferData) {
        const fileName = applicationNumber + '_CreditCheckDecision.pdf';
        res
          .writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename=' + fileName,
          })
          .end(bufferData);
      } else {
        res.status(400).send({
          status: 'ERROR',
          message: 'No decision letter found',
        });
      }
    } catch (e) {
      Logger.log.error('Error occurred in download Decision Letter', e);
      res.status(500).send({
        status: 'ERROR',
        message: e.message || 'Something went wrong, please try again later.',
      });
    }
  },
);

/**
 * Download credit-limit in CSV
 */
router.get('/download/:clientId', async function (req, res) {
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
    const debtorColumn = [
      'entityName',
      'entityType',
      'activeApplicationId',
      'creditLimit',
      'limitType',
      'expiryDate',
      'abn',
      'registrationNumber',
      'acn',
      'createdAt',
      'updatedAt',
    ];
    const response = await getClientCreditLimit({
      requestedQuery: req.query,
      debtorColumn: debtorColumn,
      clientId: req.params.clientId,
      moduleColumn: module.manageColumns,
    });
    if (response && response.docs.length !== 0) {
      const client = await Client.findOne({ _id: req.params.clientId })
        .select('clientCode')
        .lean();
      const finalArray = await formatCSVList({
        moduleColumn: debtorColumn,
        response: response.docs,
      });
      const csvResponse = await convertToCSV(finalArray);
      const fileName = client.clientCode + '-credit-limit' + '.csv';
      res.header('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=' + fileName);
      res.send(csvResponse);
    } else {
      res.status(400).send({
        status: 'ERROR',
        message: 'No data found for download file',
      });
    }
  } catch (e) {
    Logger.log.error('Error occurred in download credit-limit in csv', e);
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
    let hasFullAccess = true;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      hasFullAccess = false;
    }
    const response = await getClientListWithDetails({
      requestedQuery: req.query,
      userId: req.user._id,
      moduleColumn: module.manageColumns,
      isForDownload: false,
      hasFullAccess: hasFullAccess,
      clientColumn: clientColumn.columns,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
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
      Logger.log.warn('No clientId passed.');
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
      .select({ isDeleted: 0, __v: 0, updatedAt: 0, createdAt: 0 })
      .lean();
    const { riskAnalystList, serviceManagerList } = await getUserList();
    client.riskAnalystList = riskAnalystList;
    client.serviceManagerList = serviceManagerList;
    res.status(200).send({ status: 'SUCCESS', data: client });
  } catch (e) {
    Logger.log.error('Error occurred in get client by id.', e.message || e);
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
        limit: 50,
        page: 1,
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
            logDescription: `Client contact ${clientUser.name} added by ${req.user.name}`,
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
          logDescription: `Client ${client.name} added by ${req.user.name}`,
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
      Logger.log.warn('No clientId passed.');
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Require fields are missing',
      });
    }
    let client = await Client.findOne({ _id: req.params.clientId });
    if (!client) {
      Logger.log.error(
        'No Client found by crmClientId to Sync from RSS',
        req.params.crmId,
      );
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'CLIENT_NOT_FOUND',
        message: 'Client not found.',
      });
    }
    const clientDataFromCrm = await RssHelper.getClientById({
      clientId: client.crmClientId,
    });
    const insurer = await RssHelper.fetchInsurerDetails({
      underwriterName: clientDataFromCrm.underWriter,
      crmClientId: clientDataFromCrm.crmClientId,
      clientId: client._id,
      auditLog: { userType: 'user', userRefId: req.user._id },
    });
    clientDataFromCrm.insurerId = insurer && insurer._id ? insurer._id : null;
    await Client.updateOne({ _id: req.params.clientId }, clientDataFromCrm);
    await addAuditLog({
      entityType: 'client',
      entityRefId: req.params.clientId,
      userType: 'user',
      userRefId: req.user._id,
      actionType: 'sync',
      logDescription: `Client ${clientDataFromCrm.name} synced by ${req.user.name}`,
    });
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Client synced successfully' });
  } catch (e) {
    Logger.log.error(
      'Error occurred in syncing Clients from RSS.',
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
      Logger.log.warn('No clientId passed.');
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Require fields are missing',
      });
    }
    let client = await Client.findOne({ _id: req.params.clientId }).lean();
    if (!client) {
      return res
        .status(400)
        .send({ status: 'ERROR', message: 'Client not found' });
    }
    const clientUsers = await ClientUser.find({
      isDeleted: false,
      clientId: req.params.clientId,
    })
      .select('crmContactId')
      .lean();
    const oldUsers = clientUsers.map((i) => i.crmContactId.toString());
    //const newUsers = [];
    let contactsFromCrm = await RssHelper.getClientContacts({
      clientId: client.crmClientId,
      page: 1,
      limit: 50,
    });
    contactsFromCrm.forEach((i) => {
      if (oldUsers.includes(i.crmContactId.toString())) {
        oldUsers.splice(oldUsers.indexOf(i.crmContactId.toString()), 1);
      }
    });
    let promiseArr = [];
    let query = {};
    for (let i = 0; i < contactsFromCrm.length; i++) {
      query = {
        isDeleted: false,
        crmContactId: contactsFromCrm[i].crmContactId,
      };
      const clientUser = await ClientUser.findOne(query).lean();
      contactsFromCrm[i].clientId = req.params.clientId;
      if (!clientUser || !clientUser.hasOwnProperty('hasPortalAccess')) {
        contactsFromCrm[i].hasPortalAccess = false;
      }
      if (!clientUser || !clientUser.hasOwnProperty('sendDecisionLetter')) {
        contactsFromCrm[i].sendDecisionLetter = false;
      }
      query =
        clientUser && clientUser._id
          ? {
              _id: clientUser._id,
            }
          : { crmContactId: contactsFromCrm[i].crmContactId, isDeleted: false };
      promiseArr.push(
        ClientUser.updateOne(query, contactsFromCrm[i], { upsert: true }),
      );
      if (clientUser && clientUser._id) {
        promiseArr.push(
          addAuditLog({
            entityType: 'client-user',
            entityRefId: clientUser._id,
            userType: 'user',
            userRefId: req.user._id,
            actionType: 'sync',
            logDescription: `Client contact ${contactsFromCrm[i].name} synced by ${req.user.name}`,
          }),
        );
      }
    }
    if (oldUsers?.length !== 0) {
      promiseArr.push(
        ClientUser.updateMany(
          { crmContactId: { $in: oldUsers } },
          {
            isDeleted: true,
            sendDecisionLetter: false,
            hasPortalAccess: false,
          },
        ),
      );
    }
    await Promise.all(promiseArr);
    /* if (newUsers?.length !== 0) {
      const clientUsers = await ClientUser.find({
        crmContactId: { $in: newUsers },
      })
        .select('_id name')
        .lean();
      clientUsers.forEach((i) => {
        addAuditLog({
          entityType: 'client-user',
          entityRefId: i._id,
          userType: 'user',
          userRefId: req.user._id,
          actionType: 'sync',
          logDescription: `Client contact ${i.name} added by ${req.user.name}`,
        });
      });
    }*/
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
    Logger.log.warn('User data not found in req');
    return res.status(401).send({
      status: 'ERROR',
      message: 'Please first login to update the profile.',
    });
  }
  if (!req.body.hasOwnProperty('isReset') || !req.body.columns) {
    Logger.log.warn('Require fields are missing');
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
    Logger.log.error(
      'Error occurred in update user column names',
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
router.put('/credit-limit/column-name', async function (req, res) {
  if (!req.body.hasOwnProperty('isReset') || !req.body.columns) {
    Logger.log.warn('Require fields are missing');
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
    Logger.log.error(
      'Error occurred in update credit-limit column names',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update credit-limit
 */
router.put('/credit-limit/:creditLimitId', async function (req, res) {
  if (
    !req.params.creditLimitId ||
    !mongoose.Types.ObjectId.isValid(req.params.creditLimitId) ||
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
      _id: req.params.creditLimitId,
    })
      .populate({ path: 'clientId debtorId', select: 'name entityName' })
      .lean();
    if (req.body.action === 'modify') {
      if (
        !req.body.creditLimit.toString() ||
        typeof req.body.creditLimit !== 'number' ||
        isNaN(req.body.creditLimit)
      ) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'REQUIRE_FIELD_MISSING',
          message: 'Require fields are missing',
        });
      }
      const isPendingApplication = await checkForPendingApplication({
        clientId: clientDebtor?.clientId?._id,
        debtorId: clientDebtor?.debtorId?._id,
      });
      if (isPendingApplication) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'APPLICATION_ALREADY_EXISTS',
          message: `Application already exists for the Client: ${clientDebtor?.clientId?.name} & Debtor: ${clientDebtor?.debtorId?.entityName}`,
        });
      }
      await addAuditLog({
        entityType: 'credit-limit',
        entityRefId: req.params.creditLimitId,
        actionType: 'edit',
        userType: 'user',
        userRefId: req.user._id,
        logDescription: `A credit limit of ${clientDebtor?.clientId?.name} ${clientDebtor?.debtorId?.entityName} is modified by ${req.user.name}`,
      });
      await generateNewApplication({
        clientDebtorId: clientDebtor._id,
        createdByType: 'user',
        createdById: req.user._id,
        creditLimit: req.body.creditLimit,
        applicationId: clientDebtor?.activeApplicationId,
      });
    } else {
      await generateNewApplication({
        clientDebtorId: clientDebtor._id,
        createdByType: 'user',
        createdById: req.user._id,
        creditLimit: 0,
        applicationId: clientDebtor?.activeApplicationId,
        isSurrender: true,
      });
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
    (!req.body.hasOwnProperty('hasPortalAccess') &&
      !req.body.hasOwnProperty('sendDecisionLetter'))
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
    if (req.body.hasOwnProperty('hasPortalAccess')) {
      if (req.body.hasPortalAccess) {
        const client = await Client.findOne({
          _id: clientUser.clientId,
        })
          .populate({
            path: 'riskAnalystId serviceManagerId',
            select: 'name email contactNumber',
          })
          .lean();
        const signUpToken = jwt.sign(
          JSON.stringify({ _id: req.params.clientUserId }),
          config.jwt.secret,
        );
        let manageColumns = [];
        for (let i = 0; i < StaticFile.modules.length; i++) {
          manageColumns.push({
            moduleName: StaticFile.modules[i].name,
            columns: StaticFile.modules[i].defaultColumns,
          });
        }
        updateObj = {
          hasPortalAccess: req.body.hasPortalAccess,
          signUpToken: signUpToken,
          manageColumns: manageColumns,
        };
        let mailObj = {
          toAddress: [clientUser.email],
          subject: 'Welcome to TCR CLIENT PORTAL',
          text: {
            name: clientUser.name,
            setPasswordLink:
              config.server.frontendUrls.clientPanelBase +
              config.server.frontendUrls.setPasswordPage +
              '?token=' +
              signUpToken,
            riskAnalystName:
              client.riskAnalystId && client.riskAnalystId.name
                ? client.riskAnalystId.name
                : null,
            serviceManagerName:
              client.serviceManagerId && client.serviceManagerId.name
                ? client.serviceManagerId.name
                : null,
            riskAnalystNumber:
              client.riskAnalystId && client.riskAnalystId.contactNumber
                ? client.riskAnalystId.contactNumber
                : null,
            serviceManagerNumber:
              client.serviceManagerId && client.serviceManagerId.contactNumber
                ? client.serviceManagerId.contactNumber
                : null,
            riskAnalystEmail:
              client.riskAnalystId && client.riskAnalystId.email
                ? client.riskAnalystId.email
                : null,
            serviceManagerEmail:
              client.serviceManagerId && client.serviceManagerId.email
                ? client.serviceManagerId.email
                : null,
          },
          mailFor: 'newClientUser',
        };
        //TODO uncomment to send mail on Portal-Access
        if (config.mailer.isForProduction === 'true') {
          promises.push(MailHelper.sendMail(mailObj));
        }
        message = 'Login access sent successfully';
      } else {
        //TODO revert portal access
        updateObj = {
          hasPortalAccess: req.body.hasPortalAccess,
        };
        message = 'Portal access revert successfully';
      }
    } else if (req.body.hasOwnProperty('sendDecisionLetter')) {
      message = 'Contact details updated successfully';
      updateObj = {
        sendDecisionLetter: req.body.sendDecisionLetter,
      };
    }
    await ClientUser.updateOne({ _id: req.params.clientUserId }, updateObj);
    promises.push(
      addAuditLog({
        entityType: 'client',
        entityRefId: req.params.clientUserId,
        userType: 'user',
        userRefId: req.user._id,
        actionType: 'edit',
        logDescription: `Client contact ${clientUser.name} updated by ${req.user.name}`,
      }),
    );
    await Promise.all(promises);
    res.status(200).send({ status: 'SUCCESS', message: message });
  } catch (e) {
    Logger.log.error('Error occurred in updating Client User', e.message || e);
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
    Logger.log.warn('User data not found in req');
    return res.status(401).send({
      status: 'ERROR',
      message: 'Please first login to update the profile.',
    });
  }
  if (!req.body.hasOwnProperty('isReset') || !req.body.columns) {
    Logger.log.warn('Require fields are missing');
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
    Logger.log.error(
      'Error occurred in update client column names',
      e.message || e,
    );
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
      Logger.log.warn('No clientId passed.');
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
    Logger.log.error('Error occurred in updating  client', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

//Not in use
/* /!**
 * Delete Client
 *!/
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
});*/

/**
 * Export Router
 */
module.exports = router;

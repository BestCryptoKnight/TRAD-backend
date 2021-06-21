/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
let mongoose = require('mongoose');
const Client = mongoose.model('client');
const ClientUser = mongoose.model('client-user');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');

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
 * List Client User details
 */
router.get('/user', async function (req, res) {
  if (!req.user || !req.user.clientId) {
    return res.status(401).send({
      status: 'ERROR',
      messageCode: 'UNAUTHORIZED',
      message: 'Please first login to get employee list.',
    });
  }
  try {
    let module = StaticFile.modules.find((i) => i.name === 'client-user');
    module = JSON.parse(JSON.stringify(module));
    const clientColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'client-user',
    );
    const fields = clientColumn.columns.map((i) => [i, 1]);
    let queryFilter = {
      isDeleted: false,
      clientId: mongoose.Types.ObjectId(req.user.clientId),
    };
    req.query.sortBy = req.query.sortBy || '_id';
    req.query.sortOrder = req.query.sortOrder || 'desc';
    req.query.limit = req.query.limit || 5;
    req.query.page = req.query.page || 1;
    if (req.query.hasOwnProperty('isDecisionMaker')) {
      queryFilter.isDecisionMaker = req.query.isDecisionMaker === 'true';
    }
    if (req.query.search) {
      queryFilter.name = { $regex: `${req.query.search}`, $options: 'i' };
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
        if (module.manageColumns[i].name === 'hasPortalAccess') {
          module.manageColumns[i].type = 'string';
        }
        if (module.manageColumns[i].name === 'name') {
          module.manageColumns[i].type = 'string';
        }
        delete module.manageColumns[i].request;
        delete module.manageColumns[i].isDisabled;
        headers.push(module.manageColumns[i]);
      }
    }
    if (clientUsers.length !== 0) {
      clientUsers[0]['paginatedResult'].forEach((user) => {
        if (user.hasOwnProperty('hasPortalAccess')) {
          user.hasPortalAccess = user.hasPortalAccess ? 'Yes' : 'No';
        }
        if (user.hasOwnProperty('isDecisionMaker')) {
          user.isDecisionMaker = user.isDecisionMaker ? 'Yes' : 'No';
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
 * Get Client
 */
router.get('/', async function (req, res) {
  if (!req.user.clientId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'UNAUTHORIZED',
      message: 'Please first login to get company profile',
    });
  }
  try {
    const client = await Client.findOne({ _id: req.user.clientId })
      .populate({
        path: 'riskAnalystId serviceManagerId insurerId',
        select: 'name',
      })
      .lean();
    res.status(200).send({ status: 'SUCCESS', data: client });
  } catch (e) {
    Logger.log.error('Error occurred in get client details ', e.message || e);
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
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
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
    await ClientUser.updateOne(
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
 * Export Router
 */
module.exports = router;

/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Insurer = mongoose.model('insurer');
const InsurerUser = mongoose.model('insurer-user');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const { getInsurerContacts } = require('./../helper/rss.helper');
const { addAuditLog } = require('./../helper/audit-log.helper');

/**
 * Get Column Names
 */
router.get('/column-name', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'insurer');
    const insurerColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'insurer',
    );
    let customFields = [];
    let defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (
        insurerColumn &&
        insurerColumn.columns.includes(module.manageColumns[i].name)
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
      'Error occurred in get insurer column names',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Insurer Contacts List
 */
router.get('/user/:insurerId', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'insurer-user');
    const insurerColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'insurer-user',
    );
    const fields = insurerColumn.columns.map((i) => [i, 1]);
    const queryFilter = {
      isDeleted: false,
      insurerId: mongoose.Types.ObjectId(req.params.insurerId),
    };
    if (req.query.search)
      queryFilter.name = { $regex: req.query.search, $options: 'i' };
    let sortingOptions = {};
    const aggregationQuery = [
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
    const insurerUser = await InsurerUser.aggregate(
      aggregationQuery,
    ).allowDiskUse(true);

    const headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (insurerColumn.columns.includes(module.manageColumns[i].name)) {
        headers.push(module.manageColumns[i]);
      }
    }
    const total =
      insurerUser[0]['totalCount'].length !== 0
        ? insurerUser[0]['totalCount'][0]['count']
        : 0;

    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: insurerUser[0].paginatedResult,
        headers,
        total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(total / parseInt(req.query.limit)),
      },
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get insurer contacts list ',
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
    const module = StaticFile.modules.find((i) => i.name === 'insurer-user');
    const insurerColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'insurer-user',
    );
    let customFields = [];
    let defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (
        insurerColumn &&
        insurerColumn.columns.includes(module.manageColumns[i].name)
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
      'Error occurred in get insurer contacts columns ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Insurer List
 */
router.get('/', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'insurer');
    const insurerColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'insurer',
    );
    insurerColumn.columns.push('address');
    const fields = insurerColumn.columns.map((i) => [i, 1]);
    const queryFilter = {
      isDeleted: false,
    };
    if (req.query.search)
      queryFilter.name = { $regex: req.query.search, $options: 'i' };
    let sortingOptions = {};
    if (req.query.sortBy && req.query.sortOrder) {
      sortingOptions[req.query.sortBy] = req.query.sortOrder;
    }

    const aggregationQuery = [
      { $match: queryFilter },
      {
        $project: fields.reduce((obj, [key, val]) => {
          obj[key] = val;
          return obj;
        }, {}),
      },
    ];
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
    const insurers = await Insurer.aggregate(aggregationQuery).allowDiskUse(
      true,
    );

    const headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (insurerColumn.columns.includes(module.manageColumns[i].name)) {
        headers.push(module.manageColumns[i]);
      }
    }
    if (insurers && insurers.length !== 0) {
      insurers[0].paginatedResult.forEach((user) => {
        if (insurerColumn.columns.includes('fullAddress')) {
          user.fullAddress = Object.values(user.address)
            .toString()
            .replace(/,,/g, ',');
        }
        if (insurerColumn.columns.includes('addressLine')) {
          user.addressLine = user.address.addressLine;
        }
        if (insurerColumn.columns.includes('city')) {
          user.city = user.address.city;
        }
        if (insurerColumn.columns.includes('state')) {
          user.state = user.address.state;
        }
        if (insurerColumn.columns.includes('country')) {
          user.country = user.address.country;
        }
        if (insurerColumn.columns.includes('zipCode')) {
          user.zipCode = user.address.zipCode;
        }
        delete user.address;
      });
    }
    const total =
      insurers[0]['totalCount'].length !== 0
        ? insurers[0]['totalCount'][0]['count']
        : 0;

    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: insurers[0].paginatedResult,
        headers,
        total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(total / parseInt(req.query.limit)),
      },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get insurer list ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Insurer Details
 */
router.get('/:insurerId', async function (req, res) {
  if (
    !req.params.insurerId ||
    !mongoose.Types.ObjectId.isValid(req.params.insurerId)
  ) {
    Logger.log.error('Insurer id not found in params.');
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Something went wrong, please try again.',
    });
  }
  try {
    const insurer = await Insurer.findOne({ _id: req.params.insurerId }).lean();
    res.status(200).send({ status: 'SUCCESS', data: insurer });
  } catch (e) {
    Logger.log.error('Error occurred in get insurer details ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update Insurer Contacts Column Name
 */
router.put('/user/column-name', async function (req, res) {
  if (!req.user || !req.user._id) {
    return res.status(401).send({
      status: 'ERROR',
      message: 'Please first login to update columns.',
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
      const module = StaticFile.modules.find((i) => i.name === 'insurer-user');
      updateColumns = module.defaultColumns;
    } else {
      updateColumns = req.body.columns;
    }
    await User.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': 'insurer-user' },
      { $set: { 'manageColumns.$.columns': updateColumns } },
    );
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Columns updated successfully' });
  } catch (e) {
    Logger.log.error(
      'Error occurred in update insure contacts columns',
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
    return res.status(401).send({
      status: 'ERROR',
      messageCode: 'UNAUTHORIZED',
      message: 'Please first login to update columns.',
    });
  }
  if (!req.body.hasOwnProperty('isReset') || !req.body.columns) {
    Logger.log.error('Require fields are missing');
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Something went wrong, please try again.',
    });
  }
  try {
    let updateColumns = [];
    if (req.body.isReset) {
      const module = StaticFile.modules.find((i) => i.name === 'insurer');
      updateColumns = module.defaultColumns;
    } else {
      updateColumns = req.body.columns;
    }
    await User.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': 'insurer' },
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
 * Sync Insurer Users from RSS - Update
 */
router.put('/user/sync-from-crm/:insurerId', async function (req, res) {
  try {
    if (!req.params.insurerId) {
      Logger.log.error('Insurer id not found.');
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Please pass insurer id.',
      });
    }
    const insurer = await Insurer.findOne({ _id: req.params.insurerId }).lean();
    if (!insurer) {
      Logger.log.error('No Insurer found', req.params.crmId);
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'INSURER_NOT_FOUND',
        message: 'Insurer not found.',
      });
    }
    let contactsFromCrm = await getInsurerContacts({
      crmInsurerId: insurer.crmInsurerId,
      insurerId: insurer._id,
      limit: 50,
      page: 1,
      contacts: [],
    });
    let promiseArr = [];
    for (let i = 0; i < contactsFromCrm.length; i++) {
      promiseArr.push(
        InsurerUser.updateOne(
          { crmContactId: contactsFromCrm[i].crmContactId, isDeleted: false },
          contactsFromCrm[i],
          { upsert: true },
        ),
      );
      const insurerUser = await InsurerUser.findOne({
        crmContactId: contactsFromCrm[i].crmContactId,
        isDeleted: false,
      }).lean();
      promiseArr.push(
        addAuditLog({
          entityType: 'insurer-user',
          entityRefId: insurerUser._id,
          userType: 'user',
          userRefId: req.user._id,
          actionType: 'sync',
          logDescription: `Insurer contact ${insurerUser.name} synced successfully.`,
        }),
      );
    }
    await Promise.all(promiseArr);
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Insurer Contacts synced successfully',
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in sync insurer contacts ',
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

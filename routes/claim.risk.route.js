/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Claim = mongoose.model('claim');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const { getClaimsList } = require('./../helper/claims.helper');
const { getClientList } = require('./../helper/client.helper');

/**
 * Get Column Names
 */
router.get('/column-name', async function (req, res) {
  if (!req.query.columnFor) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require field is missing.',
    });
  }
  try {
    const module = StaticFile.modules.find(
      (i) => i.name === req.query.columnFor,
    );
    const claimColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.columnFor,
    );
    if (!module || !module.manageColumns || module.manageColumns.length === 0) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'BAD_REQUEST',
        message: 'Please pass correct fields',
      });
    }
    let customFields = [];
    let defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (
        claimColumn &&
        claimColumn.columns.includes(module.manageColumns[i].name)
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
      'Error occurred in get claim column names',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Entity List
 * */
router.get('/entity-list', async function (req, res) {
  try {
    let hasFullAccess = true;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      hasFullAccess = false;
    }
    const clients = await getClientList({
      hasFullAccess: hasFullAccess,
      userId: req.user._id,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: clients,
    });
  } catch (e) {
    Logger.log.error('Error occurred in get entity list', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get claim list
 */
router.get('/', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'claim');
    const claimColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'claim',
    );
    let hasFullAccess = true;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      hasFullAccess = false;
    }
    const response = await getClaimsList({
      claimColumn: claimColumn.columns,
      requestedQuery: req.query,
      userId: req.user._id,
      hasFullAccess,
      moduleColumn: module.manageColumns,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error('Error occurred in get application list ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Specific Entity's Overdue list
 */
router.get('/:entityId', async function (req, res) {
  if (
    !req.params.entityId ||
    !req.query.listFor ||
    !mongoose.Types.ObjectId.isValid(req.params.entityId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let queryFilter = {
      isDeleted: false,
    };
    switch (req.query.listFor) {
      case 'client-claim':
        queryFilter.clientId = mongoose.Types.ObjectId(req.params.entityId);
        break;
      case 'debtor-claim':
        queryFilter.debtorId = mongoose.Types.ObjectId(req.params.entityId);
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    const module = StaticFile.modules.find((i) => i.name === req.query.listFor);
    const claimColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.listFor,
    );
    let aggregationQuery = [];
    let sortingOptions = {};
    if (claimColumn.columns.includes('clientId')) {
      aggregationQuery.push(
        {
          $lookup: {
            from: 'clients',
            localField: 'clientId',
            foreignField: '_id',
            as: 'clientId',
          },
        },
        {
          $unwind: {
            path: '$clientId',
          },
        },
      );
    }
    if (claimColumn.columns.includes('debtorId')) {
      aggregationQuery.push(
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
      );
    }
    if (claimColumn.columns.includes('clientDebtorId')) {
      aggregationQuery.push(
        {
          $lookup: {
            from: 'client-debtors',
            localField: 'clientDebtorId',
            foreignField: '_id',
            as: 'clientDebtorId',
          },
        },
        {
          $unwind: {
            path: '$clientDebtorId',
          },
        },
      );
    }

    const fields = claimColumn.columns.map((i) => {
      if (i === 'clientId') {
        i = i + '.name';
      }
      if (i === 'debtorId') {
        i = i + '.entityName';
      }
      if (i === 'clientDebtorId') {
        i = i + '.creditLimit';
      }
      if (i === 'entityType') {
        i = 'debtorId.' + i;
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
      if (req.query.sortBy === 'clientId') {
        req.query.sortBy = req.query.sortBy + '.name';
      }
      if (req.query.sortBy === 'debtorId') {
        req.query.sortBy = req.query.sortBy + '.entityName';
      }
      if (req.query.sortBy === 'clientDebtorId') {
        req.query.sortBy = req.query.sortBy + '.creditLimit';
      }
      if (req.query.sortBy === 'entityType') {
        req.query.sortBy = 'debtorId.' + req.query.sortBy;
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

    const [claims, total] = await Promise.all([
      Claim.aggregate(aggregationQuery).allowDiskUse(true),
      Claim.countDocuments(queryFilter).lean(),
    ]);

    const headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (claimColumn.columns.includes(module.manageColumns[i].name)) {
        headers.push(module.manageColumns[i]);
      }
    }
    if (claims && claims.length !== 0) {
      claims.forEach((application) => {
        if (claimColumn.columns.includes('clientId')) {
          application.clientId = application.clientId.name;
        }
        if (claimColumn.columns.includes('debtorId')) {
          application.debtorId = application.debtorId.entityName;
        }
        if (claimColumn.columns.includes('clientDebtorId')) {
          application.clientDebtorId = application.clientDebtorId.creditLimit;
        }
      });
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: claims,
        headers,
        total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(total / parseInt(req.query.limit)),
      },
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred while getting specific entity claims ',
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
  if (
    !req.body.hasOwnProperty('isReset') ||
    !req.body.columns ||
    !req.body.columnFor
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    let updateColumns = [];
    let module;
    switch (req.body.columnFor) {
      case 'claim':
      case 'client-claim':
      case 'debtor-claim':
        if (req.body.isReset) {
          module = StaticFile.modules.find(
            (i) => i.name === req.body.columnFor,
          );
          updateColumns = module.defaultColumns;
        } else {
          updateColumns = req.body.columns;
        }
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    await User.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': req.body.columnFor },
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

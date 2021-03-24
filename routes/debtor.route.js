/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ClientUser = mongoose.model('client-user');
const Client = mongoose.model('client');
const ClientDebtor = mongoose.model('client-debtor');
const Debtor = mongoose.model('debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const StaticData = require('./../static-files/staticData.json');

/**
 * Get Column Names
 */
router.get('/column-name', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'credit-limit');
    const debtorColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'credit-limit',
    );
    const customFields = [];
    const defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (debtorColumn.columns.includes(module.manageColumns[i].name)) {
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
      'Error occurred in get debtor column names',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Debtor list
 */
router.get('/', async function (req, res) {
  try {
    let queryFilter = {
      isActive: true,
      clientId: mongoose.Types.ObjectId(req.user.clientId),
    };
    const aggregationQuery = [
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
    ];
    aggregationQuery.push({
      $project: {
        'clientId._id': 1,
        'clientId.name': 1,
        'clientId.contactNumber': 1,
        'clientId.abn': 1,
        'clientId.acn': 1,
        'clientId.inceptionDate': 1,
        'clientId.expiryDate': 1,
        creditLimit: 1,
      },
    });
    const sortingOptions = {};
    if (req.query.sortBy && req.query.sortOrder) {
      sortingOptions[req.query.sortBy] =
        req.query.sortOrder === 'desc' ? -1 : 1;
      aggregationQuery.push({ $sort: sortingOptions });
    }
    if (req.query.search) {
      aggregationQuery.push({
        $match: {
          'clientId.name': { $regex: req.query.search, $options: 'i' },
        },
      });
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
    const headers = [
      {
        name: 'clientId',
        label: 'Client Name',
        type: 'modal',
        request: { method: 'GET', url: 'client/details' },
      },
      { name: 'contactNumber', label: 'Contact Number', type: 'string' },
      { name: 'abn', label: 'ABN', type: 'string' },
      { name: 'acn', label: 'ACN', type: 'string' },
      { name: 'inceptionDate', label: 'Inception Date', type: 'date' },
      { name: 'expiryDate', label: 'Expiry Date', type: 'date' },
      { name: 'creditLimit', label: 'Credit Limit', type: 'string' },
    ];
    debtors[0].paginatedResult.forEach((debtor) => {
      if (debtor.clientId.name) {
        debtor.name = {
          id: debtor.clientId._id,
          value: debtor.clientId.name,
        };
      }
      if (debtor.clientId.contactNumber) {
        debtor.contactNumber = debtor.clientId.contactNumber;
      }
      if (debtor.clientId.abn) {
        debtor.abn = debtor.clientId.abn;
      }
      if (debtor.clientId.acn) {
        debtor.acn = debtor.clientId.acn;
      }
      if (debtor.clientId.inceptionDate) {
        debtor.inceptionDate = debtor.clientId.inceptionDate;
      }
      if (debtor.clientId.expiryDate) {
        debtor.expiryDate = debtor.clientId.expiryDate;
      }
      delete debtor.clientId;
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
    Logger.log.error(
      'Error occurred in get client-debtor details ',
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
    await ClientUser.updateOne(
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
 * Export Router
 */
module.exports = router;

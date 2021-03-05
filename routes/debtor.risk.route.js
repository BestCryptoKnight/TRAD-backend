/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Client = mongoose.model('client');
const ClientDebtor = mongoose.model('client-debtor');
const Debtor = mongoose.model('debtor');
const CreditReport = mongoose.model('credit-report');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const IllionHelper = require('./../helper/illion.helper');
const StaticFile = require('./../static-files/moduleColumn');

/**
 * Get Column Names
 */
router.get('/column-name', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'debtor');
    const debtorColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'debtor',
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
    const module = StaticFile.modules.find((i) => i.name === 'debtor');
    const debtorColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'debtor',
    );
    const clients = await Client.find({
      isDeleted: false,
      $or: [
        { riskAnalystId: req.user._id },
        { serviceManagerId: req.user._id },
      ],
    })
      .select({ _id: 1 })
      .lean();
    const clientIds = clients.map((i) => i._id);
    let queryFilter = {
      isDeleted: false,
      isActive: true,
    };
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      queryFilter = {
        isDeleted: false,
        clientId: { $in: clientIds },
      };
    }
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
    let sortingOptions = {};
    const fields = debtorColumn.columns.map((i) => {
      if (i === 'clientId') {
        i = i + '.name';
      }
      if (
        i === 'abn' ||
        i === 'acn' ||
        i === 'entityName' ||
        i === 'entityType' ||
        i === 'contactNumber' ||
        i === 'tradingName'
      ) {
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
      if (req.query.sortBy === 'entityType') {
        req.query.sortBy = 'debtorId.' + req.query.sortBy;
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

    const debtors = await ClientDebtor.aggregate(aggregationQuery).allowDiskUse(
      true,
    );
    const headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (debtorColumn.columns.includes(module.manageColumns[i].name)) {
        headers.push(module.manageColumns[i]);
      }
    }
    if (debtors && debtors.length !== 0) {
      debtors[0].paginatedResult.forEach((debtor) => {
        if (debtorColumn.columns.includes('clientId')) {
          debtor.clientId = debtor.clientId.name;
        }
        if (debtorColumn.columns.includes('abn')) {
          debtor.abn = debtor.debtorId.abn;
        }
        if (debtorColumn.columns.includes('acn')) {
          debtor.acn = debtor.debtorId.acn;
        }
        if (debtorColumn.columns.includes('entityName')) {
          debtor.entityName = debtor.debtorId.entityName;
        }
        if (debtorColumn.columns.includes('tradingName')) {
          debtor.tradingName = debtor.debtorId.tradingName;
        }
        if (debtorColumn.columns.includes('entityType')) {
          debtor.entityType = debtor.debtorId.entityType;
        }
        if (debtorColumn.columns.includes('contactNumber')) {
          debtor.contactNumber = debtor.debtorId.contactNumber;
        }
        delete debtor.debtorId;
      });
    }
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
    Logger.log.error('Error occurred in get debtor list ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Debtor Modal details
 */
router.get('/details/:debtorId', async function (req, res) {
  if (!req.params.debtorId) {
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
    let response = [];
    console.log(debtor);
    let value = '';
    module.manageColumns.forEach((i) => {
      value =
        i.name === 'creditLimit' ||
        i.name === 'createdAt' ||
        i.name === 'updatedAt'
          ? debtor[i.name]
          : debtor['debtorId'][i.name];
      response.push({
        label: i.label,
        value: value || '-',
        type: i.type,
      });
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
 * Get Credit Report
 */
router.get('/get-credit-reports', async function (req, res) {
  try {
    if (!req.body.debtorId) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Require fields are missing.',
      });
    }
    const module = StaticFile.modules.find((i) => i.name === req.query.listFor);
    const policyColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.listFor,
    );
    let sortingOptions = {};
    if (req.query.sortBy && req.query.sortOrder) {
      sortingOptions[req.query.sortBy] = req.query.sortOrder;
    }
    if (req.query.search)
      queryFilter.product = { $regex: req.query.search, $options: 'i' };
    let option = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 5,
    };
    option.select = policyColumn.columns.toString().replace(/,/g, ' ');
    option.sort = sortingOptions;
    option.lean = true;
    let responseObj = await Policy.paginate(queryFilter, option);
    responseObj.headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (policyColumn.columns.includes(module.manageColumns[i].name)) {
        responseObj.headers.push(module.manageColumns[i]);
      }
    }
    responseObj.docs.forEach((data) => {
      if (data.product) {
        data.product = {
          id: data._id,
          value: data.product,
        };
      }
    });
    res.status(200).send({ status: 'SUCCESS', data: responseObj });
  } catch (e) {
    Logger.log.error(
      'Error occurred in generating Credit Report',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Debtor Details
 */
router.get('/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const debtor = await ClientDebtor.findById(req.params.debtorId)
      .populate({ path: 'debtorId', select: { __v: 0, isDeleted: 0 } })
      .select({ isDeleted: 0 })
      .lean();
    res.status(200).send({
      status: 'SUCCESS',
      data: debtor,
    });
  } catch (e) {
    Logger.log.error('Error occurred in get debtor details ', e.message || e);
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
      const module = StaticFile.modules.find((i) => i.name === 'debtor');
      updateColumns = module.defaultColumns;
    } else {
      updateColumns = req.body.columns;
    }
    await User.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': 'debtor' },
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
 * Generate Credit Report
 */
router.put('/generate-credit-report', async function (req, res) {
  try {
    if (
      !req.body.debtorId ||
      !req.body.reportProvider ||
      !req.body.productCode
    ) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Require fields are missing.',
      });
    }
    let debtor = await Debtor.findOne({ _id: req.body.debtorId }).select({
      abn: 1,
      acn: 1,
    });
    if (!debtor.abn && !debtor.acn) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'ABN_AND_ACN_NOT_PRESENT',
        message: 'Require fields are missing.',
      });
    }
    if (req.body.reportProvider === 'illion') {
      const searchField = debtor.abn ? 'ABN' : 'ACN';
      const searchValue = debtor.abn ? debtor.abn : debtor.acn;
      let illionCreditReport = await IllionHelper.fetchCreditReport({
        productCode: req.body.productCode,
        searchField,
        searchValue,
      });
      let creditReport = new CreditReport({
        debtorId: req.body.debtorId,
        productCode: req.body.productCode,
        reportProvider: req.body.reportProvider,
        creditReport: illionCreditReport,
      });
      await creditReport.save();
      // TODO Generate Credit Report HTML
      res.status(200).send({
        status: 'SUCCESS',
        data: creditReport,
      });
    }
  } catch (e) {
    Logger.log.error(
      'Error occurred in generating Credit Report',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update client-debtor status
 */
router.put('/', async function (req, res) {
  if (!req.body.debtorIds || req.body.debtorIds.length === 0) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    await ClientDebtor.update(
      { _id: { $in: req.body.debtorIds } },
      { isActive: false },
      { multi: true },
    );
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Debtors updated successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in update debtor status ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Delete Client-Debtor
 */
router.delete('/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    await ClientDebtor.updateOne(
      { _id: req.params.debtorId },
      { isDeleted: true },
    );
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Debtors deleted successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in delete client-debtor ', e.message || e);
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

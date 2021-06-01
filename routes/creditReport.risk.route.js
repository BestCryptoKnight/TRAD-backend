/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Debtor = mongoose.model('debtor');
const CreditReport = mongoose.model('credit-report');
const User = mongoose.model('user');
const DebtorDirector = mongoose.model('debtor-director');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { fetchCreditReport } = require('./../helper/illion.helper');
const StaticFile = require('./../static-files/moduleColumn');

/**
 * Get Column Names
 */
router.get('/column-name', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'credit-report');
    const reportColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'credit-report',
    );
    let customFields = [];
    let defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (reportColumn.columns.includes(module.manageColumns[i].name)) {
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
 * Get Credit Report
 */
router.get('/:debtorId', async function (req, res) {
  if (!req.params.debtorId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const module = StaticFile.modules.find((i) => i.name === 'credit-report');
    const reportColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'credit-report',
    );
    const debtor = await Debtor.findOne({ _id: req.params.debtorId }).lean();
    const entityTypes = ['TRUST'];
    let entityIds = [debtor._id];
    if (debtor && entityTypes.includes(debtor.entityType)) {
      let directors = await DebtorDirector.find({
        debtorId: req.params.debtorId,
      }).lean();
      directors = directors.map((i) => i._id);
      if (directors.length !== 0) {
        entityIds.concat(directors);
      }
    }
    const queryFilter = {
      isDeleted: false,
      entityId: { $in: entityIds },
    };
    if (req.query.startDate && req.query.endDate) {
      queryFilter.createdAt = {
        $gte: req.query.startDate,
        $lt: req.query.endDate,
      };
    }
    let sortingOptions = {};
    req.query.sortBy = req.query.sortBy || 'expiryDate';
    req.query.sortOrder = req.query.sortOrder || 'desc';
    sortingOptions[req.query.sortBy] = req.query.sortOrder;
    let option = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 5,
    };
    option.select = reportColumn.columns.toString().replace(/,/g, ' ');
    option.sort = sortingOptions;
    option.lean = true;
    let responseObj = await CreditReport.paginate(queryFilter, option);
    responseObj.headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (reportColumn.columns.includes(module.manageColumns[i].name)) {
        responseObj.headers.push(module.manageColumns[i]);
      }
    }
    res.status(200).send({ status: 'SUCCESS', data: responseObj });
  } catch (e) {
    Logger.log.error(
      'Error occurred in fetching Credit Reports',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Generate Credit Report
 */
router.put('/generate', async function (req, res) {
  if (!req.body.debtorId || !req.body.productCode) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let debtor = await Debtor.findOne({ _id: req.body.debtorId })
      .select('abn acn entityType')
      .lean();
    if (!debtor.abn && !debtor.acn) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'ABN_AND_ACN_NOT_PRESENT',
        message: 'Require fields are missing.',
      });
    }
    const searchField = debtor.abn ? 'ABN' : 'ACN';
    const searchValue = debtor.abn ? debtor.abn : debtor.acn;
    const reportData = await fetchCreditReport({
      productCode: req.body.productCode,
      searchField,
      searchValue,
    });
    const entityTypes = ['TRUST'];
    let entityId = req.body.debtorId;
    let entityType = 'debtor';
    if (debtor && entityTypes.includes(debtor.entityType)) {
      const directors = await DebtorDirector.find({
        debtorId: req.params.debtorId,
      }).lean();
      entityId = directors[0]._id;
      entityType = 'debtor-director';
    }
    if (
      reportData &&
      reportData.Envelope.Body.Response &&
      reportData.Envelope.Body.Response.Messages.ErrorCount &&
      parseInt(reportData.Envelope.Body.Response.Messages.ErrorCount) === 0
    ) {
      const date = new Date();
      const expiryDate = new Date(date.setMonth(date.getMonth() + 12));
      await CreditReport.create({
        entityId: entityId,
        productCode: req.body.productCode,
        creditReport: reportData.Envelope.Body.Response,
        reportProvider: 'illion',
        entityType: entityType,
        name: reportData.Envelope.Body.Response.Header.ProductName,
        expiryDate: expiryDate,
      });
    }
    // TODO Generate Credit Report HTML
    res.status(200).send({
      status: 'SUCCESS',
      data: creditReport,
    });
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
 * Update Column Names
 */
router.put('/column-name', async function (req, res) {
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
      const module = StaticFile.modules.find((i) => i.name === 'credit-report');
      updateColumns = module.defaultColumns;
    } else {
      updateColumns = req.body.columns;
    }
    await User.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': 'credit-report' },
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
 * Update Credit Report
 */
router.put('/:id', async function (req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Require fields are missing.',
      });
    }
    let updateObj = {};
    if (req.body.hasOwnProperty('isExpired'))
      updateObj['isExpired'] = req.body.isExpired;
    if (req.body.expiryDate) updateObj['expiryDate'] = req.body.expiryDate;
    await CreditReport.updateOne({ _id: req.params.id }, updateObj);
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Report updated successfully.',
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in updating Credit Report',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

module.exports = router;

/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Debtor = mongoose.model('debtor');
const CreditReport = mongoose.model('credit-report');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const IllionHelper = require('./../helper/illion.helper');
const StaticFile = require('./../static-files/moduleColumn');

/**
 * Get Credit Report
 */
router.get('/', async function (req, res) {
  try {
    if (!req.query.debtorId) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Require fields are missing.',
      });
    }
    const module = StaticFile.modules.find((i) => i.name === 'credit-report');
    const reportColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'credit-report',
    );
    let queryFilter = {
      isDeleted: false,
    };
    if (req.query.startDate && req.query.endDate) {
      queryFilter.createdAt = {
        $gte: req.query.startDate,
        $lt: req.query.endDate,
      };
    }
    let sortingOptions = {};
    if (req.query.sortBy && req.query.sortOrder) {
      sortingOptions[req.query.sortBy] = req.query.sortOrder;
    }
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
      // const searchField = 'ABN';
      // const searchValue = '38881083819';
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

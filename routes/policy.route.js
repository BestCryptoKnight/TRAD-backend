/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Policy = mongoose.model('policy');
const ClientUser = mongoose.model('client-user');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const { getPolicyDetails } = require('./../helper/policy.helper');
const { getRegexForSearch } = require('./../helper/audit-log.helper');

/**
 * Get Column Names
 */
router.get('/column-name', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'client-policy');
    const policyColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'client-policy',
    );
    const customFields = [];
    const defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (module.manageColumns[i].name !== 'policyPeriod') {
        if (
          policyColumn &&
          policyColumn.columns.includes(module.manageColumns[i].name)
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
 * Get Details of Client Policy For Modal
 */
router.get('/client/policy-details/:policyId', async function (req, res) {
  if (
    !req.params.policyId ||
    !mongoose.Types.ObjectId.isValid(req.params.policyId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const policyData = await Policy.findById(req.params.policyId)
      .populate({ path: 'insurerId clientId', select: 'name' })
      .select({ __v: 0 })
      .lean();
    const response = await getPolicyDetails({ policyData, isForRisk: false });
    res.status(200).send({
      status: 'SUCCESS',
      data: { response, header: 'Policy Details' },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get policy details ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * List Client Policies
 */
router.get('/', async function (req, res) {
  try {
    let queryFilter = {
      isDeleted: false,
      clientId: req.user.clientId,
    };
    const module = StaticFile.modules.find((i) => i.name === 'client-policy');
    const policyColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'client-policy',
    );
    const sortingOptions = {};
    req.query.sortBy = req.query.sortBy || 'expiryDate';
    req.query.sortOrder = req.query.sortOrder || 'desc';
    sortingOptions[req.query.sortBy] = req.query.sortOrder;
    if (req.query.search) {
      queryFilter = Object.assign({}, queryFilter, {
        $or: [
          {
            product: {
              $regex: getRegexForSearch(req.query.search),
              $options: 'i',
            },
          },
          {
            policyPeriod: {
              $regex: getRegexForSearch(req.query.search),
              $options: 'i',
            },
          },
        ],
      });
    }
    const option = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10,
    };
    if (policyColumn.columns.includes('insurerId')) {
      option.populate = 'insurerId';
    }
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
      if (data.policyNumber) {
        data.policyNumber = {
          id: data._id,
          value: data.policyNumber,
        };
      }
      if (policyColumn.columns.includes('insurerId')) {
        data.insurerId =
          data.insurerId && data.insurerId.name ? data.insurerId.name : '';
      }
      delete data.id;
    });
    res.status(200).send({ status: 'SUCCESS', data: responseObj });
  } catch (e) {
    Logger.log.error('Error occurred in get insurer list ', e.message || e);
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
    Logger.log.warn('Require fields are missing');
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Something went wrong, please try again.',
    });
  }
  try {
    let updateColumns = [];
    if (req.body.isReset) {
      const module = StaticFile.modules.find((i) => i.name === 'client-policy');
      updateColumns = module.defaultColumns.filter((i) => i !== 'policyPeriod');
    } else {
      updateColumns = req.body.columns;
    }
    await ClientUser.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': 'client-policy' },
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

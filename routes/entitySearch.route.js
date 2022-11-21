/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const {
  getClients,
  getDebtorList,
  getApplications,
} = require('./../helper/globalSearch.helper');
const { getCurrentDebtorList } = require('./../helper/debtor.helper');
const { getClientList } = require('./../helper/client.helper');
const { getApplicationList } = require('./../helper/task.helper');

router.get('/', async function (req, res) {
  if (!req.query.entityType) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    req.query.isForRisk = req.query.isForRisk
      ? typeof req.query.isForRisk === 'string'
        ? req.query.isForRisk === 'true'
        : req.query.isForRisk
      : false;
    let response = [];
    if (
      req.query.entityType === 'debtorIds' ||
      req.query.entityType === 'debtorId'
    ) {
      req.query.entityType = 'debtors';
    }
    if (req.query.searchString) {
      switch (req.query.entityType) {
        case 'clients':
          response = await getClients({
            moduleAccess: req.user.moduleAccess,
            searchString: req.query.searchString,
            userId: req.user._id,
            isForRisk: req.query.isForRisk,
            isForGlobalSearch: false,
          });
          break;
        case 'debtors':
          response = await getDebtorList({
            moduleAccess: req.user?.moduleAccess,
            searchString: req.query.searchString,
            userId: req.user._id,
            isForGlobalSearch: false,
            requestFrom: req.query?.requestFrom,
            isForRisk: req.query.isForRisk,
            isForFilter: req.query.isForFilter,
            clientId: req.user?.clientId,
          });
          break;
        case 'applications':
          response = await getApplications({
            moduleAccess: req.user.moduleAccess,
            searchString: req.query.searchString,
            userId: req.user._id,
            isForRisk: req.query.isForRisk,
            isForGlobalSearch: false,
          });
          break;
      }
    } else {
      const hasFullAccess = req.query.isForRisk
        ? !!(req.accessTypes && req.accessTypes.indexOf('full-access') !== -1)
        : false;
      switch (req.query.entityType) {
        case 'clients':
          response = await getClientList({
            userId: req.user._id,
            hasFullAccess: hasFullAccess,
            page: req.query.page,
            limit: req.query.limit,
            isForRisk: req.query.isForRisk,
            clientId: req.user.clientId,
          });
          break;
        case 'debtors':
          const options = {};
          if (
            req.query?.requestFrom === 'application' &&
            !req.query.isForFilter
          ) {
            options.showCompleteList = true;
          } else {
            if (req.query?.requestFrom === 'overdue') {
              options.isForOverdue = true;
            }
            options.userId = req.query.isForRisk
              ? req.user._id
              : req.user.clientId;
            options.hasFullAccess = hasFullAccess;
            options.isForRisk = req.query.isForRisk;
            options.limit = req.query.limit;
            options.page = req.query.page;
          }
          response = await getCurrentDebtorList(options);
          break;
        case 'applications':
          response = await getApplicationList({
            userId: req.query.isForRisk ? req.query._id : req.user.clientId,
            hasFullAccess: hasFullAccess,
            isForRisk: req.query.isForRisk,
            page: req.query.page,
            limit: req.query.limit,
          });
          break;
      }
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error('Error occurred in search entity lit', e.message || e);
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

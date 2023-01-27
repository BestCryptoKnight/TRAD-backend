/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
let mongoose = require('mongoose');
const Policy = mongoose.model('policy');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const {
  getApprovedAmount,
  getApplicationStatus,
  getEndorsedLimit,
  getApprovedApplication,
  getCreditChecks,
} = require('./../helper/dashboard.helper');

/**
 * Dashboard graph details
 */
router.get('/', async function (req, res) {
  try {
    const [ciPolicy, rmpPolicy] = await Promise.all([
      Policy.findOne({
        clientId: req.user.clientId,
        product: { $regex: '.*Credit Insurance.*' },
        inceptionDate: { $lte: new Date() },
        expiryDate: { $gt: new Date() },
        isDeleted: false,
      })
        .select(
          'clientId product policyPeriod noOfResChecks discretionaryLimit aggregateOfCreditLimit inceptionDate expiryDate creditChecks',
        )
        .lean(),
      Policy.findOne({
        clientId: req.user.clientId,
        $or: [
          { product: { $regex: '.*Risk Management Package.*' } },
          { product: { $regex: '.*Risk Management.*' } },
        ],
        inceptionDate: { $lte: new Date() },
        expiryDate: { $gt: new Date() },
        isDeleted: false,
      })
        .select(
          'clientId product noOfResChecks policyPeriod discretionaryLimit inceptionDate expiryDate creditChecks',
        )
        .lean(),
    ]);
    const response = {};
    response['discretionaryLimit'] =
      ciPolicy && ciPolicy?.discretionaryLimit
        ? ciPolicy.discretionaryLimit
        : rmpPolicy && rmpPolicy?.discretionaryLimit
        ? rmpPolicy.discretionaryLimit
        : 0;
    let startDate;
    let endDate;
    if (ciPolicy || rmpPolicy) {
      startDate =
        ciPolicy && ciPolicy.inceptionDate
          ? ciPolicy.inceptionDate
          : rmpPolicy.inceptionDate;
      endDate =
        ciPolicy && ciPolicy.expiryDate
          ? ciPolicy.expiryDate
          : rmpPolicy.expiryDate;
    }
    let nzCreditChecks = rmpPolicy?.nzCreditChecks || 0;
    const noOfCreditChecks =
      rmpPolicy && rmpPolicy.creditChecks
        ? rmpPolicy.creditChecks + nzCreditChecks
        : ciPolicy && ciPolicy.creditChecks
        ? ciPolicy.creditChecks
        : 0;
    const [
      endorsedLimit,
      applicationStatus,
      approvedAmount,
      approvedApplication,
      resChecks,
    ] = await Promise.all([
      getEndorsedLimit({
        clientId: req.user.clientId,
        startDate,
        endDate,
        aggregateOfCreditLimit:
          ciPolicy && ciPolicy.aggregateOfCreditLimit
            ? ciPolicy.aggregateOfCreditLimit
            : 0,
      }),
      getApplicationStatus({ clientId: req.user.clientId, startDate, endDate }),
      getApprovedAmount({ clientId: req.user.clientId, startDate, endDate }),
      getApprovedApplication({
        clientId: req.user.clientId,
        startDate,
        endDate,
      }),
      getCreditChecks({
        clientId: req.user.clientId,
        startDate,
        endDate,
        noOfCreditChecks,
      }),
    ]);
    if (ciPolicy) {
      response['endorsedLimit'] = endorsedLimit;
    }
    response['applicationStatus'] = applicationStatus;
    response['approvedAmount'] =
      approvedAmount && approvedAmount.length !== 0 ? approvedAmount[0] : {};
    response['approvedApplication'] =
      approvedApplication && approvedApplication.length !== 0
        ? approvedApplication[0]
        : {};
    response['resChecksCount'] = resChecks;
    response['showGraphs'] = !!rmpPolicy;
    res.status(200).send({ status: 'SUCCESS', data: response });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get client dashboard data',
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

/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
let mongoose = require('mongoose');
const Task = mongoose.model('task');
const Client = mongoose.model('client');
const Application = mongoose.model('application');
const Policy = mongoose.model('policy');
const ClientDebtor = mongoose.model('client-debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

/**
 * Get Discretionary Limit
 */
router.get('/discretionary-limit', async function (req, res) {
  try {
    const ciPolicy = await Policy.findOne({
      clientId: req.user.clientId,
      product: { $regex: '.*Credit Insurance.*' },
      inceptionDate: { $lte: new Date() },
      expiryDate: { $gt: new Date() },
    })
      .select(
        'clientId product policyPeriod discretionaryLimit inceptionDate expiryDate',
      )
      .lean();
    res
      .status(200)
      .send({ status: 'SUCCESS', data: ciPolicy.discretionaryLimit });
  } catch (e) {
    Logger.log.error('Error occurred in get dashboard data', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get endorsed limit application count
 */
router.get('/endorsed-limit', async function (req, res) {
  try {
    const query = {
      clientId: mongoose.Types.ObjectId(req.user.clientId),
      creditLimit: { $exists: true, $ne: null },
    };
    if (req.query.startDate && req.query.endDate) {
      query.updatedAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }
    const data = await ClientDebtor.aggregate([
      {
        $match: query,
      },
      {
        $group: {
          _id: null,
          notEndorsedLimit: {
            $sum: { $cond: [{ $eq: ['$isEndorsedLimit', false] }, 1, 0] },
          },
          endorsedLimit: {
            $sum: { $cond: [{ $eq: ['$isEndorsedLimit', true] }, 1, 0] },
          },
        },
      },
    ]).allowDiskUse(true);
    const response = {};
    if (data && data.length !== 0) {
      response.totalCount =
        data[0]['notEndorsedLimit'] + data[0]['endorsedLimit'];
      response.endorsedLimitCount = data[0]['endorsedLimit'];
    }
    res.status(200).send({ status: 'SUCCESS', data: response });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get endorsed limit count',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get pending application by status
 */
router.get('/application-status', async function (req, res) {
  try {
    const query = {
      clientId: mongoose.Types.ObjectId(req.user.clientId),
      status: {
        $in: [
          'SENT_TO_INSURER',
          'REVIEW_APPLICATION',
          'PENDING_INSURER_REVIEW',
          'SUBMITTED',
          'UNDER_REVIEW',
          'AWAITING_INFORMATION',
        ],
      },
    };
    if (req.query.startDate && req.query.endDate) {
      query.updatedAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }
    const data = await Application.aggregate([
      {
        $match: query,
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]).allowDiskUse(true);
    res.status(200).send({ status: 'SUCCESS', data: data });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get applications by status',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get approved application count
 */
router.get('/approved-amount', async function (req, res) {
  try {
    const query = {
      clientId: mongoose.Types.ObjectId(req.user.clientId),
      status: 'APPROVED',
    };
    if (req.query.startDate && req.query.endDate) {
      query.updatedAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }
    const response = await Application.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: 'client-debtors',
          localField: 'clientDebtorId',
          foreignField: '_id',
          as: 'clientDebtorId',
        },
      },
      { $unwind: '$clientDebtorId' },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$creditLimit',
          },
          approvedAmount: {
            $sum: '$clientDebtorId.creditLimit',
          },
        },
      },
      { $project: { _id: 0 } },
    ]).allowDiskUse(true);
    res.status(200).send({ status: 'SUCCESS', data: response });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get approved applications',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get approved application count
 */
router.get('/approved-application', async function (req, res) {
  try {
    const query = {
      clientId: mongoose.Types.ObjectId(req.user.clientId),
      status: {
        $in: ['APPROVED', 'DECLINED', 'CANCELLED'],
      },
    };
    if (req.query.startDate && req.query.endDate) {
      query.updatedAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }
    const response = await Application.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: 'client-debtors',
          localField: 'clientDebtorId',
          foreignField: '_id',
          as: 'clientDebtorId',
        },
      },
      { $unwind: '$clientDebtorId' },
      {
        $group: {
          _id: null,
          rejected: {
            $sum: { $cond: [{ $ne: ['$status', 'APPROVED'] }, 1, 0] },
          },
          partiallyApproved: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'APPROVED'] },
                    { $eq: ['$clientDebtorId.isEndorsedLimit', true] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          approved: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'APPROVED'] },
                    { $eq: ['$clientDebtorId.isEndorsedLimit', false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $project: { _id: 0 } },
    ]).allowDiskUse(true);
    res.status(200).send({ status: 'SUCCESS', data: response });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get approved applications',
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

/*
 * Module Imports
 * */
let mongoose = require('mongoose');
const Application = mongoose.model('application');
const ClientDebtor = mongoose.model('client-debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

const getEndorsedLimit = async ({
  clientId,
  startDate = null,
  endDate = null,
  aggregateOfCreditLimit,
}) => {
  try {
    const query = {
      clientId: mongoose.Types.ObjectId(clientId),
      creditLimit: { $exists: true, $ne: null },
    };
    if (startDate && endDate) {
      query.updatedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }
    const data = await ClientDebtor.aggregate([
      {
        $match: query,
      },
      {
        $group: {
          _id: null,
          endorsedLimit: {
            $sum: {
              $cond: [{ $eq: ['$isEndorsedLimit', true] }, '$creditLimit', 0],
            },
          },
        },
      },
    ]).allowDiskUse(true);
    const response = {};
    if (data && data.length !== 0) {
      response.totalCount = parseInt(aggregateOfCreditLimit);
      response.endorsedLimitCount = data[0]['endorsedLimit'];
    } else {
      response.totalCount = 0;
      response.endorsedLimitCount = 0;
    }
    return response;
  } catch (e) {
    Logger.log.error(
      'Error occurred in get endorsed limit count',
      e.message || e,
    );
  }
};

const getRESChecks = async ({
  clientId,
  startDate,
  endDate,
  noOfResChecks,
}) => {
  try {
    const query = {
      clientId: mongoose.Types.ObjectId(clientId),
      status: {
        $nin: ['DRAFT'],
      },
    };
    if (startDate && endDate) {
      query.updatedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }
    const data = await ClientDebtor.aggregate([
      {
        $match: query,
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
        },
      },
    ]).allowDiskUse(true);
    const response = {};
    if (data && data.length !== 0) {
      response.totalCount = parseInt(noOfResChecks);
      response.applicationCount = data[0]['count'];
    } else {
      response.totalCount = 0;
      response.applicationCount = 0;
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in get RES checks count', e.message || e);
  }
};

const getApplicationStatus = async ({
  clientId,
  startDate = null,
  endDate = null,
}) => {
  try {
    const query = {
      clientId: mongoose.Types.ObjectId(clientId),
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
    if (startDate && endDate) {
      query.updatedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
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
    return data;
  } catch (e) {
    Logger.log.error(
      'Error occurred in get applications by status',
      e.message || e,
    );
  }
};

const getApprovedAmount = async ({
  clientId,
  startDate = null,
  endDate = null,
}) => {
  try {
    const query = {
      clientId: mongoose.Types.ObjectId(clientId),
      status: 'APPROVED',
    };
    if (startDate && endDate) {
      query.updatedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
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
    return response;
  } catch (e) {
    Logger.log.error(
      'Error occurred in get get approved amount',
      e.message || e,
    );
  }
};

const getApprovedApplication = async ({
  clientId,
  startDate = null,
  endDate = null,
}) => {
  try {
    const query = {
      clientId: mongoose.Types.ObjectId(clientId),
      status: {
        $in: ['APPROVED', 'DECLINED', 'CANCELLED'],
      },
    };
    if (startDate && endDate) {
      query.updatedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
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
    return response;
  } catch (e) {
    Logger.log.error(
      'Error occurred in get get approved applications',
      e.message || e,
    );
  }
};

module.exports = {
  getEndorsedLimit,
  getApplicationStatus,
  getApprovedAmount,
  getApprovedApplication,
  getRESChecks,
};

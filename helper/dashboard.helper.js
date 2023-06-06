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
  aggregateOfCreditLimit = '0',
}) => {
  try {
    //TODO optimize query (add endorsed limit flag in query)
    const query = {
      clientId: mongoose.Types.ObjectId(clientId),
      // creditLimit: { $exists: true, $ne: null },
      // $and: [
      //   { creditLimit: { $exists: true } },
      //   { creditLimit: { $ne: null } },
      //   { creditLimit: { $ne: 0 } },
      // ],
      // status: { $exists: true, $in: ['APPROVED'] },
    };
    // if (startDate && endDate) {
    //   query.approvalOrDecliningDate = {
    //     $gte: new Date(startDate),
    //     $lte: new Date(endDate),
    //   };
    // }
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
    const response = {
      totalCount: parseInt(aggregateOfCreditLimit) || 0,
    };
    response.endorsedLimitCount =
      data && data?.[0]?.['endorsedLimit'] ? data[0]['endorsedLimit'] : 0;
    return response;
  } catch (e) {
    Logger.log.error(
      'Error occurred in get endorsed limit count',
      e.message || e,
    );
  }
};

const getCreditChecks = async ({
  clientId,
  startDate,
  endDate,
  noOfCreditChecks = '0',
}) => {
  try {
    const query = {
      clientId: mongoose.Types.ObjectId(clientId),
      status: {
        $nin: ['DRAFT'],
      },
      limitType: { $in: ['CREDIT_CHECK', 'CREDIT_CHECK_NZ'] },
    };
    if (startDate && endDate) {
      query.requestDate = {
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
          _id: null,
          count: { $sum: 1 },
        },
      },
    ]).allowDiskUse(true);
    const response = {
      totalCount: parseInt(noOfCreditChecks) || 0,
    };
    response.applicationCount =
      data && data?.[0]?.['count'] ? data[0]['count'] : 0;
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
    /*if (startDate && endDate) {
      query.updatedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }*/
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
    };
    if (startDate && endDate) {
      query.approvalOrDecliningDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }
    //TODO need to change query for isActive flag
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
          /* approvedAmount: {
            $sum: '$clientDebtorId.creditLimit',
          },*/
          approvedAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$clientDebtorId.activeApplicationId', '$_id'] },
                    { $eq: ['$clientDebtorId.isActive', true] },
                    { $eq: ['$status', 'APPROVED'] },
                  ],
                },
                '$clientDebtorId.creditLimit',
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
        $in: ['APPROVED', 'DECLINED'],
      },
    };
    if (startDate && endDate) {
      query.approvalOrDecliningDate = {
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
  getCreditChecks,
};

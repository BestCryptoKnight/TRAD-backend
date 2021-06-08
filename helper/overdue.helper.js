/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Client = mongoose.model('client');
const Overdue = mongoose.model('overdue');
const ClientDebtor = mongoose.model('client-debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

const getLastOverdueList = async ({ date, query }) => {
  try {
    date = new Date(date);
    date = date.setMonth(date.getMonth() - 1);
    query.month = (new Date(date).getMonth() + 1).toString();
    query.year = new Date(date).getFullYear().toString();
    if (query.month.length !== 2) {
      query.month = query.month.toString().padStart(2, '0');
    }
    const overdue = await Overdue.find(query)
      .populate({
        path: 'debtorId insurerId clientId',
        select: '_id name entityName',
      })
      .select({ isDeleted: 0, createdAt: 0, updatedAt: 0, __v: 0 })
      .lean();
    if (overdue && overdue.length !== 0) {
      return overdue;
    } else {
      const overdue = await getLastOverdueList({ date, query });
      if (overdue && overdue.length !== 0) {
        return overdue;
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in get last overdue list');
    Logger.log.error(e.message || e);
  }
};

const getDrawerDetails = async ({ overdue }) => {
  try {
    const overdueColumns = [
      { name: 'status', label: 'Status', type: 'status' },
      { name: 'month', label: 'Month-Year', type: 'string' },
      { name: 'clientId', label: 'Client Name', type: 'string' },
      { name: 'debtorId', label: 'Debtor Name', type: 'string' },
      { name: 'acn', label: 'ACN', type: 'string' },
      { name: 'dateOfInvoice', label: 'Date of Invoice', type: 'date' },
      { name: 'overdueType', label: 'Overdue Type', type: 'string' },
      { name: 'insurerId', label: 'Insurer Name', type: 'string' },
      { name: 'currentAmount', label: 'Current', type: 'dollar' },
      { name: 'thirtyDaysAmount', label: '30 days', type: 'dollar' },
      { name: 'sixtyDaysAmount', label: '60 days', type: 'dollar' },
      { name: 'ninetyDaysAmount', label: '90 days', type: 'dollar' },
      { name: 'ninetyPlusDaysAmount', label: '90+ days', type: 'dollar' },
      {
        name: 'outstandingAmount',
        label: 'Outstanding Amounts',
        type: 'dollar',
      },
      { name: 'clientComment', label: 'Client Comment', type: 'string' },
      { name: 'analystComment', label: 'Analyst Comment', type: 'string' },
    ];
    const monthString = {
      1: 'Jan',
      2: 'Feb',
      3: 'Mar',
      4: 'Apr',
      5: 'May',
      6: 'Jun',
      7: 'Jul',
      8: 'Aug',
      9: 'Sep',
      10: 'Oct',
      11: 'Nov',
      12: 'Dec',
    };
    let response = [];
    overdueColumns.forEach((i) => {
      if (overdue.hasOwnProperty(i.name)) {
        let value =
          (i.name === 'insurerId' ||
            i.name === 'clientId' ||
            i.name === 'debtorId') &&
          overdue[i.name]
            ? overdue[i.name]['name']
            : overdue[i.name] || '';
        if (i.name === 'month') {
          value =
            monthString[parseInt(overdue['month'])] + '-' + overdue['year'];
        }
        if (i.name === 'overdueType' || i.name === 'status') {
          value = value.replace(/_/g, ' ').replace(/\w\S*/g, function (txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
          });
        }
        response.push({
          label: i.label,
          value: value,
          type: i.type,
        });
      }
    });
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in get drawer details');
    Logger.log.error(e.message || e);
  }
};

const getOverdueList = async ({
  requestedQuery,
  isForRisk,
  hasFullAccess = false,
  clientId,
  userId,
}) => {
  try {
    const queryFilter = {};
    requestedQuery.page = requestedQuery.page || 1;
    requestedQuery.limit = requestedQuery.limit || 5;
    if (!isForRisk) {
      queryFilter.clientId = mongoose.Types.ObjectId(clientId);
    } else if (isForRisk && !hasFullAccess) {
      const clients = await Client.find({
        $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
      })
        .select('_id name')
        .lean();
      const clientIds = clients.map((i) => i._id);
      queryFilter.clientId = { $in: clientIds };
    }
    if (requestedQuery.debtorId) {
      queryFilter.debtorId = mongoose.Types.ObjectId(requestedQuery.debtorId);
    }
    if (requestedQuery.minOutstandingAmount) {
      queryFilter.outstandingAmount = {
        $gte: parseInt(requestedQuery.minOutstandingAmount),
      };
    }
    if (requestedQuery.maxOutstandingAmount) {
      queryFilter.outstandingAmount = {
        $lte: parseInt(requestedQuery.maxOutstandingAmount),
      };
    }
    if (requestedQuery.startDate) {
      queryFilter.dateOfInvoice = {
        $gte: new Date(requestedQuery.startDate),
      };
    }
    if (requestedQuery.endDate) {
      queryFilter.dateOfInvoice = {
        $lt: new Date(requestedQuery.endDate),
      };
    }
    const query = [
      {
        $lookup: {
          from: 'debtors',
          localField: 'debtorId',
          foreignField: '_id',
          as: 'debtorId',
        },
      },
      { $unwind: '$debtorId' },
      {
        $addFields: {
          statusNumber: {
            $cond: [
              { $eq: ['$status', 'SUBMITTED'] },
              1,
              {
                $cond: [
                  { $eq: ['$status', 'PENDING'] },
                  2,
                  { $cond: [{ $eq: ['$status', 'NOT_REPORTABLE'] }, 3, 4] },
                ],
              },
            ],
          },
        },
      },
      { $sort: { statusNumber: 1 } },
      {
        $group: {
          _id: {
            month: '$month',
            year: '$year',
          },
          debtorCount: { $sum: 1 },
          amounts: { $sum: '$outstandingAmount' },
          debtors: {
            $push: {
              _id: '$_id',
              name: '$debtorId.entityName',
              acn: '$acn',
              overdueType: '$overdueType',
              status: '$status',
              amount: '$outstandingAmount',
            },
          },
          submitted: {
            $sum: { $cond: [{ $eq: ['$status', 'SUBMITTED'] }, 1, 0] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] },
          },
          notReportable: {
            $sum: { $cond: [{ $eq: ['$status', 'NOT_REPORTABLE'] }, 1, 0] },
          },
          reportedToInsurer: {
            $sum: {
              $cond: [{ $eq: ['$status', 'REPORTED_TO_INSURER'] }, 1, 0],
            },
          },
        },
      },
      { $sort: { submitted: -1, pending: -1, notReportable: -1 } },
      {
        $addFields: {
          status: {
            $cond: [
              { $gt: ['$submitted', 0] },
              'Submitted',
              {
                $cond: [{ $gt: ['$pending', 0] }, 'Pending', 'Process'],
              },
            ],
          },
          month: {
            $let: {
              vars: {
                monthsInString: [
                  '',
                  'January',
                  'February',
                  'March',
                  'April',
                  'May',
                  'June',
                  'July',
                  'August',
                  'September',
                  'October',
                  'November',
                  'December',
                ],
              },
              in: {
                $arrayElemAt: ['$$monthsInString', { $toInt: '$_id.month' }],
              },
            },
          },
        },
      },
      {
        $project: {
          monthString: { $concat: ['$month', ' ', '$_id.year'] },
          debtorCount: 1,
          amounts: 1,
          debtors: 1,
          status: 1,
          _id: 0,
        },
      },
      {
        $facet: {
          paginatedResult: [
            {
              $skip:
                (parseInt(requestedQuery.page) - 1) *
                parseInt(requestedQuery.limit),
            },
            { $limit: parseInt(requestedQuery.limit) },
          ],
          totalCount: [
            {
              $count: 'count',
            },
          ],
        },
      },
    ];
    query.unshift({ $match: queryFilter });
    console.log(queryFilter);
    const overdueList = await Overdue.aggregate(query).allowDiskUse(true);
    overdueList[0].paginatedResult.forEach((i) => {
      if (i.debtors.length !== 0) {
        i.debtors.forEach((j) => {
          j.overdueType = j.overdueType
            .replace(/_/g, ' ')
            .replace(/\w\S*/g, function (txt) {
              return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            });
          j.status = j.status
            .replace(/_/g, ' ')
            .replace(/\w\S*/g, function (txt) {
              return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            });
        });
      }
    });
    const headers = [
      {
        name: 'monthString',
        label: 'Month',
        type: 'string',
      },
      {
        name: 'debtorCount',
        label: 'Debtor',
        type: 'string',
      },
      {
        name: 'status',
        label: 'Status',
        type: 'string',
      },
      {
        name: 'amounts',
        label: 'Amounts',
        type: 'string',
      },
    ];
    const total =
      overdueList[0]['totalCount'].length !== 0
        ? overdueList[0]['totalCount'][0]['count']
        : 0;
    return { overdueList, total, headers };
  } catch (e) {
    Logger.log.error('Error occurred in get overdue list');
    Logger.log.error(e.message || e);
  }
};

module.exports = { getLastOverdueList, getDrawerDetails, getOverdueList };

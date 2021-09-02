/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Client = mongoose.model('client');
const ClientDebtor = mongoose.model('client-debtor');
const Overdue = mongoose.model('overdue');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { addAuditLog } = require('./audit-log.helper');
const { addNotification } = require('./notification.helper');
const { sendNotification } = require('./socket.helper');

const getLastOverdueList = async ({ date, query, counter = 0 }) => {
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
        path: 'debtorId insurerId',
        select: '_id name entityName',
      })
      .select({
        isDeleted: 0,
        createdAt: 0,
        updatedAt: 0,
        __v: 0,
        overdueAction: 0,
      })
      .lean();
    if (overdue && overdue.length !== 0) {
      return { overdue, lastMonth: query.month, lastYear: query.year };
    } else {
      let overdue = [];
      if (counter < 12) {
        counter++;
        return await getLastOverdueList({ date, query, counter });
      }
      if (overdue && overdue.length !== 0) {
        return { overdue, lastMonth: query.month, lastYear: query.year };
      } else if (counter === 12) {
        return { overdue, lastMonth: query.month, lastYear: query.year };
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in get last overdue list');
    Logger.log.error(e.message || e);
  }
};

const getDrawerDetails = async ({ overdueId, isForRisk = false }) => {
  try {
    const overdue = await Overdue.findOne({ _id: overdueId })
      .populate({
        path: 'clientId debtorId insurerId',
        select: 'name entityName',
      })
      .select({
        overdueAction: 0,
        isDeleted: 0,
        __v: 0,
        updatedAt: 0,
        createdAt: 0,
      })
      .lean();
    let response = [];
    if (overdue) {
      const overdueColumns = [
        {
          name: 'status',
          label: 'Status',
          type: isForRisk ? 'status' : 'string',
        },
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
      ];
      if (isForRisk) {
        overdueColumns.push({
          name: 'analystComment',
          label: 'Analyst Comment',
          type: 'string',
        });
      }
      overdueColumns.forEach((i) => {
        let value =
          (i.name === 'insurerId' || i.name === 'clientId') && overdue[i.name]
            ? overdue[i.name]['name']
            : i.name === 'debtorId'
            ? overdue[i.name] && overdue[i.name]['entityName']
            : overdue[i.name] || '';
        if (i.name === 'month') {
          value = getMonthString(overdue['month']) + '-' + overdue['year'];
        }
        if (i.name === 'overdueType') {
          value = formatString(value);
        }
        if (i.name === 'status') {
          value = isForRisk
            ? {
                value: value,
                label: formatString(value),
              }
            : formatString(value);
        }
        response.push({
          label: i.label,
          value: value || '',
          type: i.type,
        });
      });
    }
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
  entityId = null,
  isForSubmodule = false,
}) => {
  try {
    const queryFilter = [];
    requestedQuery.page = requestedQuery.page || 1;
    requestedQuery.limit = requestedQuery.limit || 5;
    if (!isForRisk) {
      queryFilter.push({ clientId: mongoose.Types.ObjectId(clientId) });
    } else if (isForSubmodule && entityId && requestedQuery.entityType) {
      if (requestedQuery.entityType === 'client') {
        queryFilter.push({
          clientId: mongoose.Types.ObjectId(entityId),
        });
      } else if (requestedQuery.entityType === 'debtor') {
        queryFilter.push({
          debtorId: mongoose.Types.ObjectId(entityId),
        });
        isForSubmodule = false;
      }
    } else if (isForRisk && !hasFullAccess) {
      const clients = await Client.find({
        $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
      })
        .select('_id name')
        .lean();
      const clientIds = clients.map((i) => i._id);
      queryFilter.push({ clientId: { $in: clientIds } });
    }
    if (requestedQuery.debtorId) {
      queryFilter.push({
        debtorId: mongoose.Types.ObjectId(requestedQuery.debtorId),
      });
    }
    if (requestedQuery.minOutstandingAmount) {
      queryFilter.push({
        outstandingAmount: {
          $gte: parseInt(requestedQuery.minOutstandingAmount),
        },
      });
    }
    if (requestedQuery.maxOutstandingAmount) {
      queryFilter.push({
        outstandingAmount: {
          $lte: parseInt(requestedQuery.maxOutstandingAmount),
        },
      });
    }
    let array = [];
    if (requestedQuery.startDate) {
      array.push({
        $gte: [
          { $toInt: '$month' },
          new Date(requestedQuery.startDate).getMonth() + 1,
        ],
      });
      array.push({
        $gte: [
          { $toInt: '$year' },
          new Date(requestedQuery.startDate).getFullYear(),
        ],
      });
      queryFilter.push({ $expr: { $and: array } });
    }
    if (requestedQuery.endDate) {
      array = [];
      array.push({
        $lte: [
          { $toInt: '$month' },
          new Date(requestedQuery.endDate).getMonth() + 1,
        ],
      });
      array.push({
        $lte: [
          { $toInt: '$year' },
          new Date(requestedQuery.endDate).getFullYear(),
        ],
      });
      queryFilter.push({ $expr: { $and: array } });
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
      { $unwind: { path: '$debtorId', preserveNullAndEmptyArrays: true } },
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
    ];
    const groupBy = {
      month: '$month',
      year: '$year',
    };
    const project = {
      monthString: { $concat: ['$month', ' ', '$_id.year'] },
      debtorCount: 1,
      amounts: 1,
      debtors: 1,
      status: 1,
      _id: 0,
    };
    if (isForRisk && !isForSubmodule) {
      query.push(
        {
          $lookup: {
            from: 'clients',
            localField: 'clientId',
            foreignField: '_id',
            as: 'clientId',
          },
        },
        { $unwind: '$clientId' },
      );
      groupBy.clientId = '$clientId._id';
      project.client = 1;
    }
    query.push(
      {
        $group: {
          _id: groupBy,
          debtorCount: { $sum: 1 },
          amounts: { $sum: '$outstandingAmount' },
          client: { $first: '$clientId.name' },
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
      {
        $addFields: {
          priority: {
            $cond: [
              { $gt: ['$submitted', 0] },
              0,
              {
                $cond: [
                  { $gt: ['$pending', 0] },
                  1,
                  { $cond: [{ $gt: ['$notReportable', 0] }, 2, 3] },
                ],
              },
            ],
          },
        },
      },
      {
        $sort: {
          priority: 1,
          '_id.month': -1,
        },
      },
      {
        $addFields: {
          status: {
            $cond: [
              { $gt: ['$submitted', 0] },
              'Submitted',
              {
                $cond: [{ $gt: ['$pending', 0] }, 'Pending', 'Processed'],
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
    );
    query.push({
      $project: project,
    });
    query.push({
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
    });
    if (queryFilter.length !== 0) {
      query.unshift({ $match: { $and: queryFilter } });
    }
    const overdueList = await Overdue.aggregate(query).allowDiskUse(true);
    overdueList[0].paginatedResult.forEach((i) => {
      if (i.debtors.length !== 0) {
        i.debtors.forEach((j) => {
          j.overdueType = formatString(j.overdueType);
          j.status = formatString(j.status);
        });
      }
    });
    let headers = [
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
        type: 'amount',
      },
    ];
    if (isForRisk && !isForSubmodule) {
      const firstColumn = [
        {
          name: 'client',
          label: 'Client Name',
          type: 'string',
        },
      ];
      headers = firstColumn.concat(headers);
    }
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

/*
Get only existing debtor list
 */
const getDebtorList = async ({
  hasFullAccess = false,
  userId,
  isForRisk = false,
}) => {
  try {
    let clientIds;
    if (!isForRisk) {
      clientIds = [userId];
    } else {
      const query = hasFullAccess
        ? { isDeleted: false }
        : {
            isDeleted: false,
            $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
          };
      const clients = await Client.find(query).select('_id').lean();
      clientIds = clients.map((i) => i._id);
    }
    const query = {
      isActive: true,
      creditLimit: { $exists: true, $ne: null },
    };
    if (clientIds.length !== 0) {
      query.clientId = { $in: clientIds };
    }
    const debtors = await ClientDebtor.find(query)
      .populate({ path: 'debtorId', select: 'entityName acn' })
      .select('_id')
      .lean();
    const debtorIds = [];
    const response = [];
    const acnResponse = [];
    debtors.forEach((i) => {
      if (i.debtorId && !debtorIds.includes(i.debtorId)) {
        response.push({
          _id: i.debtorId._id,
          name: i.debtorId.entityName,
          acn: i.debtorId.acn,
        });
        acnResponse.push({
          _id: i.debtorId._id,
          acn: i.debtorId.acn,
        });
        debtorIds.push(i.debtorId);
      }
    });
    return { response, acnResponse };
  } catch (e) {
    Logger.log.error('Error occurred in get debtor list ', e);
  }
};

const getMonthString = (month) => {
  try {
    month = parseInt(month);
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
    return monthString[month];
  } catch (e) {
    Logger.log.error('Error occurred in get month string');
    Logger.log.error(e.message || e);
  }
};

const formatString = (text) => {
  try {
    return text.replace(/_/g, ' ').replace(/\w\S*/g, function (txt) {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
  } catch (e) {
    Logger.log.error('Error occurred in format string');
    Logger.log.error(e.message || e);
  }
};

const updateList = async ({
  requestBody,
  isForRisk = false,
  clientId,
  userId,
  userName = null,
}) => {
  try {
    const promises = [];
    const newOverdues = [];
    const overdueIds = [];
    let update = {};
    for (let i = 0; i < requestBody.list.length; i++) {
      if (
        (isForRisk &&
          (!requestBody.list[i].clientId ||
            !mongoose.Types.ObjectId.isValid(requestBody.list[i].clientId))) ||
        ((!requestBody.list[i].debtorId ||
          !mongoose.Types.ObjectId.isValid(requestBody.list[i].debtorId)) &&
          !requestBody.list[i].acn) ||
        !requestBody.list[i].month ||
        !requestBody.list[i].year ||
        !requestBody.list[i].dateOfInvoice ||
        !requestBody.list[i].overdueType ||
        !requestBody.list[i].insurerId ||
        !requestBody.list[i].hasOwnProperty('isExistingData') ||
        (requestBody.list[i].isExistingData &&
          !requestBody.list[i].overdueAction) ||
        !requestBody.list[i].hasOwnProperty('outstandingAmount') ||
        requestBody.list[i].outstandingAmount <= 0
      ) {
        return {
          status: 'ERROR',
          messageCode: 'REQUIRE_FIELD_MISSING',
          message: 'Require fields are missing.',
        };
      }
      update = {};
      update.clientId = isForRisk ? requestBody.list[i].clientId : clientId;
      update.debtorId = requestBody.list[i].debtorId
        ? requestBody.list[i].debtorId
        : undefined;
      update.acn = requestBody.list[i].acn
        ? requestBody.list[i].acn
        : undefined;
      if (requestBody.list[i].dateOfInvoice) {
        update.dateOfInvoice = requestBody.list[i].dateOfInvoice;
      }
      if (requestBody.list[i].overdueType) {
        update.overdueType = requestBody.list[i].overdueType;
      }
      if (requestBody.list[i].insurerId) {
        update.insurerId = requestBody.list[i].insurerId;
      }
      if (requestBody.list[i].month) {
        update.month = requestBody.list[i].month.toString().padStart(2, '0');
      }
      if (requestBody.list[i].year) {
        update.year = requestBody.list[i].year.toString();
      }
      if (requestBody.list[i].currentAmount) {
        update.currentAmount = requestBody.list[i].currentAmount;
      }
      if (requestBody.list[i].thirtyDaysAmount) {
        update.thirtyDaysAmount = requestBody.list[i].thirtyDaysAmount;
      }
      if (requestBody.list[i].sixtyDaysAmount) {
        update.sixtyDaysAmount = requestBody.list[i].sixtyDaysAmount;
      }
      if (requestBody.list[i].ninetyDaysAmount) {
        update.ninetyDaysAmount = requestBody.list[i].ninetyDaysAmount;
      }
      if (requestBody.list[i].ninetyPlusDaysAmount) {
        update.ninetyPlusDaysAmount = requestBody.list[i].ninetyPlusDaysAmount;
      }
      if (requestBody.list[i].outstandingAmount) {
        update.outstandingAmount = requestBody.list[i].outstandingAmount;
      }
      if (requestBody.list[i].clientComment) {
        update.clientComment = requestBody.list[i].clientComment;
      }
      if (requestBody.list[i].analystComment) {
        update.analystComment = requestBody.list[i].analystComment;
      }
      update.overdueAction = requestBody.list[i].overdueAction
        ? requestBody.list[i].overdueAction
        : 'UNCHANGED';
      update.status = requestBody.list[i].status
        ? requestBody.list[i].status
        : 'SUBMITTED';
      if (!requestBody.list[i]._id) {
        const overdue = await Overdue.findOne({
          clientId: update.clientId,
          debtorId: update.debtorId,
          month: update.month,
          year: update.year,
        }).lean();
        if (overdue) {
          return {
            status: 'ERROR',
            messageCode: 'OVERDUE_ALREADY_EXISTS',
            message:
              'Overdue already exists, please create with another debtor',
          };
        }
        newOverdues.push(Overdue.create(update));
      } else {
        const overdue = await Overdue.findOne({
          clientId: update.clientId,
          debtorId: update.debtorId,
          month: update.month,
          year: update.year,
        }).lean();
        if (overdue && overdue._id.toString() !== requestBody.list[i]._id) {
          return {
            status: 'ERROR',
            messageCode: 'OVERDUE_ALREADY_EXISTS',
            message:
              'Overdue already exists, please create with another debtor',
          };
        }
        if (!overdue) {
          promises.push(Overdue.create(update));
        } else {
          promises.push(
            Overdue.updateOne({ _id: requestBody.list[i]._id }, update, {
              upsert: true,
            }),
          );
          overdueIds.push({ id: requestBody.list[i]._id, action: 'edit' });
        }
      }
    }
    if (newOverdues.length !== 0) {
      const response = await Promise.all(newOverdues);
      response.map((i) => overdueIds.push({ id: i._id, action: 'add' }));
    }
    const response = await Promise.all(promises);
    addNotifications({
      overdueIds,
      userId: isForRisk ? userId : clientId,
      type: isForRisk ? 'user' : 'client-user',
      userName,
    });
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in update list');
    Logger.log.error(e.message || e);
  }
};

const addNotifications = async ({ userId, overdueIds, type, userName }) => {
  try {
    for (let i = 0; i < overdueIds.length; i++) {
      const overdue = await Overdue.findOne({
        _id: overdueIds[i].id,
      })
        .populate({ path: 'clientId debtorId', select: 'name entityName' })
        .lean();
      if (overdue) {
        const description =
          overdueIds[i].action === 'add'
            ? `A new overdue of ${overdue?.clientId?.name} and ${
                overdue?.debtorId?.entityName || overdue?.acn
              } is generated by ${
                type === 'user' ? userName : overdue?.clientId?.name
              }`
            : `An overdue of ${overdue?.clientId?.name} and ${
                overdue?.debtorId?.entityName || overdue?.acn
              } is updated by ${
                type === 'user' ? userName : overdue?.clientId?.name
              }`;
        addAuditLog({
          entityType: 'overdue',
          entityRefId: overdue._id,
          actionType: overdueIds[i].action,
          userType: type,
          userRefId: userId,
          logDescription: description,
        });
        const notification = await addNotification({
          userId: type === 'user' ? overdue?.clientId?._id : userId,
          userType: type === 'user' ? 'client-user' : 'user',
          description: description,
          entityId: overdue._id,
          entityType: 'overdue',
        });
        if (notification) {
          sendNotification({
            notificationObj: {
              type: 'OVERDUE',
              data: notification,
            },
            type: notification.userType,
            userId: notification.userId,
          });
        }
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in add notification');
    Logger.log.error(e);
  }
};

module.exports = {
  getLastOverdueList,
  getDrawerDetails,
  getOverdueList,
  getDebtorList,
  getMonthString,
  formatString,
  updateList,
};

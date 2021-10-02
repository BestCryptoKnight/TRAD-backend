/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const ClientDebtor = mongoose.model('client-debtor');
const Client = mongoose.model('client');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { Parser } = require('json2csv');
const { formatString } = require('./overdue.helper');
const { addNotification } = require('./notification.helper');
const { sendNotification } = require('./socket.helper');
const { generateDecisionLetter } = require('./pdf-generator.helper');
const { getRegexForSearch } = require('./audit-log.helper');

const getClientDebtorDetails = async ({ debtor, manageColumns }) => {
  try {
    if (debtor.debtorId && debtor.debtorId.entityType) {
      debtor.debtorId.entityType = debtor.debtorId.entityType
        .replace(/_/g, ' ')
        .replace(/\w\S*/g, function (txt) {
          return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
    }
    let response = [];
    let value = '';
    manageColumns.forEach((i) => {
      const addressFields = [
        'property',
        'unitNumber',
        'streetNumber',
        'streetName',
        'streetType',
        'suburb',
        'state',
        'country',
        'postCode',
      ];
      if (addressFields.includes(i.name)) {
        response.push({
          label: i.label,
          value:
            i.name === 'country'
              ? debtor['debtorId']['address'][i.name]['name']
              : debtor['debtorId']['address'][i.name] || '',
          type: i.type,
        });
      } else {
        value =
          i.name === 'creditLimit' ||
          i.name === 'createdAt' ||
          i.name === 'updatedAt'
            ? debtor[i.name]
            : debtor['debtorId'][i.name];
        if (i.name === 'isActive' || i.name === 'isAutoApproveAllowed') {
          value = value ? 'Yes' : 'No';
        }
        if (value) {
          response.push({
            label: i.label,
            value: value || '-',
            type: i.type,
          });
        }
      }
    });
    return response;
  } catch (e) {
    Logger.log.error(
      'Error occurred in get client-debtor details ',
      e.message || e,
    );
  }
};

const getClientCreditLimit = async ({
  debtorColumn,
  requestedQuery,
  moduleColumn,
  clientId,
  isForRisk = true,
  hasOnlyReadAccessForDebtorModule = false,
  hasOnlyReadAccessForApplicationModule = false,
}) => {
  try {
    debtorColumn.push('isFromOldSystem');
    const clientDebtorDetails = [
      'creditLimit',
      'expiryDate',
      'activeApplicationId',
      'isFromOldSystem',
      'createdAt',
      'updatedAt',
    ];
    const queryFilter = {
      isActive: true,
      clientId: mongoose.Types.ObjectId(clientId),
      // creditLimit: { $exists: true, $ne: null },
      $and: [
        { creditLimit: { $exists: true } },
        { creditLimit: { $ne: null } },
        { creditLimit: { $ne: 0 } },
      ],
    };
    const aggregationQuery = [
      {
        $lookup: {
          from: 'debtors',
          localField: 'debtorId',
          foreignField: '_id',
          as: 'debtorId',
        },
      },
      {
        $unwind: {
          path: '$debtorId',
        },
      },
    ];
    if (requestedQuery.entityType) {
      aggregationQuery.push({
        $match: {
          'debtorId.entityType': requestedQuery.entityType,
        },
      });
    }
    if (
      debtorColumn.includes('activeApplicationId') ||
      debtorColumn.includes('limitType')
    ) {
      aggregationQuery.push(
        {
          $lookup: {
            from: 'applications',
            localField: 'activeApplicationId',
            foreignField: '_id',
            as: 'activeApplicationId',
          },
        },
        {
          $unwind: {
            path: '$activeApplicationId',
            preserveNullAndEmptyArrays: true,
          },
        },
      );
    }
    const fields = debtorColumn.map((i) => {
      i = !clientDebtorDetails.includes(i) ? 'debtorId.' + i : i;
      return [i, 1];
    });
    fields.push(['debtorId._id', 1]);
    aggregationQuery.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });

    if (requestedQuery.search) {
      aggregationQuery.push({
        $match: {
          'debtorId.entityName': {
            $regex: getRegexForSearch(requestedQuery.search),
            $options: 'i',
          },
        },
      });
    }

    const sortingOptions = {};
    if (requestedQuery.sortBy && requestedQuery.sortOrder) {
      requestedQuery.sortBy = !clientDebtorDetails.includes(
        requestedQuery.sortBy,
      )
        ? 'debtorId.' + requestedQuery.sortBy
        : requestedQuery.sortBy === 'activeApplicationId'
        ? 'activeApplicationId._id'
        : requestedQuery.sortBy;
      sortingOptions[requestedQuery.sortBy] =
        requestedQuery.sortOrder === 'desc' ? -1 : 1;
      aggregationQuery.push({ $sort: sortingOptions });
    }

    if (requestedQuery.page && requestedQuery.limit) {
      aggregationQuery.push({
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
    }
    aggregationQuery.unshift({ $match: queryFilter });

    const debtors = await ClientDebtor.aggregate(aggregationQuery).allowDiskUse(
      true,
    );

    const response =
      debtors && debtors[0] && debtors[0]['paginatedResult']
        ? debtors[0]['paginatedResult']
        : debtors;

    const total =
      debtors.length !== 0 &&
      debtors[0]['totalCount'] &&
      debtors[0]['totalCount'].length !== 0
        ? debtors[0]['totalCount'][0]['count']
        : 0;

    const headers = [];
    for (let i = 0; i < moduleColumn.length; i++) {
      if (debtorColumn.includes(moduleColumn[i].name)) {
        if (
          ((hasOnlyReadAccessForDebtorModule || !isForRisk) &&
            moduleColumn[i].name === 'entityName') ||
          (hasOnlyReadAccessForApplicationModule &&
            moduleColumn[i].name === 'activeApplicationId')
        ) {
          headers.push({
            name: moduleColumn[i].name,
            label: moduleColumn[i].label,
            type: 'string',
          });
        } else {
          headers.push(moduleColumn[i]);
        }
      }
    }
    response.forEach((debtor) => {
      if (debtor.activeApplicationId?.limitType) {
        debtor.limitType = formatString(debtor.activeApplicationId.limitType);
      }
      if (debtor.activeApplicationId?.expiryDate) {
        debtor.expiryDate = debtor.activeApplicationId.expiryDate;
      }
      if (debtor.activeApplicationId?.applicationId) {
        debtor.activeApplicationId = hasOnlyReadAccessForApplicationModule
          ? debtor.activeApplicationId.applicationId
          : {
              _id: debtor.activeApplicationId._id,
              value: debtor.activeApplicationId.applicationId,
            };
      }
      if (debtor.debtorId) {
        delete debtor.debtorId._id;
        for (let key in debtor.debtorId) {
          debtor[key] = debtor.debtorId[key];
        }
        delete debtor.debtorId;
      }
      if (debtor.entityType) {
        debtor.entityType = formatString(debtor.entityType);
      }
      if (debtor.entityName && isForRisk && !hasOnlyReadAccessForDebtorModule) {
        debtor.entityName = {
          id: debtor._id,
          value: debtor.entityName,
        };
      }
      /*if (debtor.hasOwnProperty('isEndorsedLimit')) {
        debtor.isEndorsedLimit = debtor.isEndorsedLimit
          ? 'Endorsed'
          : 'Assessed';
      }*/
    });
    return {
      docs: response,
      headers,
      total,
      page: parseInt(requestedQuery.page),
      limit: parseInt(requestedQuery.limit),
      pages: Math.ceil(total / parseInt(requestedQuery.limit)),
    };
  } catch (e) {
    Logger.log.error('Error occurred in get client credit-limit list');
    Logger.log.error(e.message || e);
  }
};

const getDebtorCreditLimit = async ({
  debtorColumn,
  requestedQuery,
  moduleColumn,
  debtorId,
  hasOnlyReadAccessForClientModule = false,
  hasOnlyReadAccessForApplicationModule = false,
  hasFullAccessForClientModule,
  userId,
}) => {
  try {
    debtorColumn.push('isFromOldSystem');
    const clientDebtorDetails = [
      'creditLimit',
      'expiryDate',
      'activeApplicationId',
      'isFromOldSystem',
      'createdAt',
      'updatedAt',
    ];
    const queryFilter = {
      isActive: true,
      debtorId: mongoose.Types.ObjectId(debtorId),
      // creditLimit: { $exists: true, $ne: null },
      $and: [
        { creditLimit: { $exists: true } },
        { creditLimit: { $ne: null } },
        { creditLimit: { $ne: 0 } },
      ],
    };
    if (!hasFullAccessForClientModule && userId) {
      const clients = await Client.find({
        $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
      })
        .select('_id')
        .lean();
      if (clients?.length !== 0) {
        queryFilter.clientId = { $in: clients.map((i) => i._id) };
      }
    }
    const aggregationQuery = [
      {
        $lookup: {
          from: 'clients',
          localField: 'clientId',
          foreignField: '_id',
          as: 'clientId',
        },
      },
      {
        $unwind: {
          path: '$clientId',
        },
      },
    ];
    if (
      debtorColumn.includes('activeApplicationId') ||
      debtorColumn.includes('limitType')
    ) {
      aggregationQuery.push(
        {
          $lookup: {
            from: 'applications',
            localField: 'activeApplicationId',
            foreignField: '_id',
            as: 'activeApplicationId',
          },
        },
        {
          $unwind: {
            path: '$activeApplicationId',
            preserveNullAndEmptyArrays: true,
          },
        },
      );
    }
    const fields = debtorColumn.map((i) => {
      i = !clientDebtorDetails.includes(i) ? 'clientId.' + i : i;
      return [i, 1];
    });
    if (debtorColumn.includes('name')) {
      fields.push(['clientId._id', 1]);
    }
    aggregationQuery.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });

    if (requestedQuery.search) {
      aggregationQuery.push({
        $match: {
          'clientId.name': {
            $regex: getRegexForSearch(requestedQuery.search),
            $options: 'i',
          },
        },
      });
    }

    const sortingOptions = {};
    if (requestedQuery.sortBy && requestedQuery.sortOrder) {
      requestedQuery.sortBy = !clientDebtorDetails.includes(
        requestedQuery.sortBy,
      )
        ? 'clientId.' + requestedQuery.sortBy
        : requestedQuery.sortBy === 'activeApplicationId'
        ? 'activeApplicationId._id'
        : requestedQuery.sortBy;
      sortingOptions[requestedQuery.sortBy] =
        requestedQuery.sortOrder === 'desc' ? -1 : 1;
      aggregationQuery.push({ $sort: sortingOptions });
    }

    if (requestedQuery.page && requestedQuery.limit) {
      aggregationQuery.push({
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
    }
    aggregationQuery.unshift({ $match: queryFilter });

    const debtors = await ClientDebtor.aggregate(aggregationQuery).allowDiskUse(
      true,
    );

    const response =
      debtors && debtors[0] && debtors[0]['paginatedResult']
        ? debtors[0]['paginatedResult']
        : debtors;

    const total =
      debtors.length !== 0 &&
      debtors[0]['totalCount'] &&
      debtors[0]['totalCount'].length !== 0
        ? debtors[0]['totalCount'][0]['count']
        : 0;

    const headers = [];
    for (let i = 0; i < moduleColumn.length; i++) {
      if (debtorColumn.includes(moduleColumn[i].name)) {
        if (
          (hasOnlyReadAccessForClientModule &&
            moduleColumn[i].name === 'name') ||
          (hasOnlyReadAccessForApplicationModule &&
            moduleColumn[i].name === 'activeApplicationId')
        ) {
          headers.push({
            name: moduleColumn[i].name,
            label: moduleColumn[i].label,
            type: 'string',
          });
        } else {
          headers.push(moduleColumn[i]);
        }
      }
    }
    response.forEach((debtor) => {
      if (debtor.activeApplicationId?.limitType) {
        debtor.limitType = formatString(debtor.activeApplicationId.limitType);
      }
      if (debtor.activeApplicationId?.expiryDate) {
        debtor.expiryDate = debtor.activeApplicationId.expiryDate;
      }
      if (debtor.activeApplicationId?.applicationId) {
        debtor.activeApplicationId = hasOnlyReadAccessForApplicationModule
          ? debtor.activeApplicationId.applicationId
          : {
              _id: debtor.activeApplicationId._id,
              value: debtor.activeApplicationId.applicationId,
            };
      }
      if (debtor.clientId && debtor.clientId.contactNumber) {
        debtor.contactNumber = debtor.clientId.contactNumber;
      }
      if (debtor.clientId && debtor.clientId.abn) {
        debtor.abn = debtor.clientId.abn;
      }
      if (debtor.clientId && debtor.clientId.acn) {
        debtor.acn = debtor.clientId.acn;
      }
      if (debtor.clientId.name) {
        debtor.name = hasOnlyReadAccessForClientModule
          ? debtor.clientId.name
          : {
              id: debtor.clientId._id,
              value: debtor.clientId.name,
            };
      }
      delete debtor.clientId;
    });
    return {
      docs: response,
      headers,
      total,
      page: parseInt(requestedQuery.page),
      limit: parseInt(requestedQuery.limit),
      pages: Math.ceil(total / parseInt(requestedQuery.limit)),
    };
  } catch (e) {
    Logger.log.error('Error occurred in get debtor credit-limit list');
    Logger.log.error(e.message || e);
  }
};

const formatCSVList = async ({ response, moduleColumn }) => {
  try {
    const finalArray = [];
    let data = {};
    response.forEach((i) => {
      data = {};
      moduleColumn.map((key) => {
        if (
          (key === 'entityName' ||
            key === 'activeApplicationId' ||
            key === 'name') &&
          i[key] &&
          i[key]['value']
        ) {
          i[key] = i[key]['value'];
        }
        if (
          (key === 'expiryDate' ||
            key === 'inceptionDate' ||
            key === 'createdAt' ||
            key === 'updatedAt') &&
          i[key]
        ) {
          i[key] =
            new Date(i[key]).getDate() +
            '-' +
            (new Date(i[key]).getMonth() + 1) +
            '-' +
            new Date(i[key]).getFullYear();
        }
        data[key] = i[key];
      });
      finalArray.push(data);
    });
    return finalArray;
  } catch (e) {
    Logger.log.error('Error occurred in format credit-limit list');
    Logger.log.error(e.message || e);
  }
};

const convertToCSV = (arr) => {
  const json2csvParser = new Parser();
  const csv = json2csvParser.parse(arr);
  return csv;
};

const checkForExpiringLimit = async ({ startDate, endDate }) => {
  try {
    const creditLimits = await ClientDebtor.find({
      expiryDate: { $exists: true, $ne: null, $gte: startDate, $lte: endDate },
      isActive: true,
    })
      .populate({
        path: 'clientId',
        populate: { path: 'riskAnalystId' },
      })
      .populate('debtorId')
      .select('_id clientId debtorId')
      .lean();
    const response = [];
    creditLimits.forEach((i) => {
      if (
        i.clientId &&
        i.clientId.name &&
        i.clientId.riskAnalystId &&
        i.clientId.riskAnalystId._id &&
        i.debtorId &&
        i.debtorId._id &&
        i.debtorId.entityName
      ) {
        response.push({
          id: i.debtorId._id + i.clientId.riskAnalystId._id,
          clientName: i.clientId.name,
          debtorId: i.debtorId._id,
          debtorName: i.debtorId.entityName,
          riskAnalystId: i.clientId.riskAnalystId._id,
          creditLimitId: i._id,
        });
      }
    });
    const filteredData = Array.from(new Set(response.map((s) => s.id))).map(
      (id) => {
        return {
          id: id,
          clientName: response.find((i) => i.id === id).clientName,
          debtorId: response.find((i) => i.id === id).debtorId,
          debtorName: response.find((i) => i.id === id).debtorName,
          riskAnalystId: response.find((i) => i.id === id).riskAnalystId,
          creditLimitId: response.find((i) => i.id === id).creditLimitId,
        };
      },
    );
    for (let i = 0; i < filteredData.length; i++) {
      const notification = await addNotification({
        userId: filteredData[i].riskAnalystId,
        userType: 'user',
        description: `Credit limit for ${filteredData[i].clientName} - ${filteredData[i].debtorName} is expiring today`,
        entityType: 'credit-limit',
        entityId: filteredData[i]?.debtorId,
      });
      if (notification) {
        sendNotification({
          notificationObj: {
            type: 'CREDIT_LIMIT_EXPIRING',
            data: notification,
          },
          type: notification.userType,
          userId: notification.userId,
        });
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in check for expiring credit limit');
    Logger.log.error(e);
  }
};

const downloadDecisionLetter = async ({ creditLimitId }) => {
  try {
    const query = {
      _id: creditLimitId,
    };
    const clientDebtor = await ClientDebtor.findOne(query)
      .populate({
        path: 'clientId',
        populate: {
          path: 'serviceManagerId',
          select: 'name email contactNumber',
        },
      })
      .populate({
        path: 'debtorId',
        select: 'entityName registrationNumber abn acn address',
      })
      .populate('activeApplicationId')
      .lean();
    console.log(clientDebtor);
    let bufferData;
    if (!clientDebtor?.isFromOldSystem) {
      /* } else {*/
      const response = {
        status:
          parseInt(clientDebtor.creditLimit) >
          parseInt(clientDebtor?.activeApplicationId?.creditLimit)
            ? 'PARTIALLY_APPROVED'
            : 'APPROVED',
        clientName:
          clientDebtor.clientId && clientDebtor.clientId.name
            ? clientDebtor.clientId.name
            : '',
        debtorName:
          clientDebtor.debtorId && clientDebtor.debtorId.entityName
            ? clientDebtor.debtorId.entityName
            : '',
        serviceManagerNumber:
          clientDebtor.clientId &&
          clientDebtor.clientId.serviceManagerId &&
          clientDebtor.clientId.serviceManagerId.contactNumber
            ? clientDebtor.clientId.serviceManagerId.contactNumber
            : '',
        requestedAmount: parseInt(
          clientDebtor?.activeApplicationId?.creditLimit,
        ).toFixed(2),
        approvedAmount: clientDebtor?.creditLimit?.toFixed(2),
        approvalStatus: clientDebtor?.activeApplicationId?.comments,
      };
      bufferData = await generateDecisionLetter(response);
    }
    return {
      applicationNumber: clientDebtor?.activeApplicationId?.applicationId,
      bufferData,
    };
  } catch (e) {
    Logger.log.error('Error occurred in download decision letter', e);
  }
};

const updateActiveReportInCreditLimit = async ({ reportDetails, debtorId }) => {
  try {
    const reportCodes = {
      HXBSC: ['HXBCA', 'HXPAA', 'HXPYA'],
      HXBCA: ['HXPAA', 'HXPYA'],
      HXPYA: ['HXPAA'],
      HNBCau: ['NPA'],
    };
    const activeCreditLimit = await ClientDebtor.findOne({
      isActive: true,
      debtorId: mongoose.Types.ObjectId(debtorId),
      $and: [
        { creditLimit: { $exists: true } },
        { creditLimit: { $ne: null } },
        { creditLimit: { $ne: 0 } },
        { currentReportId: { $exists: true } },
        { currentReportId: { $ne: null } },
      ],
    })
      .populate('currentReportId')
      .lean();
    if (activeCreditLimit && activeCreditLimit?.currentReportId) {
      if (
        activeCreditLimit.currentReportId?.productCode &&
        reportCodes[activeCreditLimit.currentReportId.productCode]?.includes(
          reportDetails.productCode,
        )
      ) {
        console.log('reportDetails.productCode', reportDetails.productCode);
        console.log(
          'activeCreditLimit.currentReportId',
          activeCreditLimit.currentReportId,
        );
        await ClientDebtor.updateMany(
          {
            isActive: true,
            debtorId: mongoose.Types.ObjectId(debtorId),
            $and: [
              { creditLimit: { $exists: true } },
              { creditLimit: { $ne: null } },
              { creditLimit: { $ne: 0 } },
            ],
          },
          { currentReportId: reportDetails._id },
        );
      }
    } else {
      await ClientDebtor.updateMany(
        {
          isActive: true,
          debtorId: mongoose.Types.ObjectId(debtorId),
          $and: [
            { creditLimit: { $exists: true } },
            { creditLimit: { $ne: null } },
            { creditLimit: { $ne: 0 } },
          ],
        },
        { currentReportId: reportDetails._id },
      );
    }
  } catch (e) {
    Logger.log.error(
      'Error occurred in update credit report ion credit limit',
      e.message || e,
    );
  }
};

module.exports = {
  getClientDebtorDetails,
  convertToCSV,
  getClientCreditLimit,
  getDebtorCreditLimit,
  formatCSVList,
  checkForExpiringLimit,
  downloadDecisionLetter,
  updateActiveReportInCreditLimit,
};

/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const ClientDebtor = mongoose.model('client-debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { Parser } = require('json2csv');
const { formatString } = require('./overdue.helper');

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
}) => {
  try {
    const clientDebtorDetails = [
      'creditLimit',
      'isEndorsedLimit',
      'expiryDate',
      'activeApplicationId',
      'createdAt',
      'updatedAt',
    ];
    const queryFilter = {
      isActive: true,
      clientId: mongoose.Types.ObjectId(clientId),
      creditLimit: { $exists: true, $ne: null },
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
    if (debtorColumn.includes('activeApplicationId')) {
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
            $regex: requestedQuery.search,
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
        if (!isForRisk && moduleColumn[i].name === 'entityName') {
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
      debtor._id = debtor.debtorId._id || debtor._id;
      if (
        debtor.activeApplicationId &&
        debtor.activeApplicationId.applicationId
      ) {
        debtor.activeApplicationId = {
          _id: debtor.activeApplicationId._id,
          value: debtor.activeApplicationId.applicationId,
        };
      }
      if (debtor.debtorId) {
        for (let key in debtor.debtorId) {
          debtor[key] = debtor.debtorId[key];
        }
        delete debtor.debtorId;
      }
      if (debtor.entityType) {
        debtor.entityType = formatString(debtor.entityType);
      }
      if (debtor.entityName && isForRisk) {
        debtor.entityName = {
          id: debtor._id,
          value: debtor.entityName,
        };
      }
      if (debtor.hasOwnProperty('isEndorsedLimit')) {
        debtor.isEndorsedLimit = debtor.isEndorsedLimit
          ? 'Endorsed'
          : 'Assessed';
      }
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
}) => {
  try {
    const clientDebtorDetails = [
      'creditLimit',
      'isEndorsedLimit',
      'expiryDate',
      'activeApplicationId',
      'createdAt',
      'updatedAt',
    ];
    const queryFilter = {
      isActive: true,
      debtorId: mongoose.Types.ObjectId(debtorId),
      creditLimit: { $exists: true, $ne: null },
    };
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
    if (debtorColumn.includes('activeApplicationId')) {
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
            $regex: requestedQuery.search,
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
        headers.push(moduleColumn[i]);
      }
    }
    response.forEach((debtor) => {
      if (
        debtor.activeApplicationId &&
        debtor.activeApplicationId.applicationId
      ) {
        debtor.activeApplicationId = {
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
        debtor.name = {
          id: debtor.clientId._id,
          value: debtor.clientId.name,
        };
      }
      delete debtor.clientId;
      if (debtor.hasOwnProperty('isEndorsedLimit')) {
        debtor.isEndorsedLimit = debtor.isEndorsedLimit
          ? 'Endorsed'
          : 'Assessed';
      }
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

const formatCreditLimitList = async ({ creditLimits, debtorColumn }) => {
  try {
    const finalArray = [];
    let data = {};
    creditLimits.forEach((i) => {
      data = {};
      debtorColumn.map((key) => {
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

module.exports = {
  getClientDebtorDetails,
  convertToCSV,
  getClientCreditLimit,
  getDebtorCreditLimit,
  formatCreditLimitList,
};

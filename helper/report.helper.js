/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Client = mongoose.model('client');
const Policy = mongoose.model('policy');
const Application = mongoose.model('application');
const ClientDebtor = mongoose.model('client-debtor');
const Debtor = mongoose.model('debtor');
const Insurer = mongoose.model('insurer');
const Alert = mongoose.model('alert');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { formatString } = require('./overdue.helper');
const { getClaimsDetails } = require('./rss.helper');
const { getUserName } = require('./user.helper');
const {
  getStateName,
  getDebtorFullAddress,
  getStreetTypeName,
  getLimitType,
} = require('./debtor.helper');
const StaticData = require('./../static-files/staticData.json');

/*
Get Client List Report
 */
const getClientListReport = async ({
  hasFullAccess = false,
  userId,
  reportColumn,
  requestedQuery,
}) => {
  try {
    let queryFilter = {
      isDeleted: false,
    };
    let query = [];
    let aggregationQuery = [];
    if (!hasFullAccess) {
      queryFilter = Object.assign({}, queryFilter, {
        $or: [
          { riskAnalystId: mongoose.Types.ObjectId(userId) },
          { serviceManagerId: mongoose.Types.ObjectId(userId) },
        ],
      });
    }
    if (reportColumn.includes('insurerId')) {
      query.push({
        $lookup: {
          from: 'insurers',
          localField: 'insurerId',
          foreignField: '_id',
          as: 'insurerId',
        },
      });
    }

    if (
      reportColumn.includes('riskAnalystId') ||
      requestedQuery.riskAnalystId
    ) {
      const conditions = [
        {
          $lookup: {
            from: 'users',
            localField: 'riskAnalystId',
            foreignField: '_id',
            as: 'riskAnalystId',
          },
        },
      ];
      if (requestedQuery.riskAnalystId) {
        aggregationQuery = [...aggregationQuery, ...conditions];
        aggregationQuery.push({
          $match: {
            'riskAnalystId._id': mongoose.Types.ObjectId(
              requestedQuery.riskAnalystId,
            ),
          },
        });
      } else {
        query = [...query, ...conditions];
      }
    }

    if (
      reportColumn.includes('serviceManagerId') ||
      requestedQuery.serviceManagerId
    ) {
      const conditions = [
        {
          $lookup: {
            from: 'users',
            localField: 'serviceManagerId',
            foreignField: '_id',
            as: 'serviceManagerId',
          },
        },
      ];
      if (requestedQuery.serviceManagerId) {
        aggregationQuery = [...aggregationQuery, ...conditions];
        aggregationQuery.push({
          $match: {
            'serviceManagerId._id': mongoose.Types.ObjectId(
              requestedQuery.serviceManagerId,
            ),
          },
        });
      } else {
        query = [...query, ...conditions];
      }
    }

    let dateQuery = {};
    if (requestedQuery.inceptionStartDate || requestedQuery.inceptionEndDate) {
      if (requestedQuery.inceptionStartDate) {
        dateQuery = {
          $gte: new Date(requestedQuery.inceptionStartDate),
        };
      }
      if (requestedQuery.inceptionEndDate) {
        dateQuery = Object.assign({}, dateQuery, {
          $lte: new Date(requestedQuery.inceptionEndDate),
        });
      }
      queryFilter.inceptionDate = dateQuery;
    }
    if (requestedQuery.expiryStartDate || requestedQuery.expiryEndDate) {
      dateQuery = {};
      if (requestedQuery.expiryStartDate) {
        dateQuery = {
          $gte: new Date(requestedQuery.expiryStartDate),
        };
      }
      if (requestedQuery.expiryEndDate) {
        dateQuery = Object.assign({}, dateQuery, {
          $lte: new Date(requestedQuery.expiryEndDate),
        });
      }
      queryFilter.expiryDate = dateQuery;
    }
    const fields = reportColumn.map((i) => {
      if (
        i === 'serviceManagerId' ||
        i === 'riskAnalystId' ||
        i === 'insurerId'
      ) {
        i = i + '.name';
      }
      return [i, 1];
    });
    query.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });
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
            ...query,
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

    const clients = await Client.aggregate(aggregationQuery).allowDiskUse(true);
    const response =
      clients && clients[0] && clients[0]['paginatedResult']
        ? clients[0]['paginatedResult']
        : clients;
    const total =
      clients.length !== 0 &&
      clients[0]['totalCount'] &&
      clients[0]['totalCount'].length !== 0
        ? clients[0]['totalCount'][0]['count']
        : 0;
    const policies = {};
    let isRemainingApplicationSelected = false;
    const clientApplications = {};
    if (
      reportColumn.includes('discretionaryLimit') ||
      reportColumn.includes('creditChecks') ||
      reportColumn.includes('totalApplication') ||
      reportColumn.includes('remainingApplication')
    ) {
      const clientIds = response.map((i) => i._id);
      const [ciPolicy, rmpPolicy] = await Promise.all([
        Policy.find({
          clientId: { $in: clientIds },
          product: { $regex: '.*Credit Insurance.*' },
          inceptionDate: { $lte: new Date() },
          expiryDate: { $gt: new Date() },
        })
          .select(
            '_id clientId product discretionaryLimit creditChecks inceptionDate expiryDate',
          )
          .lean(),
        Policy.find({
          clientId: { $in: clientIds },
          $or: [
            { product: { $regex: '.*Risk Management Package.*' } },
            { product: { $regex: '.*Risk Management.*' } },
          ],
          inceptionDate: { $lte: new Date() },
          expiryDate: { $gt: new Date() },
        })
          .select(
            '_id clientId product discretionaryLimit creditChecks inceptionDate expiryDate',
          )
          .lean(),
      ]);
      ciPolicy.forEach((policy) => {
        policies[policy.clientId] = policy;
      });
      rmpPolicy.forEach((policy) => {
        if (policies[policy.clientId]) {
          policies[policy.clientId]['creditChecks'] = policy['creditChecks']
            ? policy['creditChecks']
            : policies[policy.clientId]['creditChecks'];

          policies[policy.clientId]['discretionaryLimit'] =
            policies[policy.clientId]['discretionaryLimit'] &&
            parseInt(policies[policy.clientId]['discretionaryLimit']) === 0
              ? policy?.['discretionaryLimit']
              : policies[policy.clientId]?.['discretionaryLimit'];
        } else {
          policies[policy.clientId] = policy;
        }
      });
      if (reportColumn.includes('remainingApplication')) {
        const promises = [];
        isRemainingApplicationSelected = true;
        for (let key in policies) {
          promises.push(
            Application.aggregate([
              {
                $match: {
                  clientId: policies[key]['clientId'],
                  status: {
                    $nin: ['DRAFT'],
                  },
                  createdAt: {
                    $gte: new Date(policies[key]['inceptionDate']),
                    $lte: new Date(policies[key]['expiryDate']),
                  },
                },
              },
              {
                $group: {
                  _id: '$clientId',
                  count: { $sum: 1 },
                },
              },
            ]).allowDiskUse(true),
          );
        }
        const applications = await Promise.all(promises);
        applications.forEach((i) => {
          if (Array.isArray(i) && i[0]) {
            clientApplications[i[0]._id] = i[0].count;
          }
        });
      }
    }
    const isLimitSelected = reportColumn.includes('discretionaryLimit');
    const isCreditChecksSelected = reportColumn.includes('creditChecks');
    const isTotalApplicationSelected = reportColumn.includes(
      'totalApplication',
    );
    response.forEach((client) => {
      if (client.insurerId) {
        client.insurerId =
          client.insurerId && client.insurerId[0] && client.insurerId[0]['name']
            ? client.insurerId[0]['name']
            : '';
      }
      if (client.riskAnalystId) {
        client.riskAnalystId =
          client.riskAnalystId &&
          client.riskAnalystId[0] &&
          client.riskAnalystId[0]['name']
            ? client.riskAnalystId[0]['name']
            : '';
      }
      if (client.serviceManagerId) {
        client.serviceManagerId =
          client.serviceManagerId &&
          client.serviceManagerId[0] &&
          client.serviceManagerId[0]['name']
            ? client.serviceManagerId[0]['name']
            : '';
      }
      if (isLimitSelected) {
        client.discretionaryLimit =
          policies[client._id] && policies[client._id]['discretionaryLimit']
            ? parseInt(policies[client._id]['discretionaryLimit'])
            : 0;
      }
      if (isCreditChecksSelected) {
        client.creditChecks =
          policies[client._id] && policies[client._id]['creditChecks']
            ? policies[client._id]['creditChecks']
            : 0;
      }
      if (isTotalApplicationSelected) {
        client.totalApplication = clientApplications[client._id]
          ? clientApplications[client._id]
          : 0;
      }
      if (isRemainingApplicationSelected) {
        client.remainingApplication =
          policies[client._id] &&
          policies[client._id]['creditChecks'] &&
          policies[client._id]['creditChecks'].length !== 0 &&
          clientApplications[client._id]
            ? parseInt(policies[client._id]['creditChecks']) -
                clientApplications[client._id] >=
              0
              ? parseInt(policies[client._id]['creditChecks']) -
                clientApplications[client._id]
              : 0
            : 0;
      }
    });
    return { response, total };
  } catch (e) {
    Logger.log.error('Error occurred in get client list report');
    Logger.log.error(e);
  }
};

const getLimitListReport = async ({
  hasFullAccess = false,
  userId,
  reportColumn,
  requestedQuery,
  isForDownload = false,
}) => {
  try {
    const queryFilter = {
      // isActive: true,
      // $and: [
      //   { creditLimit: { $exists: true } },
      //   { creditLimit: { $ne: null } },
      //   { creditLimit: { $ne: 0 } },
      // ],
      status: { $exists: true, $in: ['APPROVED', 'DECLINED'] },
      // creditLimit: { $exists: true, $ne: null },
    };
    let query = [];
    let aggregationQuery = [];
    const filterArray = [];

    if (requestedQuery.clientIds) {
      let clientIds = requestedQuery.clientIds.split(',');
      if (isForDownload) {
        const clients = await Client.find({ _id: { $in: clientIds } })
          .select('name')
          .lean();
        filterArray.push({
          label: 'Client',
          value: clients
            .map((i) => i.name)
            .toString()
            .replace(/,/g, ', '),
          type: 'string',
        });
      }
      clientIds = clientIds.map((id) => mongoose.Types.ObjectId(id));
      queryFilter.clientId = { $in: clientIds };
    } else if (!hasFullAccess) {
      const clients = await Client.find({
        isDeleted: false,
        $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
      })
        .select('_id')
        .lean();
      const clientIds = clients.map((i) => i._id);
      queryFilter.clientId = { $in: clientIds };
    }
    if (requestedQuery.startDate || requestedQuery.endDate) {
      let dateQuery = {};
      if (requestedQuery.startDate) {
        dateQuery = {
          $gte: new Date(requestedQuery.startDate),
        };
        if (isForDownload) {
          filterArray.push({
            label: 'Start Date',
            value: requestedQuery.startDate,
            type: 'date',
          });
        }
      }
      if (requestedQuery.endDate) {
        dateQuery = Object.assign({}, dateQuery, {
          $lte: new Date(requestedQuery.endDate),
        });
        if (isForDownload) {
          filterArray.push({
            label: 'End Date',
            value: requestedQuery.endDate,
            type: 'date',
          });
        }
      }
      queryFilter.expiryDate = dateQuery;
    }

    if (
      reportColumn.includes('applicationId') ||
      reportColumn.includes('creditLimit') ||
      reportColumn.includes('acceptedAmount') ||
      reportColumn.includes('approvalOrDecliningDate') ||
      reportColumn.includes('comments') ||
      reportColumn.includes('clientReference') ||
      reportColumn.includes('limitType') ||
      requestedQuery.limitType
    ) {
      const conditions = [
        {
          $lookup: {
            from: 'applications',
            localField: 'activeApplicationId',
            foreignField: '_id',
            as: 'activeApplicationId',
          },
        },
      ];
      if (requestedQuery.limitType) {
        aggregationQuery = [...aggregationQuery, ...conditions];
        aggregationQuery.push({
          $match: {
            'activeApplicationId.limitType': {
              $in: requestedQuery.limitType.split(','),
            },
          },
        });
      } else {
        query = [...query, ...conditions];
      }
    }
    if (
      reportColumn.includes('clientId') ||
      reportColumn.includes('insurerId')
    ) {
      query.push({
        $lookup: {
          from: 'clients',
          localField: 'clientId',
          foreignField: '_id',
          as: 'clientId',
        },
      });
    }
    if (reportColumn.includes('insurerId')) {
      query.push({
        $lookup: {
          from: 'insurers',
          localField: 'clientId.insurerId',
          foreignField: '_id',
          as: 'insurerId',
        },
      });
    }
    if (
      reportColumn.includes('debtorId') ||
      reportColumn.includes('abn') ||
      reportColumn.includes('acn') ||
      reportColumn.includes('registrationNumber') ||
      reportColumn.includes('country')
    ) {
      query.push({
        $lookup: {
          from: 'debtors',
          localField: 'debtorId',
          foreignField: '_id',
          as: 'debtorId',
        },
      });
    }
    const fields = reportColumn.map((i) => {
      if (i === 'clientId' || i === 'insurerId') {
        i = i + '.name';
      }
      if (i === 'debtorId') {
        i = i + '.entityName';
      }
      if (i === 'abn' || i === 'acn' || i === 'registrationNumber') {
        i = 'debtorId.' + i;
      }
      if (i === 'country') {
        i = 'debtorId.address.' + i;
      }
      if (
        i === 'applicationId' ||
        i === 'creditLimit' ||
        i === 'acceptedAmount' ||
        i === 'approvalOrDecliningDate' ||
        i === 'limitType' ||
        i === 'clientReference' ||
        i === 'comments'
      ) {
        i = 'activeApplicationId.' + i;
      }
      return [i, 1];
    });
    query.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });
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
            ...query,
          ],
          totalCount: [
            {
              $count: 'count',
            },
          ],
        },
      });
    } else if (query.length !== 0) {
      aggregationQuery = aggregationQuery.concat(query);
    }
    aggregationQuery.unshift({ $match: queryFilter });

    const clientDebtors = await ClientDebtor.aggregate(
      aggregationQuery,
    ).allowDiskUse(true);
    const response =
      clientDebtors && clientDebtors[0] && clientDebtors[0]['paginatedResult']
        ? clientDebtors[0]['paginatedResult']
        : clientDebtors;
    const total =
      clientDebtors.length !== 0 &&
      clientDebtors[0]['totalCount'] &&
      clientDebtors[0]['totalCount'].length !== 0
        ? clientDebtors[0]['totalCount'][0]['count']
        : 0;

    let endorsedLimits = 0;
    let creditChecks = 0;
    let creditChecksNZ = 0;
    response.forEach((limit) => {
      if (limit.insurerId) {
        limit.insurerId =
          limit.insurerId && limit.insurerId[0] && limit.insurerId[0]['name']
            ? limit.insurerId[0]['name']
            : '';
      }
      if (limit.clientId) {
        limit.clientId =
          limit.clientId && limit.clientId[0] && limit.clientId[0]['name']
            ? limit.clientId[0]['name']
            : '';
      }
      if (limit.debtorId && limit.debtorId[0] && limit.debtorId[0].abn) {
        limit.abn = limit.debtorId[0]['abn'] ? limit.debtorId[0]['abn'] : '';
      }
      if (limit.debtorId && limit.debtorId[0] && limit.debtorId[0].acn) {
        limit.acn = limit.debtorId[0]['acn'] ? limit.debtorId[0]['acn'] : '';
      }
      if (
        limit.debtorId &&
        limit.debtorId[0] &&
        limit.debtorId[0].registrationNumber
      ) {
        limit.registrationNumber = limit.debtorId[0]['registrationNumber']
          ? limit.debtorId[0]['registrationNumber']
          : '';
      }
      if (limit.debtorId && limit.debtorId[0] && limit.debtorId[0].address) {
        limit.country =
          limit.debtorId[0]['address']['country'] &&
          limit.debtorId[0]['address']['country']['name']
            ? limit.debtorId[0]['address']['country']['name']
            : '';
      }
      limit.debtorId =
        limit.debtorId && limit.debtorId[0] && limit.debtorId[0]['entityName']
          ? limit.debtorId[0]['entityName']
          : '';
      if (
        limit.activeApplicationId &&
        limit.activeApplicationId[0] &&
        limit.activeApplicationId[0].applicationId
      ) {
        limit.applicationId = limit.activeApplicationId[0].applicationId
          ? limit.activeApplicationId[0].applicationId
          : '';
      }
      if (
        limit.activeApplicationId &&
        limit.activeApplicationId[0] &&
        limit.activeApplicationId[0].creditLimit
      ) {
        limit.creditLimit = limit.activeApplicationId[0].creditLimit
          ? limit.activeApplicationId[0].creditLimit
          : '';
      }
      if (
        limit.activeApplicationId &&
        limit.activeApplicationId[0] &&
        limit.activeApplicationId[0].acceptedAmount
      ) {
        limit.acceptedAmount = limit.activeApplicationId[0].acceptedAmount
          ? limit.activeApplicationId[0].acceptedAmount
          : '';
      }
      if (
        limit.activeApplicationId &&
        limit.activeApplicationId[0] &&
        limit.activeApplicationId[0].approvalOrDecliningDate
      ) {
        limit.approvalOrDecliningDate = limit.activeApplicationId[0]
          .approvalOrDecliningDate
          ? limit.activeApplicationId[0].approvalOrDecliningDate
          : '';
      }
      /*if (
        limit.activeApplicationId &&
        limit.activeApplicationId[0] &&
        limit.activeApplicationId[0].expiryDate
      ) {
        limit.expiryDate = limit.activeApplicationId[0].expiryDate
          ? limit.activeApplicationId[0].expiryDate
          : '';
      }*/
      if (limit?.activeApplicationId?.[0]?.limitType) {
        limit.limitType = getLimitType(limit.activeApplicationId[0].limitType);
        limit.activeApplicationId[0].limitType === 'ENDORSED'
          ? endorsedLimits++
          : limit.activeApplicationId[0].limitType === 'CREDIT_CHECK'
          ? creditChecks++
          : limit.activeApplicationId[0].limitType === 'CREDIT_CHECK_NZ'
          ? creditChecksNZ++
          : null;
      }
      if (limit?.activeApplicationId?.[0]?.comments) {
        limit.comments = limit.activeApplicationId[0]?.comments || '';
      }
      if (limit?.activeApplicationId?.[0]?.clientReference) {
        limit.clientReference =
          limit.activeApplicationId[0]?.clientReference || '';
      }
      delete limit.activeApplicationId;
    });
    if (isForDownload) {
      filterArray.push(
        {
          label: 'Endorsed Limits',
          value: endorsedLimits,
          type: 'string',
        },
        { label: 'Credit Checks', value: creditChecks, type: 'string' },
        { label: 'Credit Checks NZ', value: creditChecksNZ, type: 'string' },
      );
    }
    response.forEach((v) => {
      !v.hasOwnProperty('acceptedAmount') ? (v['acceptedAmount'] = 0) : null;
      !v.hasOwnProperty('creditLimit') ? (v['creditLimit'] = 0) : null;
    });
    return { response, total, filterArray };
  } catch (e) {
    Logger.log.error('Error occurred in get limit list report');
    Logger.log.error(e);
  }
};

const getPendingApplicationReport = async ({
  hasFullAccess = false,
  userId,
  reportColumn,
  requestedQuery,
  isForDownload = false,
}) => {
  try {
    const queryFilter = {
      isDeleted: false,
      status: {
        $in: [
          'SENT_TO_INSURER',
          'REVIEW_APPLICATION',
          'PENDING_DIRECT_APPROACH',
          'SUBMITTED',
          'AWAITING_INFORMATION',
        ],
      },
    };
    const query = [];
    let aggregationQuery = [];
    const filterArray = [];
    if (requestedQuery.clientIds) {
      let clientIds = requestedQuery.clientIds.split(',');
      if (isForDownload) {
        const clients = await Client.find({ _id: { $in: clientIds } })
          .select('name')
          .lean();
        filterArray.push({
          label: 'Client',
          value: clients
            .map((i) => i.name)
            .toString()
            .replace(/,/g, ', '),
          type: 'string',
        });
      }
      clientIds = clientIds.map((id) => mongoose.Types.ObjectId(id));
      queryFilter.clientId = { $in: clientIds };
    } else if (!hasFullAccess) {
      const clients = await Client.find({
        isDeleted: false,
        $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
      })
        .select('_id')
        .lean();
      const clientIds = clients.map((i) => i._id);
      queryFilter.clientId = { $in: clientIds };
    }
    if (requestedQuery.debtorId) {
      queryFilter.debtorId = mongoose.Types.ObjectId(requestedQuery.debtorId);
      if (isForDownload) {
        const debtor = await Debtor.findOne({ _id: requestedQuery.debtorId })
          .select('entityName')
          .lean();
        filterArray.push({
          label: 'Debtor',
          value: debtor && debtor.entityName ? debtor.entityName : '',
          type: 'string',
        });
      }
    }
    if (requestedQuery.startDate || requestedQuery.endDate) {
      let dateQuery = {};
      if (requestedQuery.startDate) {
        dateQuery = {
          $gte: new Date(requestedQuery.startDate),
        };
        if (isForDownload) {
          filterArray.push({
            label: 'Start Date',
            value: requestedQuery.startDate,
            type: 'date',
          });
        }
      }
      if (requestedQuery.endDate) {
        dateQuery = Object.assign({}, dateQuery, {
          $lte: new Date(requestedQuery.endDate),
        });
        if (isForDownload) {
          filterArray.push({
            label: 'End Date',
            value: requestedQuery.endDate,
            type: 'date',
          });
        }
      }
      queryFilter.requestDate = dateQuery;
    }
    if (requestedQuery.limitType) {
      queryFilter.limitType = { $in: requestedQuery.limitType.split(',') };
      filterArray.push({
        label: 'Limit Type',
        value: requestedQuery.limitType.split(',')?.map((i) => getLimitType(i)),
        type: 'string',
      });
    }
    if (
      reportColumn.includes('clientId') ||
      reportColumn.includes('insurerId')
    ) {
      query.push({
        $lookup: {
          from: 'clients',
          localField: 'clientId',
          foreignField: '_id',
          as: 'clientId',
        },
      });
    }
    if (reportColumn.includes('insurerId')) {
      query.push({
        $lookup: {
          from: 'insurers',
          localField: 'clientId.insurerId',
          foreignField: '_id',
          as: 'insurerId',
        },
      });
    }
    if (
      reportColumn.includes('debtorId') ||
      reportColumn.includes('entityType')
    ) {
      query.push({
        $lookup: {
          from: 'debtors',
          localField: 'debtorId',
          foreignField: '_id',
          as: 'debtorId',
        },
      });
    }
    const fields = reportColumn.map((i) => {
      if (i === 'clientId' || i === 'insurerId') {
        i = i + '.name';
      }
      if (i === 'debtorId') {
        i = i + '.entityName';
      }
      if (i === 'entityType') {
        i = 'debtorId.' + i;
      }
      return [i, 1];
    });
    query.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });
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
            ...query,
          ],
          totalCount: [
            {
              $count: 'count',
            },
          ],
        },
      });
    } else if (query.length !== 0) {
      aggregationQuery = aggregationQuery.concat(query);
    }
    aggregationQuery.unshift({ $match: queryFilter });

    const applications = await Application.aggregate(
      aggregationQuery,
    ).allowDiskUse(true);
    const response =
      applications && applications[0] && applications[0]['paginatedResult']
        ? applications[0]['paginatedResult']
        : applications;
    const total =
      applications.length !== 0 &&
      applications[0]['totalCount'] &&
      applications[0]['totalCount'].length !== 0
        ? applications[0]['totalCount'][0]['count']
        : 0;

    response.forEach((application) => {
      if (application.insurerId) {
        application.insurerId =
          application.insurerId &&
          application.insurerId[0] &&
          application.insurerId[0]['name']
            ? application.insurerId[0]['name']
            : '';
      }
      if (application.clientId) {
        application.clientId =
          application.clientId &&
          application.clientId[0] &&
          application.clientId[0]['name']
            ? application.clientId[0]['name']
            : '';
      }
      if (
        application.debtorId &&
        application.debtorId[0] &&
        application.debtorId[0].entityType
      ) {
        application.entityType = application.debtorId[0]['entityType']
          ? formatString(application.debtorId[0]['entityType'])
          : '';
      }
      if (application?.limitType) {
        application.limitType = getLimitType(application.limitType);
      }
      application.debtorId =
        application.debtorId &&
        application.debtorId[0] &&
        application.debtorId[0].entityName
          ? application.debtorId[0]['entityName']
          : '';
      if (application.status) {
        application.status = formatString(application.status);
      }
    });
    return { response, total, filterArray };
  } catch (e) {
    Logger.log.error('Error occurred in get pending application report');
    Logger.log.error(e.message || e);
  }
};

const getReviewReport = async ({
  hasFullAccess = false,
  userId,
  reportColumn,
  requestedQuery,
  isForDownload = false,
}) => {
  try {
    const addressFields = [
      'fullAddress',
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
    const queryFilter = {};
    let dateQuery = {};
    const filterArray = [];
    let clientNameMap = {};

    let insurers = {};
    let clientIds;
    const clientQuery = {
      isDeleted: false,
    };
    const isInsurerNameSelected = reportColumn.includes('insurerId');
    const isClientNameSelected = reportColumn.includes('clientId');

    if (isInsurerNameSelected) {
      const insurerList = await Insurer.find({ isDeleted: false })
        .select('_id name')
        .lean();
      insurerList.forEach((i) => (insurers[i._id] = i.name));
    }

    if (
      (!hasFullAccess && userId) ||
      isClientNameSelected ||
      isInsurerNameSelected ||
      requestedQuery.clientIds
    ) {
      if (!hasFullAccess && userId) {
        clientQuery['$or'] = [
          { riskAnalystId: userId },
          { serviceManagerId: userId },
        ];
      }

      if (requestedQuery.clientIds) {
        const clientIds = requestedQuery.clientIds
          .split(',')
          .map((id) => mongoose.Types.ObjectId(id));

        clientQuery['_id'] = { $in: clientIds };

        if (isForDownload) {
          const clients = await Client.find({ _id: { $in: clientIds } })
            .select('name')
            .lean();
          filterArray.push({
            label: 'Client',
            value: clients
              .map((i) => i.name)
              .toString()
              .replace(/,/g, ', '),
            type: 'string',
          });
        }
      }

      const clients = await Client.find(clientQuery).select('_id').lean();
      clientIds = clients.map((i) => i._id);

      const clientDebtor = await ClientDebtor.find({
        clientId: { $in: clientIds },
        status: { $in: ['APPROVED', 'DECLINED'] },
      })
        .populate({ path: 'clientId', select: '_id name insurerId' })
        .select('debtorId clientId')
        .lean();
      const debtorIds = [];

      clientDebtor.forEach((i) => {
        debtorIds.push(mongoose.Types.ObjectId(i.debtorId));
        if (!clientNameMap[i.debtorId]) {
          clientNameMap[i.debtorId] = {};
          clientNameMap[i.debtorId]['insurerId'] = [];
          clientNameMap[i.debtorId]['clientId'] = [];
        }
        clientNameMap[i.debtorId]['clientId'].push(i.clientId.name);
        if (
          !clientNameMap[i.debtorId]['insurerId'].includes(
            insurers[i.clientId.insurerId],
          )
        ) {
          clientNameMap[i.debtorId]['insurerId'].push(
            insurers[i.clientId.insurerId],
          );
        }
      });
      queryFilter['_id'] = { $in: debtorIds };
    }

    if (requestedQuery.date) {
      requestedQuery.date = new Date(requestedQuery.date.trim());
      if (isForDownload) {
        filterArray.push({
          label: 'Month-Year',
          value: `${(requestedQuery.date.getMonth() + 1)
            .toString()
            .padStart(2, '0')}/${requestedQuery.date.getFullYear()}`,
          type: 'string',
        });
      }
      const firstDay = new Date(
        requestedQuery.date.getFullYear(),
        requestedQuery.date.getMonth(),
        1,
      );
      const lastDay = new Date(
        requestedQuery.date.getFullYear(),
        requestedQuery.date.getMonth() + 1,
        0,
      );
      /*if (requestedQuery.startDate) {
        dateQuery = {
          $gte: new Date(requestedQuery.startDate),
        };
      }
      if (requestedQuery.endDate) {
        dateQuery = Object.assign({}, dateQuery, {
          $lte: new Date(requestedQuery.endDate),
        });
      }*/
      dateQuery = {
        $gte: firstDay,
        $lte: lastDay,
      };
    } else if (Object.keys(requestedQuery).length === 1) {
      const date = new Date();
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      dateQuery = { $lt: lastDay };
      if (isForDownload) {
        filterArray.push({
          label: 'Month-Year',
          value: `${(date.getMonth() + 1)
            .toString()
            .padStart(2, '0')}/${date.getFullYear()}`,
          type: 'string',
        });
      }
    }
    if (requestedQuery.entityType) {
      queryFilter.entityType = requestedQuery.entityType;
      if (isForDownload) {
        filterArray.push({
          label: 'Entity Type',
          value: formatString(requestedQuery.entityType),
          type: 'string',
        });
      }
    }
    if (requestedQuery.debtorId) {
      queryFilter._id = mongoose.Types.ObjectId(requestedQuery.debtorId);
      if (isForDownload) {
        const debtor = await Debtor.findOne({ _id: requestedQuery.debtorId })
          .select('entityName')
          .lean();
        filterArray.push({
          label: 'Debtor',
          value: debtor && debtor?.entityName ? debtor.entityName : '',
          type: 'string',
        });
      }
    }
    if (requestedQuery.limitStartDate || requestedQuery.limitEndDate) {
      let dateFilter = {};
      if (requestedQuery.limitStartDate) {
        dateFilter = {
          $gte: new Date(requestedQuery.limitStartDate.trim()),
        };
      }
      if (requestedQuery.limitEndDate) {
        dateFilter = Object.assign({}, dateQuery, {
          $lte: new Date(requestedQuery.limitEndDate.trim()),
        });
      }
      queryFilter.expiryDate = dateFilter;
    }

    const query = [];
    if (Object.keys(dateQuery).length !== 0) {
      // query.push({
      //   $match: {
      //     expiryDate: dateQuery,
      //   },
      // });
      queryFilter.reviewDate = dateQuery;
    }
    if (requestedQuery.reportStartDate || requestedQuery.reportEndDate) {
      let dateFilter = {};
      if (requestedQuery.reportStartDate) {
        dateFilter = {
          $gte: new Date(requestedQuery.reportStartDate.trim()),
        };
      }
      if (requestedQuery.reportEndDate) {
        dateFilter = Object.assign({}, dateQuery, {
          $lte: new Date(requestedQuery.reportEndDate.trim()),
        });
      }
      query.push({
        $match: {
          'currentReportId.expiryDate': dateFilter,
        },
      });
    }
    /*if (
      reportColumn.includes('clientId') ||
      reportColumn.includes('insurerId')
    ) {
      query.push({
        $lookup: {
          from: 'clients',
          localField: 'clientId',
          foreignField: '_id',
          as: 'clientId',
        },
      });
    }
    if (reportColumn.includes('insurerId')) {
      query.push({
        $lookup: {
          from: 'insurers',
          localField: 'clientId.insurerId',
          foreignField: '_id',
          as: 'insurerId',
        },
      });
    }*/
    /*if (
      reportColumn.includes('debtorId') ||
      reportColumn.includes('entityType') ||
      reportColumn.includes('abn') ||
      reportColumn.includes('acn') ||
      reportColumn.includes('registrationNumber') ||
      reportColumn.includes('country')
    ) {
      query.push({
        $lookup: {
          from: 'debtors',
          localField: 'debtorId',
          foreignField: '_id',
          as: 'debtorId',
        },
      });
    }*/
    /* if (
      reportColumn.includes('requestedCreditLimit') ||
      reportColumn.includes('approvalOrDecliningDate') ||
      reportColumn.includes('applicationExpiryDate') ||
      reportColumn.includes('comments') ||
      reportColumn.includes('clientReference') ||
      reportColumn.includes('limitType')
    ) {
      query.push({
        $lookup: {
          from: 'applications',
          localField: 'activeApplicationId',
          foreignField: '_id',
          as: 'activeApplicationId',
        },
      });
    }*/
    const fields = reportColumn.map((i) => {
      if (addressFields.includes(i)) {
        i = 'address';
      }
      return [i, 1];
    });
    query.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });
    if (requestedQuery.page && requestedQuery.limit) {
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
    }
    query.unshift({ $match: queryFilter });
    const debtors = await Debtor.aggregate(query).allowDiskUse(true);
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
    response.forEach((debtor) => {
      if (reportColumn.includes('property')) {
        debtor.property = debtor.address.property;
      }
      if (reportColumn.includes('unitNumber')) {
        debtor.unitNumber = debtor.address.unitNumber;
      }
      if (reportColumn.includes('streetNumber')) {
        debtor.streetNumber = debtor.address.streetNumber;
      }
      if (reportColumn.includes('streetName')) {
        debtor.streetName = debtor.address.streetName;
      }
      if (reportColumn.includes('streetType')) {
        debtor.streetType = getStreetTypeName(debtor.address.streetType).label;
      }
      if (reportColumn.includes('suburb')) {
        debtor.suburb = debtor.address.suburb;
      }
      if (reportColumn.includes('state')) {
        const state = getStateName(
          debtor.address.state,
          debtor.address.country.code,
        );
        debtor.state = state && state.name ? state.name : debtor.address.state;
      }
      if (reportColumn.includes('country')) {
        debtor.country = debtor.address.country.name;
      }
      if (reportColumn.includes('postCode')) {
        debtor.postCode = debtor.address.postCode;
      }
      if (reportColumn.includes('fullAddress')) {
        debtor.fullAddress = getDebtorFullAddress({
          address: debtor.address,
          country: debtor.address.country,
        });
      }
      if (debtor.entityType) {
        debtor.entityType = formatString(debtor.entityType);
      }
      if (isInsurerNameSelected) {
        debtor.insurerId =
          clientNameMap[debtor._id]['insurerId']?.join(', ') || '';
      }
      if (isClientNameSelected) {
        debtor.clientId =
          clientNameMap[debtor._id]['clientId']?.join(', ') || '';
      }
      delete debtor.address;
      delete debtor.id;
    });
    return { response, total, filterArray };
  } catch (e) {
    Logger.log.error('Error occurred in get review report');
    Logger.log.error(e);
  }
};

const getUsageReport = async ({
  hasFullAccess = false,
  userId,
  reportColumn,
  requestedQuery,
  isForDownload = false,
}) => {
  try {
    let queryFilter = {
      isDeleted: false,
    };

    const query = [];
    query.push({ $sort: { 'name': 1 } });
    const filterArray = [];
    if (requestedQuery.clientIds) {
      const clientIds = requestedQuery.clientIds
        .split(',')
        .map((id) => mongoose.Types.ObjectId(id));
      queryFilter._id = { $in: clientIds };
      if (isForDownload) {
        const clients = await Client.find({ _id: { $in: clientIds } })
          .select('name')
          .lean();
        filterArray.push({
          label: 'Client',
          value: clients
            .map((i) => i.name)
            .toString()
            .replace(/,/g, ', '),
          type: 'string',
        });
      }
    } else if (!hasFullAccess) {
      queryFilter = Object.assign({}, queryFilter, {
        $or: [
          { riskAnalystId: mongoose.Types.ObjectId(userId) },
          { serviceManagerId: mongoose.Types.ObjectId(userId) },
        ],
      });
    }

    if (reportColumn.includes('insurerId') || requestedQuery.insurerId) {
      query.push({
        $lookup: {
          from: 'insurers',
          localField: 'insurerId',
          foreignField: '_id',
          as: 'insurerId',
        },
      });
    }
    if (requestedQuery.insurerId) {
      query.push({
        $match: {
          'insurerId._id': mongoose.Types.ObjectId(requestedQuery.insurerId),
        },
      });
      if (isForDownload) {
        const insurer = await Insurer.findOne({
          _id: requestedQuery.insurerId,
        }).lean();
        filterArray.push({
          label: 'Insurer',
          value: insurer?.name,
          type: 'string',
        });
      }
    }
    if (
      reportColumn.includes('riskAnalystId') ||
      requestedQuery.riskAnalystId
    ) {
      query.push({
        $lookup: {
          from: 'users',
          localField: 'riskAnalystId',
          foreignField: '_id',
          as: 'riskAnalystId',
        },
      });
    }
    if (requestedQuery.riskAnalystId) {
      query.push({
        $match: {
          'riskAnalystId._id': mongoose.Types.ObjectId(
            requestedQuery.riskAnalystId,
          ),
        },
      });
      if (isForDownload) {
        const user = await getUserName({
          userId: requestedQuery.riskAnalystId,
        });
        filterArray.push({
          label: 'User',
          value: user?.name,
          type: 'string',
        });
      }
    }
    if (reportColumn.includes('serviceManagerId')) {
      query.push({
        $lookup: {
          from: 'users',
          localField: 'serviceManagerId',
          foreignField: '_id',
          as: 'serviceManagerId',
        },
      });
    }
    if (requestedQuery.serviceManagerId) {
      query.push({
        $match: {
          'serviceManagerId._id': mongoose.Types.ObjectId(
            requestedQuery.serviceManagerId,
          ),
        },
      });
      if (isForDownload) {
        const user = await getUserName({
          userId: requestedQuery.serviceManagerId,
        });
        filterArray.push({
          label: 'User',
          value: user?.name,
          type: 'string',
        });
      }
    }
    const fields = reportColumn.map((i) => {
      if (
        i === 'serviceManagerId' ||
        i === 'riskAnalystId' ||
        i === 'insurerId'
      ) {
        i = i + '.name';
      }
      return [i, 1];
    });
    query.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });
    if (requestedQuery.page && requestedQuery.limit) {
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
    }
    query.unshift({ $match: queryFilter });
    const clients = await Client.aggregate(query).allowDiskUse(true);
    const response =
      clients && clients[0] && clients[0]['paginatedResult']
        ? clients[0]['paginatedResult']
        : clients;
    const total =
      clients.length !== 0 &&
      clients[0]['totalCount'] &&
      clients[0]['totalCount'].length !== 0
        ? clients[0]['totalCount'][0]['count']
        : 0;
    const policies = {};
    const creditCheckApplications = {};
    const nzCreditCheckApplications = {};
    const healthCheckApplications = {};
    const alertApplications = {};
    if (
      reportColumn.includes('policyNumber') ||
      reportColumn.includes('creditChecks') ||
      reportColumn.includes('nzCreditChecks') ||
      reportColumn.includes('healthChecks') ||
      reportColumn.includes('alerts247') ||
      reportColumn.includes('inceptionDate') ||
      reportColumn.includes('expiryDate') ||
      reportColumn.includes('creditChecksUsed') ||
      reportColumn.includes('nzCreditChecksUsed') ||
      reportColumn.includes('healthChecksUsed') ||
      reportColumn.includes('alerts247Used')
    ) {
      const clientIds = response.map((i) => i._id);
      const [ciPolicy, rmpPolicy] = await Promise.all([
        Policy.find({
          clientId: { $in: clientIds },
          product: { $regex: '.*Credit Insurance.*' },
          inceptionDate: { $lte: new Date() },
          expiryDate: { $gt: new Date() },
        })
          .select(
            '_id clientId product policyNumber creditChecks alerts247 healthChecks nzCreditChecks inceptionDate expiryDate',
          )
          .lean(),
        Policy.find({
          clientId: { $in: clientIds },
          $or: [
            { product: { $regex: '.*Risk Management Package.*' } },
            { product: { $regex: '.*Risk Management.*' } },
          ],
          inceptionDate: { $lte: new Date() },
          expiryDate: { $gt: new Date() },
        })
          .select(
            '_id clientId product policyNumber creditChecks alerts247 healthChecks nzCreditChecks inceptionDate expiryDate',
          )
          .lean(),
      ]);
      ciPolicy.forEach((policy) => {
        policies[policy.clientId] = policy;
      });
      rmpPolicy.forEach((policy) => {
        if (policies[policy.clientId]) {
          policies[policy.clientId]['creditChecks'] = policy['creditChecks']
            ? policy['creditChecks']
            : policies[policy.clientId]['creditChecks'];
          policies[policy.clientId]['alerts247'] = policy['alerts247']
            ? policy['alerts247']
            : policies[policy.clientId]['alerts247'];
          policies[policy.clientId]['healthChecks'] = policy['healthChecks']
            ? policy['healthChecks']
            : policies[policy.clientId]['healthChecks'];
          policies[policy.clientId]['nzCreditChecks'] = policy['nzCreditChecks']
            ? policy['nzCreditChecks']
            : policies[policy.clientId]['nzCreditChecks'];
          if (policy['policyNumber']) {
            policies[policy.clientId]['otherPolicyNumber'] =
              policy['policyNumber'];
          }
        } else {
          policies[policy.clientId] = policy;
        }
      });
      if (
        reportColumn.includes('creditChecksUsed') ||
        reportColumn.includes('nzCreditChecksUsed') ||
        reportColumn.includes('healthChecksUsed') ||
        reportColumn.includes('alerts247Used')
      ) {
        const creditCheckPromises = [];
        const nzCreditCheckPromises = [];
        const healthCheckPromises = [];
        const alert247Promises = [];
        if (reportColumn.includes('creditChecksUsed')) {
          rmpPolicy.map((i) => {
            creditCheckPromises.push(
              Application.aggregate([
                {
                  $match: {
                    clientId: i.clientId,
                    status: {
                      $nin: ['DRAFT'],
                    },
                    requestDate: {
                      $gte: new Date(i.inceptionDate),
                      $lte: new Date(i.expiryDate),
                    },
                    limitType: { $eq: 'CREDIT_CHECK' },
                  },
                },
                {
                  $group: {
                    _id: '$clientId',
                    count: { $sum: 1 },
                  },
                },
              ]).allowDiskUse(true),
            );
          });
        }
        if (reportColumn.includes('nzCreditChecksUsed')) {
          rmpPolicy.map((i) => {
            nzCreditCheckPromises.push(
              Application.aggregate([
                {
                  $match: {
                    clientId: i.clientId,
                    status: {
                      $nin: ['DRAFT'],
                    },
                    requestDate: {
                      $gte: new Date(i.inceptionDate),
                      $lte: new Date(i.expiryDate),
                    },
                    limitType: { $eq: 'CREDIT_CHECK_NZ' },
                  },
                },
                {
                  $group: {
                    _id: '$clientId',
                    count: { $sum: 1 },
                  },
                },
              ]).allowDiskUse(true),
            );
          });
        }
        if (reportColumn.includes('healthChecksUsed')) {
          rmpPolicy.map((i) => {
            healthCheckPromises.push(
              Application.aggregate([
                {
                  $match: {
                    clientId: i.clientId,
                    status: {
                      $nin: ['DRAFT'],
                    },
                    requestDate: {
                      $gte: new Date(i.inceptionDate),
                      $lte: new Date(i.expiryDate),
                    },
                    limitType: { $eq: 'HEALTH_CHECK' },
                  },
                },
                {
                  $group: {
                    _id: '$clientId',
                    count: { $sum: 1 },
                  },
                },
              ]).allowDiskUse(true),
            );
          });
        }
        if (reportColumn.includes('alerts247Used')) {
          rmpPolicy.map((i) => {
            alert247Promises.push(
              Application.aggregate([
                {
                  $match: {
                    clientId: i.clientId,
                    status: {
                      $nin: ['DRAFT'],
                    },
                    requestDate: {
                      $gte: new Date(i.inceptionDate),
                      $lte: new Date(i.expiryDate),
                    },
                    limitType: { $eq: '247_ALERT' },
                  },
                },
                {
                  $group: {
                    _id: '$clientId',
                    count: { $sum: 1 },
                  },
                },
              ]).allowDiskUse(true),
            );
          });
        }

        const [
          creditCheckApps,
          nzCreditCheckApps,
          healthCheckApps,
          alert247Apps,
        ] = await Promise.all([
          Promise.all(creditCheckPromises),
          Promise.all(nzCreditCheckPromises),
          Promise.all(healthCheckPromises),
          Promise.all(alert247Promises),
        ]);

        creditCheckApps.forEach((i) => {
          if (Array.isArray(i) && i[0]) {
            creditCheckApplications[i[0]._id] = i[0].count;
          }
        });
        nzCreditCheckApps.forEach((i) => {
          if (Array.isArray(i) && i[0]) {
            nzCreditCheckApplications[i[0]._id] = i[0].count;
          }
        });
        healthCheckApps.forEach((i) => {
          if (Array.isArray(i) && i[0]) {
            healthCheckApplications[i[0]._id] = i[0].count;
          }
        });
        alert247Apps.forEach((i) => {
          if (Array.isArray(i) && i[0]) {
            alertApplications[i[0]._id] = i[0].count;
          }
        });
      }
    }
    const isPolicyNumberSelected = reportColumn.includes('policyNumber');
    const isCreditChecksSelected = reportColumn.includes('creditChecks');
    const isCreditChecksUsedSelected = reportColumn.includes(
      'creditChecksUsed',
    );
    const isNZCreditChecksUsedSelected = reportColumn.includes(
      'nzCreditChecksUsed',
    );
    const isHealthChecksUsedSelected = reportColumn.includes(
      'healthChecksUsed',
    );
    const isAlertUsedSelected = reportColumn.includes('alerts247Used');
    const isInceptionDateSelected = reportColumn.includes('inceptionDate');
    const isExpiryDateSelected = reportColumn.includes('expiryDate');
    const isCreditCheckNZ = reportColumn.includes('nzCreditChecks');
    const isHealthChecks = reportColumn.includes('healthChecks');
    const isAlerts247 = reportColumn.includes('alerts247');
    response.forEach((client) => {
      if (client.insurerId) {
        client.insurerId =
          client.insurerId && client.insurerId[0] && client.insurerId[0]['name']
            ? client.insurerId[0]['name']
            : '';
      }
      if (client.riskAnalystId) {
        client.riskAnalystId =
          client.riskAnalystId &&
          client.riskAnalystId[0] &&
          client.riskAnalystId[0]['name']
            ? client.riskAnalystId[0]['name']
            : '';
      }
      if (client.serviceManagerId) {
        client.serviceManagerId =
          client.serviceManagerId &&
          client.serviceManagerId[0] &&
          client.serviceManagerId[0]['name']
            ? client.serviceManagerId[0]['name']
            : '';
      }
      if (isPolicyNumberSelected) {
        client.policyNumber =
          policies[client._id] && policies[client._id]['policyNumber']
            ? policies[client._id]['policyNumber']
            : '';
        if (policies[client._id] && policies[client._id]['otherPolicyNumber']) {
          client.policyNumber = client.policyNumber
            ? client.policyNumber +
              ', ' +
              policies[client._id]['otherPolicyNumber']
            : policies[client._id]['otherPolicyNumber'];
        }
      }
      if (isCreditChecksSelected) {
        client.creditChecks =
          policies[client._id] && policies[client._id]['creditChecks']
            ? policies[client._id]['creditChecks']
            : 0;
      }
      if (isCreditCheckNZ) {
        client.nzCreditChecks =
          policies[client._id] && policies[client._id]['nzCreditChecks']
            ? policies[client._id]['nzCreditChecks']
            : 0;
      }
      if (isHealthChecks) {
        client.healthChecks =
          policies[client._id] && policies[client._id]['healthChecks']
            ? policies[client._id]['healthChecks']
            : 0;
      }
      if (isAlerts247) {
        client.alerts247 =
          policies[client._id] && policies[client._id]['alerts247']
            ? policies[client._id]['alerts247']
            : 0;
      }
      if (isInceptionDateSelected) {
        client.inceptionDate =
          policies[client._id] && policies[client._id]['inceptionDate']
            ? policies[client._id]['inceptionDate']
            : 0;
      }
      if (isExpiryDateSelected) {
        client.expiryDate =
          policies[client._id] && policies[client._id]['expiryDate']
            ? policies[client._id]['expiryDate']
            : 0;
      }
      if (isCreditChecksUsedSelected) {
        client.creditChecksUsed = creditCheckApplications[client._id]
          ? creditCheckApplications[client._id]
          : 0;
      }
      if (isNZCreditChecksUsedSelected) {
        client.nzCreditChecksUsed = nzCreditCheckApplications[client._id]
          ? nzCreditCheckApplications[client._id]
          : 0;
      }
      if (isHealthChecksUsedSelected) {
        client.healthChecksUsed = healthCheckApplications[client._id]
          ? healthCheckApplications[client._id]
          : 0;
      }
      if (isAlertUsedSelected) {
        client.alerts247Used = alertApplications[client._id]
          ? alertApplications[client._id]
          : 0;
      }
    });
    return { response, total, filterArray };
  } catch (e) {
    Logger.log.error('Error occurred in get client list report');
    Logger.log.error(e.message || e);
  }
};

const getUsagePerClientReport = async ({
  hasFullAccess = false,
  userId,
  reportColumn,
  requestedQuery,
  isForDownload = false,
}) => {
  try {
    const queryFilter = {};
    let query = [];
    const aggregationQuery = [];
    const facetQuery = [];
    const filterArray = [];
    if (requestedQuery.clientIds) {
      const clientIds = requestedQuery.clientIds
        .split(',')
        .map((id) => mongoose.Types.ObjectId(id));
      queryFilter.clientId = { $in: clientIds };
      if (isForDownload) {
        const clients = await Client.find({ _id: { $in: clientIds } })
          .select('name')
          .lean();
        filterArray.push({
          label: 'Client',
          value: clients
            .map((i) => i.name)
            .toString()
            .replace(/,/g, ', '),
          type: 'string',
        });
      }
    } else if (!hasFullAccess) {
      const clients = await Client.find({
        isDeleted: false,
        $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
      })
        .select('_id')
        .lean();
      const clientIds = clients.map((i) => i._id);
      queryFilter.clientId = { $in: clientIds };
    }
    const isApplicationCountSelected = reportColumn.includes(
      'applicationCount',
    );
    if (
      reportColumn.includes('clientId') ||
      reportColumn.includes('insurerId')
    ) {
      facetQuery.push({
        $lookup: {
          from: 'clients',
          localField: 'clientId',
          foreignField: '_id',
          as: 'clientId',
        },
      });
    }
    if (reportColumn.includes('insurerId')) {
      facetQuery.push({
        $lookup: {
          from: 'insurers',
          localField: 'clientId.insurerId',
          foreignField: '_id',
          as: 'insurerId',
        },
      });
    }
    if (
      reportColumn.includes('debtorId') ||
      reportColumn.includes('abn') ||
      reportColumn.includes('acn') ||
      reportColumn.includes('registrationNumber') ||
      reportColumn.includes('entityType') ||
      reportColumn.includes('country')
    ) {
      facetQuery.push({
        $lookup: {
          from: 'debtors',
          localField: 'debtorId',
          foreignField: '_id',
          as: 'debtorId',
        },
      });
    }

    aggregationQuery.push({ $match: queryFilter });

    if (
      reportColumn.includes('applicationId') ||
      reportColumn.includes('status') ||
      reportColumn.includes('requestedAmount') ||
      reportColumn.includes('acceptedAmount') ||
      reportColumn.includes('approvalOrDecliningDate') ||
      reportColumn.includes('expiryDate') ||
      reportColumn.includes('comments') ||
      reportColumn.includes('clientReference') ||
      reportColumn.includes('limitType') ||
      requestedQuery.limitType
    ) {
      reportColumn.push('activeApplicationId');
      aggregationQuery.push({
        $lookup: {
          from: 'applications',
          localField: 'activeApplicationId',
          foreignField: '_id',
          as: 'activeApplicationId',
        },
      });

      if (requestedQuery.startDate || requestedQuery.endDate) {
        if (requestedQuery.startDate && requestedQuery.endDate)
          aggregationQuery.push({
            $match: {
              'activeApplicationId.approvalOrDecliningDate': {
                $gte: new Date(requestedQuery.startDate),
                $lte: new Date(requestedQuery.endDate),
              },
            },
          });
        else if (requestedQuery.startDate)
          aggregationQuery.push({
            $match: {
              'activeApplicationId.approvalOrDecliningDate': {
                $gte: new Date(requestedQuery.startDate),
              },
            },
          });
        else if (requestedQuery.endDate)
          aggregationQuery.push({
            $match: {
              'activeApplicationId.approvalOrDecliningDate': {
                $lte: new Date(requestedQuery.endDate),
              },
            },
          });
      }
      if (requestedQuery.limitType) {
        aggregationQuery.push({
          $match: {
            'activeApplicationId.limitType': {
              $in: requestedQuery.limitType.split(','),
            },
          },
        });
        if (isForDownload) {
          filterArray.push({
            label: 'Limit Type',
            value: requestedQuery.limitType,
            type: 'string',
          });
        }
      }
    }

    const fields = reportColumn.map((i) => {
      if (i === 'clientId' || i === 'insurerId') {
        i = i + '.name';
      }
      if (i === 'debtorId') {
        i = i + '.entityName';
      }
      if (
        i === 'abn' ||
        i === 'acn' ||
        i === 'registrationNumber' ||
        i === 'entityType'
      ) {
        i = 'debtorId.' + i;
      }
      if (i === 'country') {
        i = 'debtorId.address.' + i;
      }
      if (i === 'applicationCount') {
        i = '_id';
      }
      if (i === 'creditLimitStatus') {
        i = 'status';
      }
      return [i, 1];
    });
    facetQuery.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });
    query.push(...aggregationQuery);
    if (requestedQuery.page && requestedQuery.limit) {
      query.push({
        $facet: {
          paginatedResult: [
            {
              $skip:
                (parseInt(requestedQuery.page) - 1) *
                parseInt(requestedQuery.limit),
            },
            { $limit: parseInt(requestedQuery.limit) },
            ...facetQuery,
          ],
          totalCount: [
            {
              $count: 'count',
            },
          ],
        },
      });
    } else if (facetQuery.length !== 0) {
      query = query.concat(facetQuery);
    }

    const clientDebtors = await ClientDebtor.aggregate(query).allowDiskUse(
      true,
    );
    const response =
      clientDebtors && clientDebtors[0] && clientDebtors[0]['paginatedResult']
        ? clientDebtors[0]['paginatedResult']
        : clientDebtors;
    const applicationCounts = {};
    if (isApplicationCountSelected) {
      const promises = [];
      const clientDebtorIds = response.map((i) => i._id);
      response.map((i) => {});
      promises.push(
        Application.aggregate([
          {
            $match: {
              clientDebtorId: { $in: clientDebtorIds },
              status: {
                $nin: ['DRAFT'],
              },
            },
          },
          {
            $group: {
              _id: '$clientDebtorId',
              count: { $sum: 1 },
            },
          },
        ]).allowDiskUse(true),
      );
      const applications = await Promise.all(promises);
      applications?.[0].forEach((i) => {
        // if (Array.isArray(i) && i[0]) {
        applicationCounts[i._id] = i.count;
        // }
      });
    }
    const total =
      clientDebtors.length !== 0 &&
      clientDebtors[0]['totalCount'] &&
      clientDebtors[0]['totalCount'].length !== 0
        ? clientDebtors[0]['totalCount'][0]['count']
        : 0;
    const isCreditLimitSelected = reportColumn.includes('creditLimit');
    response.forEach((limit) => {
      if (limit.insurerId) {
        limit.insurerId =
          limit.insurerId && limit.insurerId[0] && limit.insurerId[0]['name']
            ? limit.insurerId[0]['name']
            : '';
      }
      if (limit.clientId) {
        limit.clientId =
          limit.clientId && limit.clientId[0] && limit.clientId[0]['name']
            ? limit.clientId[0]['name']
            : '';
      }
      if (limit.debtorId && limit.debtorId[0] && limit.debtorId[0].abn) {
        limit.abn = limit.debtorId[0]['abn'] ? limit.debtorId[0]['abn'] : '';
      }
      if (limit.debtorId && limit.debtorId[0] && limit.debtorId[0].acn) {
        limit.acn = limit.debtorId[0]['acn'] ? limit.debtorId[0]['acn'] : '';
      }
      if (
        limit.debtorId &&
        limit.debtorId[0] &&
        limit.debtorId[0].registrationNumber
      ) {
        limit.registrationNumber = limit.debtorId[0]['registrationNumber']
          ? limit.debtorId[0]['registrationNumber']
          : '';
      }
      if (limit.debtorId && limit.debtorId[0] && limit.debtorId[0].entityType) {
        limit.entityType = limit.debtorId[0]['entityType']
          ? formatString(limit.debtorId[0]['entityType'])
          : '';
      }
      if (limit.debtorId && limit.debtorId[0] && limit.debtorId[0].address) {
        limit.country =
          limit.debtorId[0]['address']['country'] &&
          limit.debtorId[0]['address']['country']['name']
            ? limit.debtorId[0]['address']['country']['name']
            : '';
      }
      if (limit.debtorId && limit.debtorId[0]) {
        limit.debtorId = limit.debtorId[0]['entityName']
          ? limit.debtorId[0]['entityName']
          : '';
      }
      if (limit.hasOwnProperty('status')) {
        limit.creditLimitStatus =
          limit.status === 'APPROVED' ? 'Active' : 'Inactive';
      }
      if (limit?.activeApplicationId?.[0]?.applicationId) {
        limit.applicationId =
          limit?.activeApplicationId[0]?.applicationId || '';
      }
      if (limit?.activeApplicationId?.[0]?.creditLimit) {
        limit.requestedAmount =
          limit?.activeApplicationId[0]?.creditLimit || '';
      }
      if (limit?.activeApplicationId?.[0]?.status) {
        limit.status =
          formatString(limit?.activeApplicationId[0]?.status) || '';
      }
      if (limit?.activeApplicationId?.[0]?.acceptedAmount) {
        limit.acceptedAmount =
          limit?.activeApplicationId[0]?.acceptedAmount || '';
      }
      if (limit?.activeApplicationId?.[0]?.approvalOrDecliningDate) {
        limit.approvalOrDecliningDate =
          limit?.activeApplicationId[0]?.approvalOrDecliningDate || '';
      }
      if (limit?.activeApplicationId?.[0]?.expiryDate) {
        limit.expiryDate = limit?.activeApplicationId[0]?.expiryDate || '';
      }
      if (limit?.activeApplicationId?.[0]?.limitType) {
        limit.limitType =
          getLimitType(limit.activeApplicationId[0].limitType) || '';
      }
      if (limit?.activeApplicationId?.[0]?.clientReference) {
        limit.clientReference =
          limit?.activeApplicationId[0]?.clientReference || '';
      }
      if (limit?.activeApplicationId?.[0]?.comments) {
        limit.comments = limit?.activeApplicationId[0]?.comments || '';
      }
      if (isCreditLimitSelected) {
        limit.creditLimit = limit.creditLimit ? limit.creditLimit : 0;
      }
      if (isApplicationCountSelected) {
        limit.applicationCount = applicationCounts[limit._id]
          ? applicationCounts[limit._id]
          : 0;
      }
      delete limit.activeApplicationId;
    });
    return { response, total, filterArray };
  } catch (e) {
    Logger.log.error('Error occurred in get usage per client report');
    Logger.log.error(e);
  }
};

const getLimitHistoryReport = async ({
  hasFullAccess = false,
  userId,
  reportColumn,
  requestedQuery,
  isForDownload = false,
}) => {
  try {
    const queryFilter = {};
    let query = [];
    const facetQuery = [];
    const filterArray = [];
    if (requestedQuery.clientIds) {
      const clientIds = requestedQuery.clientIds
        .split(',')
        .map((id) => mongoose.Types.ObjectId(id));
      queryFilter.clientId = { $in: clientIds };
      if (isForDownload) {
        const clients = await Client.find({ _id: { $in: clientIds } })
          .select('name')
          .lean();
        filterArray.push({
          label: 'Client',
          value: clients
            .map((i) => i.name)
            .toString()
            .replace(/,/g, ', '),
          type: 'string',
        });
      }
    } else if (!hasFullAccess) {
      const clients = await Client.find({
        isDeleted: false,
        $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
      })
        .select('_id')
        .lean();
      const clientIds = clients.map((i) => i._id);
      queryFilter.clientId = { $in: clientIds };
    }
    if (requestedQuery.limitType) {
      queryFilter.limitType = { $in: requestedQuery.limitType.split(',') };
      if (isForDownload) {
        filterArray.push({
          label: 'Limit Type',
          value: requestedQuery.limitType.split(','),
          type: 'string',
        });
      }
    }
    if (requestedQuery.debtorId) {
      queryFilter.debtorId = mongoose.Types.ObjectId(requestedQuery.debtorId);
      if (isForDownload) {
        const debtor = await Debtor.findOne({ _id: requestedQuery.debtorId })
          .select('entityName')
          .lean();
        filterArray.push({
          label: 'Debtor',
          value: debtor && debtor?.entityName ? debtor.entityName : '',
          type: 'string',
        });
      }
    }
    if (requestedQuery.startDate || requestedQuery.endDate) {
      let dateQuery = {};
      if (requestedQuery.startDate) {
        dateQuery = {
          $gte: new Date(requestedQuery.startDate),
        };
        if (isForDownload) {
          filterArray.push({
            label: 'Start Date',
            value: requestedQuery.startDate,
            type: 'date',
          });
        }
      }
      if (requestedQuery.endDate) {
        dateQuery = Object.assign({}, dateQuery, {
          $lte: new Date(requestedQuery.endDate),
        });
        if (isForDownload) {
          filterArray.push({
            label: 'End Date',
            value: requestedQuery.endDate,
            type: 'date',
          });
        }
      }
      queryFilter.expiryDate = dateQuery;
    }
    if (
      reportColumn.includes('clientId') ||
      reportColumn.includes('insurerId')
    ) {
      facetQuery.push({
        $lookup: {
          from: 'clients',
          localField: 'clientId',
          foreignField: '_id',
          as: 'clientId',
        },
      });
    }

    if (reportColumn.includes('insurerId')) {
      facetQuery.push({
        $lookup: {
          from: 'insurers',
          localField: 'clientId.insurerId',
          foreignField: '_id',
          as: 'insurerId',
        },
      });
    }

    if (
      reportColumn.includes('debtorId') ||
      reportColumn.includes('entityType') ||
      reportColumn.includes('abn') ||
      reportColumn.includes('acn') ||
      reportColumn.includes('registrationNumber') ||
      reportColumn.includes('country')
    ) {
      facetQuery.push({
        $lookup: {
          from: 'debtors',
          localField: 'debtorId',
          foreignField: '_id',
          as: 'debtorId',
        },
      });
    }

    const fields = reportColumn.map((i) => {
      if (i === 'clientId' || i === 'insurerId') {
        i = i + '.name';
      }
      if (i === 'debtorId') {
        i = i + '.entityName';
      }
      if (
        i === 'abn' ||
        i === 'acn' ||
        i === 'registrationNumber' ||
        i === 'entityType'
      ) {
        i = 'debtorId.' + i;
      }
      if (i === 'country') {
        i = 'debtorId.address.' + i;
      }
      return [i, 1];
    });
    facetQuery.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });
    if (requestedQuery.page && requestedQuery.limit) {
      query.push({
        $facet: {
          paginatedResult: [
            {
              $skip:
                (parseInt(requestedQuery.page) - 1) *
                parseInt(requestedQuery.limit),
            },
            { $limit: parseInt(requestedQuery.limit) },
            ...facetQuery,
          ],
          totalCount: [
            {
              $count: 'count',
            },
          ],
        },
      });
    } else if (facetQuery.length !== 0) {
      query = query.concat(facetQuery);
    }
    query.unshift({ $match: queryFilter });
    const applications = await Application.aggregate(query).allowDiskUse(true);
    const response =
      applications && applications[0] && applications[0]['paginatedResult']
        ? applications[0]['paginatedResult']
        : applications;
    const total =
      applications.length !== 0 &&
      applications[0]['totalCount'] &&
      applications[0]['totalCount'].length !== 0
        ? applications[0]['totalCount'][0]['count']
        : 0;
    response.forEach((limit) => {
      if (limit.insurerId) {
        limit.insurerId =
          limit.insurerId && limit.insurerId[0] && limit.insurerId[0]['name']
            ? limit.insurerId[0]['name']
            : '';
      }
      if (limit.clientId) {
        limit.clientId =
          limit.clientId && limit.clientId[0] && limit.clientId[0]['name']
            ? limit.clientId[0]['name']
            : '';
      }
      if (limit.debtorId && limit.debtorId[0] && limit.debtorId[0].abn) {
        limit.abn = limit.debtorId[0]['abn'] ? limit.debtorId[0]['abn'] : '';
      }
      if (limit.debtorId && limit.debtorId[0] && limit.debtorId[0].acn) {
        limit.acn = limit.debtorId[0]['acn'] ? limit.debtorId[0]['acn'] : '';
      }
      if (
        limit.debtorId &&
        limit.debtorId[0] &&
        limit.debtorId[0].registrationNumber
      ) {
        limit.registrationNumber = limit.debtorId[0]['registrationNumber']
          ? limit.debtorId[0]['registrationNumber']
          : '';
      }
      if (limit.debtorId && limit.debtorId[0] && limit.debtorId[0].address) {
        limit.country =
          limit.debtorId[0]['address']['country'] &&
          limit.debtorId[0]['address']['country']['name']
            ? limit.debtorId[0]['address']['country']['name']
            : '';
      }
      if (limit.debtorId && limit.debtorId[0] && limit.debtorId[0].entityType) {
        limit.entityType = limit.debtorId[0]['entityType']
          ? formatString(limit.debtorId[0]['entityType'])
          : '';
      }
      limit.debtorId =
        limit.debtorId && limit.debtorId[0] && limit.debtorId[0]['entityName']
          ? limit.debtorId[0]['entityName']
          : '';
      if (limit.status) {
        limit.status = formatString(limit.status);
      }
      if (limit.limitType) {
        limit.limitType = getLimitType(limit?.limitType) || '';
      }
    });
    return { response, total, filterArray };
  } catch (e) {
    Logger.log.error('Error occurred in get limit history report');
    Logger.log.error(e.message || e);
  }
};

const getClaimsReport = async ({
  hasFullAccess = false,
  userId,
  reportColumn,
  requestedQuery,
}) => {
  try {
    let clientCRMIds = [];
    if (requestedQuery.clientIds) {
      requestedQuery.clientIds = requestedQuery.clientIds.split(',');
      clientCRMIds = requestedQuery.clientIds;
    } else if (!hasFullAccess) {
      const clients = await Client.find({
        isDeleted: false,
        $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
      })
        .select('_id crmClientId')
        .lean();
      clientCRMIds = clients.map((i) => i.crmClientId);
    }
    requestedQuery.page = requestedQuery.page || 1;
    requestedQuery.limit = requestedQuery.limit || 10;
    const { claims, totalCount } = await getClaimsDetails({
      crmIds: clientCRMIds,
      page: requestedQuery.page,
      limit: requestedQuery.limit,
    });

    const response = {};
    if (reportColumn.includes('accountid')) {
      clientCRMIds = claims.map((i) => i.accountid);
      const clients = await Client.find({
        crmClientId: { $in: clientCRMIds },
      })
        .populate({ path: 'insurerId', select: '_id name' })
        .select('_id crmClientId name insurerId sector')
        .lean();
      clients.forEach((client) => {
        response[client.crmClientId] = client;
      });
    }
    const claimsList = [];
    let data = {};
    claims.forEach((claim) => {
      const id = claim['accountid'];
      reportColumn.map((key) => {
        if (key === 'accountid') {
          data[key] =
            response[id] && response[id]['name'] ? response[id]['name'] : '';
        } else {
          data[key] = claim[key];
        }
      });
      claimsList.push(data);
    });

    return { response: claimsList, total: totalCount };
  } catch (e) {
    Logger.log.error('Error occurred in get claim report');
    Logger.log.error(e.message || e);
  }
};

const getAlertReport = async ({
  hasFullAccess = false,
  userId,
  reportColumn,
  requestedQuery,
  isForDownload = false,
}) => {
  try {
    const queryFilter = {};
    let query = [];
    query.push({ $sort: {'alertDate': -1}});
    const facetQuery = [];
    let creditLimits;
    let debtorProject = {};
    const clientRequestQuery = {
      isDeleted: false,
    };
    const mapClientNames = {};
    const filterArray = [];

    reportColumn.push('alertId');
    const isDescriptionFieldSelected = reportColumn.includes('description');
    const isClientFieldSelected = reportColumn.includes('clientName');
    const isABNFieldSelected = reportColumn.includes('abn');
    const isACNFieldSelected = reportColumn.includes('acn');
    const isDebtorFieldSelected = reportColumn.includes('debtorName');

    if (
      requestedQuery.clientIds ||
      !hasFullAccess ||
      reportColumn.includes('clientName')
    ) {
      let clientIds = [];
      if (requestedQuery.clientIds) {
        clientIds = requestedQuery.clientIds
          .split(',')
          .map((id) => mongoose.Types.ObjectId(id));
        clientRequestQuery._id = { $in: clientIds };
      } else {
        const clientQuery = {
          isDeleted: false,
        };
        if (!hasFullAccess) {
          clientQuery['$or'] = [
            { riskAnalystId: userId },
            { serviceManagerId: userId },
          ];
        }
        const clients = await Client.find(clientQuery).select('_id').lean();
        clientIds = clients.map((i) => i._id);
      }
      creditLimits = await ClientDebtor.find({ clientId: { $in: clientIds } })
        .select('debtorId clientId')
        .populate({ path: 'clientId', select: '_id name' })
        .lean();
      const debtorIds = creditLimits.map((i) => i.debtorId);
      queryFilter.entityId = { $in: debtorIds };

      creditLimits.forEach((creditLimit) => {
        if (!mapClientNames[creditLimit.debtorId]) {
          mapClientNames[creditLimit.debtorId] = [];
        }
        mapClientNames[creditLimit.debtorId].push(creditLimit.clientId?.name);
      });
    }

    let dateQuery = {};
    if (requestedQuery.startDate || requestedQuery.endDate) {
      if (requestedQuery.startDate) {
        dateQuery = {
          $gte: new Date(requestedQuery.startDate),
        };
      }
      if (requestedQuery.endDate) {
        dateQuery = Object.assign({}, dateQuery, {
          $lte: new Date(requestedQuery.endDate),
        });
      }
      queryFilter.alertDate = dateQuery;
    }

    if (requestedQuery.alertPriority) {
      queryFilter.alertPriority = requestedQuery.alertPriority;
    }
    if (requestedQuery.alertType) {
      queryFilter.alertType = requestedQuery.alertType;
    }

    const fields = reportColumn.map((i) => {
      /*if (i === 'debtorName') {
        i = 'debtorDetails.entityName';
      }
      if (i === 'abn' || i === 'acn') {
        i = 'debtorDetails.' + i;
      }*/
      return [i, 1];
    });

    if (
      reportColumn.includes('debtorName') ||
      reportColumn.includes('abn') ||
      reportColumn.includes('acn') ||
      reportColumn.includes('clientName')
    ) {
      facetQuery.push(
        {
          $lookup: {
            from: 'debtors',
            localField: 'entityId',
            foreignField: '_id',
            as: 'debtor',
          },
        },
        {
          $lookup: {
            from: 'debtor-directors',
            localField: 'entityId',
            foreignField: 'debtorId',
            as: 'debtorDirector',
          },
        },
        {
          $lookup: {
            from: 'debtors',
            localField: 'debtorDirector.debtorId',
            foreignField: '_id',
            as: 'debtorOfDirector',
          },
        },
        {
          $unwind: {
            path: '$debtor',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: '$debtorOfDirector',
            preserveNullAndEmptyArrays: true,
          },
        },
      );
      /*fields.unshift({debtorDetails: {
          $cond: { if: { $eq: [ "$entityType", 'debtor-director' ] }, then: "$debtorOfDirector", else: "$debtor" }

        }})*/
      debtorProject = {
        debtorDetails: {
          $cond: {
            if: { $eq: ['$entityType', 'debtor-director'] },
            then: '$debtorOfDirector',
            else: '$debtor',
          },
        },
      };
      // fields.push(['debtorDetails._id',1])
    }

    const projectFields = fields.reduce((obj, [key, val]) => {
      obj[key] = val;
      return obj;
    }, {});
    facetQuery.push({
      $project: { ...debtorProject, ...projectFields },
    });

    if (requestedQuery.page && requestedQuery.limit) {
      query.push({
        $facet: {
          paginatedResult: [
            {
              $skip:
                (parseInt(requestedQuery.page) - 1) *
                parseInt(requestedQuery.limit),
            },
            { $limit: parseInt(requestedQuery.limit) },
            ...facetQuery,
          ],
          totalCount: [
            {
              $count: 'count',
            },
          ],
        },
      });
    } else {
      query.push({
        $facet: {
          paginatedResult: [
            ...facetQuery,
          ],
        },
      });
    }
    query.unshift({ $match: queryFilter });
    const alerts = await Alert.aggregate(query).allowDiskUse(true);
    const response =
      alerts && alerts[0] && alerts[0]['paginatedResult']
        ? alerts[0]['paginatedResult']
        : alerts;
    const total =
      alerts.length !== 0 &&
      alerts[0]['totalCount'] &&
      alerts[0]['totalCount'].length !== 0
        ? alerts[0]['totalCount'][0]['count']
        : 0;
    response.forEach((alert) => {
      if (isDescriptionFieldSelected) {
        alert.description = StaticData.AlertList[alert.alertId].description;
      }
      if (isClientFieldSelected) {
        if (alert.entityId) {
          alert.clientName = mapClientNames[alert.entityId]?.join(', ') || '';
        } else {
          alert.clientName =
            mapClientNames[alert.debtorDetails?._id]?.join(', ') || '';
        }
      }
      if (isABNFieldSelected) {
        alert.abn = alert.debtorDetails?.abn;
      }
      if (isACNFieldSelected) {
        alert.acn = alert.debtorDetails?.acn;
      }
      if (isDebtorFieldSelected) {
        if (alert.companyName) {
          alert.debtorName = alert.companyName;
        } else {
          alert.debtorName = alert.debtorDetails?.entityName;
        }
      }
      delete alert.alertId;
      delete alert.debtorDetails;
    });
    return { response, total, filterArray };
  } catch (e) {
    Logger.log.error('Error occurred in get alert report');
    Logger.log.error(e.message || e);
  }
};

const numberWithCommas = (number) => {
  return number?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

module.exports = {
  getClientListReport,
  getLimitListReport,
  getPendingApplicationReport,
  getReviewReport,
  getUsageReport,
  getUsagePerClientReport,
  getLimitHistoryReport,
  getClaimsReport,
  numberWithCommas,
  getAlertReport,
};

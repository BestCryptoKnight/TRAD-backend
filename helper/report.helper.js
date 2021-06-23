/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Client = mongoose.model('client');
const Policy = mongoose.model('policy');
const Application = mongoose.model('application');
const ClientDebtor = mongoose.model('client-debtor');
const Debtor = mongoose.model('debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { formatString } = require('./overdue.helper');
const { getClaimsDetails } = require('./rss.helper');

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
    const query = [];
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
    }
    if (
      reportColumn.includes('serviceManagerId') ||
      requestedQuery.serviceManagerId
    ) {
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
          $lt: new Date(requestedQuery.inceptionEndDate),
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
          $lt: new Date(requestedQuery.expiryEndDate),
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
    let isRemainingApplicationSelected = false;
    const clientApplications = {};
    if (
      reportColumn.includes('discretionaryLimit') ||
      reportColumn.includes('noOfResChecks') ||
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
            '_id clientId product discretionaryLimit noOfResChecks inceptionDate expiryDate',
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
            '_id clientId product discretionaryLimit noOfResChecks inceptionDate expiryDate',
          )
          .lean(),
      ]);
      ciPolicy.forEach((policy) => {
        policies[policy.clientId] = policy;
      });
      rmpPolicy.forEach((policy) => {
        if (policies[policy.clientId]) {
          policies[policy.clientId]['noOfResChecks'] = policy['noOfResChecks']
            ? policy['noOfResChecks']
            : policies[policy.clientId]['noOfResChecks'];
          policies[policy.clientId]['discretionaryLimit'] = policies[
            policy.clientId
          ]['discretionaryLimit']
            ? policy['discretionaryLimit']
            : policy['discretionaryLimit'];
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
    const isRESChecksSelected = reportColumn.includes('noOfResChecks');
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
      if (isRESChecksSelected) {
        client.noOfResChecks =
          policies[client._id] && policies[client._id]['noOfResChecks']
            ? policies[client._id]['noOfResChecks']
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
          policies[client._id]['noOfResChecks'] &&
          policies[client._id]['noOfResChecks'].length !== 0 &&
          clientApplications[client._id]
            ? parseInt(policies[client._id]['noOfResChecks']) -
                clientApplications[client._id] >=
              0
              ? parseInt(policies[client._id]['noOfResChecks']) -
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
      isActive: true,
      creditLimit: { $exists: true, $ne: null },
    };
    const query = [];
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
          $lt: new Date(requestedQuery.endDate),
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
    if (
      reportColumn.includes('applicationId') ||
      reportColumn.includes('creditLimit') ||
      reportColumn.includes('acceptedAmount') ||
      reportColumn.includes('approvalDate') ||
      reportColumn.includes('expiryDate')
    ) {
      query.push({
        $lookup: {
          from: 'applications',
          localField: 'activeApplicationId',
          foreignField: '_id',
          as: 'activeApplicationId',
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
        i === 'approvalDate' ||
        i === 'expiryDate'
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
    const clientDebtors = await ClientDebtor.aggregate(query).allowDiskUse(
      true,
    );
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
      if (limit.debtorId && limit.debtorId[0] && limit.debtorId[0].entityName) {
        limit.debtorId = limit.debtorId[0]['entityName']
          ? limit.debtorId[0]['entityName']
          : '';
      }
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
        limit.activeApplicationId[0].approvalDate
      ) {
        limit.approvalDate = limit.activeApplicationId[0].approvalDate
          ? limit.activeApplicationId[0].approvalDate
          : '';
      }
      if (
        limit.activeApplicationId &&
        limit.activeApplicationId[0] &&
        limit.activeApplicationId[0].expiryDate
      ) {
        limit.expiryDate = limit.activeApplicationId[0].expiryDate
          ? limit.activeApplicationId[0].expiryDate
          : '';
      }
      delete limit.activeApplicationId;
    });
    return { response, total, filterArray };
  } catch (e) {
    Logger.log.error('Error occurred in get limit list report');
    Logger.log.error(e.message || e);
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
          'PENDING_INSURER_REVIEW',
          'SUBMITTED',
          'UNDER_REVIEW',
          'AWAITING_INFORMATION',
        ],
      },
    };
    const query = [];
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
      const debtor = await Debtor.findOne({ _id: requestedQuery.debtorId })
        .select('entityName')
        .lean();
      if (isForDownload) {
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
          $lt: new Date(requestedQuery.endDate),
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
      if (
        application.debtorId &&
        application.debtorId[0] &&
        application.debtorId[0].entityName
      ) {
        application.debtorId = application.debtorId[0]['entityName']
          ? application.debtorId[0]['entityName']
          : '';
      }
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
}) => {
  try {
    const queryFilter = {
      isActive: true,
      creditLimit: { $exists: true, $ne: null },
    };
    let dateQuery = {};
    if (requestedQuery.date) {
      requestedQuery.date = new Date(requestedQuery.date);
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
      if (requestedQuery.startDate) {
        dateQuery = {
          $gte: new Date(requestedQuery.startDate),
        };
      }
      if (requestedQuery.endDate) {
        dateQuery = Object.assign({}, dateQuery, {
          $lt: new Date(requestedQuery.endDate),
        });
      }
      dateQuery = {
        $gte: firstDay,
        $lte: lastDay,
      };
      // queryFilter.expiryDate = dateQuery;
    } else if (Object.keys(requestedQuery).length === 1) {
      const date = new Date();
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      dateQuery = { $lt: lastDay };
      // queryFilter.expiryDate = dateQuery;
    }
    if (requestedQuery.clientIds) {
      const clientIds = requestedQuery.clientIds
        .split(',')
        .map((id) => mongoose.Types.ObjectId(id));
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
    }
    if (requestedQuery.limitStartDate || requestedQuery.limitEndDate) {
      let dateFilter = {};
      if (requestedQuery.limitStartDate) {
        dateFilter = {
          $gte: new Date(requestedQuery.limitStartDate),
        };
      }
      if (requestedQuery.limitEndDate) {
        dateFilter = Object.assign({}, dateQuery, {
          $lt: new Date(requestedQuery.limitEndDate),
        });
      }
      queryFilter.expiryDate = dateFilter;
    }
    const query = [
      {
        $lookup: {
          from: 'credit-reports',
          localField: 'currentReportId',
          foreignField: '_id',
          as: 'currentReportId',
        },
      },
    ];
    if (Object.keys(dateQuery).length !== 0) {
      query.push({
        $match: {
          $or: [
            { 'currentReportId.expiryDate': dateQuery },
            { expiryDate: dateQuery },
          ],
        },
      });
    }
    if (requestedQuery.reportStartDate || requestedQuery.reportEndDate) {
      let dateFilter = {};
      if (requestedQuery.reportStartDate) {
        dateFilter = {
          $gte: new Date(requestedQuery.reportStartDate),
        };
      }
      if (requestedQuery.reportEndDate) {
        dateFilter = Object.assign({}, dateQuery, {
          $lt: new Date(requestedQuery.reportEndDate),
        });
      }
      query.push({
        $match: {
          'currentReportId.expiryDate': dateFilter,
        },
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
    }
    if (
      reportColumn.includes('requestedCreditLimit') ||
      reportColumn.includes('approvalDate') ||
      reportColumn.includes('applicationExpiryDate')
    ) {
      query.push({
        $lookup: {
          from: 'applications',
          localField: 'activeApplicationId',
          foreignField: '_id',
          as: 'activeApplicationId',
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
      if (i === 'approvalDate') {
        i = 'activeApplicationId.' + i;
      }
      if (i === 'requestedCreditLimit') {
        i = 'activeApplicationId.creditLimit';
      }
      if (i === 'applicationExpiryDate') {
        i = 'activeApplicationId.expiryDate';
      }
      if (i === 'reportExpiryDate') {
        i = 'currentReportId.expiryDate';
      }
      if (i === 'reportName') {
        i = 'currentReportId.name';
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
    const clientDebtors = await ClientDebtor.aggregate(query).allowDiskUse(
      true,
    );
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
      if (limit.debtorId && limit.debtorId[0] && limit.debtorId[0].entityName) {
        limit.debtorId = limit.debtorId[0]['entityName']
          ? limit.debtorId[0]['entityName']
          : '';
      }
      if (
        limit.activeApplicationId &&
        limit.activeApplicationId[0] &&
        limit.activeApplicationId[0].creditLimit
      ) {
        limit.requestedCreditLimit = limit.activeApplicationId[0].creditLimit
          ? limit.activeApplicationId[0].creditLimit
          : '';
      }
      if (
        limit.activeApplicationId &&
        limit.activeApplicationId[0] &&
        limit.activeApplicationId[0].approvalDate
      ) {
        limit.approvalDate = limit.activeApplicationId[0].approvalDate
          ? limit.activeApplicationId[0].approvalDate
          : '';
      }
      if (
        limit.activeApplicationId &&
        limit.activeApplicationId[0] &&
        limit.activeApplicationId[0].expiryDate
      ) {
        limit.applicationExpiryDate = limit.activeApplicationId[0].expiryDate
          ? limit.activeApplicationId[0].expiryDate
          : '';
      }
      if (
        limit.currentReportId &&
        limit.currentReportId[0] &&
        limit.currentReportId[0].name
      ) {
        limit.reportName = limit.currentReportId[0].name
          ? limit.currentReportId[0].name
          : '';
      }
      if (
        limit.currentReportId &&
        limit.currentReportId[0] &&
        limit.currentReportId[0].expiryDate
      ) {
        limit.reportExpiryDate = limit.currentReportId[0].expiryDate
          ? limit.currentReportId[0].expiryDate
          : '';
      }
      delete limit.currentReportId;
      delete limit.activeApplicationId;
    });
    return { response, total };
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
}) => {
  try {
    let queryFilter = {
      isDeleted: false,
    };
    const query = [];
    if (requestedQuery.clientIds) {
      const clientIds = requestedQuery.clientIds
        .split(',')
        .map((id) => mongoose.Types.ObjectId(id));
      queryFilter.clientId = { $in: clientIds };
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
    const clientApplications = {};
    if (
      reportColumn.includes('policyNumber') ||
      reportColumn.includes('noOfResChecks') ||
      reportColumn.includes('inceptionDate') ||
      reportColumn.includes('expiryDate') ||
      reportColumn.includes('noOfResChecksUsed')
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
            '_id clientId product policyNumber noOfResChecks inceptionDate expiryDate',
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
            '_id clientId product policyNumber noOfResChecks inceptionDate expiryDate',
          )
          .lean(),
      ]);
      ciPolicy.forEach((policy) => {
        policies[policy.clientId] = policy;
      });
      rmpPolicy.forEach((policy) => {
        if (policies[policy.clientId]) {
          policies[policy.clientId]['noOfResChecks'] = policy['noOfResChecks']
            ? policy['noOfResChecks']
            : policies[policy.clientId]['noOfResChecks'];
          if (policy['policyNumber']) {
            policies[policy.clientId]['otherPolicyNumber'] =
              policy['policyNumber'];
          }
        } else {
          policies[policy.clientId] = policy;
        }
      });
      if (reportColumn.includes('noOfResChecksUsed')) {
        const promises = [];
        rmpPolicy.map((i) => {
          promises.push(
            Application.aggregate([
              {
                $match: {
                  clientId: i.clientId,
                  status: {
                    $nin: ['DRAFT'],
                  },
                  createdAt: {
                    $gte: new Date(i.inceptionDate),
                    $lte: new Date(i.expiryDate),
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
        });
        const applications = await Promise.all(promises);
        applications.forEach((i) => {
          if (Array.isArray(i) && i[0]) {
            clientApplications[i[0]._id] = i[0].count;
          }
        });
      }
    }
    const isPolicyNumberSelected = reportColumn.includes('policyNumber');
    const isRESChecksSelected = reportColumn.includes('noOfResChecks');
    const isRESChecksUsedSelected = reportColumn.includes('noOfResChecksUsed');
    const isInceptionDateSelected = reportColumn.includes('inceptionDate');
    const isExpiryDateSelected = reportColumn.includes('expiryDate');
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
      if (isRESChecksSelected) {
        client.noOfResChecks =
          policies[client._id] && policies[client._id]['noOfResChecks']
            ? policies[client._id]['noOfResChecks']
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
      if (isRESChecksUsedSelected) {
        client.totalApplication = clientApplications[client._id]
          ? clientApplications[client._id]
          : 0;
      }
    });
    return { response, total };
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
}) => {
  try {
    const queryFilter = {};
    const query = [];
    if (requestedQuery.clientIds) {
      const clientIds = requestedQuery.clientIds
        .split(',')
        .map((id) => mongoose.Types.ObjectId(id));
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
    const isApplicationCountSelected = reportColumn.includes(
      'applicationCount',
    );
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
      reportColumn.includes('entityType') ||
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
      response.forEach((i) => {
        promises.push(
          Application.aggregate([
            {
              $match: {
                clientDebtorId: i._id,
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
      });
      const applications = await Promise.all(promises);
      applications.forEach((i) => {
        if (Array.isArray(i) && i[0]) {
          applicationCounts[i[0]._id] = i[0].count;
        }
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
      if (limit.debtorId && limit.debtorId[0] && limit.debtorId[0].entityName) {
        limit.debtorId = limit.debtorId[0]['entityName']
          ? limit.debtorId[0]['entityName']
          : '';
      }
      if (limit.hasOwnProperty('isActive')) {
        limit.isActive = limit.isActive ? 'Yes' : 'No';
      }
      if (isCreditLimitSelected) {
        limit.creditLimit = limit.creditLimit ? limit.creditLimit : 0;
      }
      if (isApplicationCountSelected) {
        limit.applicationCount = applicationCounts[limit._id]
          ? applicationCounts[limit._id]
          : 0;
      }
    });
    return { response, total };
  } catch (e) {
    Logger.log.error('Error occurred in get limit list report');
    Logger.log.error(e.message || e);
  }
};

const getLimitHistoryReport = async ({
  hasFullAccess = false,
  userId,
  reportColumn,
  requestedQuery,
}) => {
  try {
    const queryFilter = {};
    const query = [];
    if (requestedQuery.clientIds) {
      const clientIds = requestedQuery.clientIds
        .split(',')
        .map((id) => mongoose.Types.ObjectId(id));
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
    }
    if (requestedQuery.startDate || requestedQuery.endDate) {
      let dateQuery = {};
      if (requestedQuery.startDate) {
        dateQuery = {
          $gte: new Date(requestedQuery.startDate),
        };
      }
      if (requestedQuery.endDate) {
        dateQuery = Object.assign({}, dateQuery, {
          $lt: new Date(requestedQuery.endDate),
        });
      }
      queryFilter.expiryDate = dateQuery;
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
      console.log(limit.debtorId);

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
      if (limit.debtorId && limit.debtorId[0] && limit.debtorId[0].entityName) {
        limit.debtorId = limit.debtorId[0]['entityName']
          ? limit.debtorId[0]['entityName']
          : '';
      }
      if (limit.status) {
        limit.status = formatString(limit.status);
      }
    });
    return { response, total };
  } catch (e) {
    Logger.log.error('Error occurred in get limit list report');
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
    Logger.log.error('Error occurred in get limit list report');
    Logger.log.error(e.message || e);
  }
};

const numberWithCommas = (number) => {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
};

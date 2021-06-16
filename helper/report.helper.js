/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Client = mongoose.model('client');
const Policy = mongoose.model('policy');
const Insurer = mongoose.model('insurer');
const Application = mongoose.model('application');
const Debtor = mongoose.model('debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

const gerClientListReport = async ({
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
    if (reportColumn.includes('riskAnalystId')) {
      query.push({
        $lookup: {
          from: 'users',
          localField: 'riskAnalystId',
          foreignField: '_id',
          as: 'riskAnalystId',
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
    const response = clients[0]['paginatedResult']
      ? clients[0]['paginatedResult']
      : clients;
    const total =
      clients.length !== 0 &&
      clients[0]['totalCount'] &&
      clients[0]['totalCount'].length !== 0
        ? clients[0]['totalCount'][0]['count']
        : 0;
    const ciPolicies = {};
    const rmpPolicies = {};
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
          .select('_id clientId product discretionaryLimit noOfResChecks')
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
        ciPolicies[policy.clientId] = policy;
      });
      rmpPolicy.forEach((policy) => {
        rmpPolicies[policy.clientId] = policy;
      });
      if (reportColumn.includes('remainingApplication')) {
        const promises = [];
        isRemainingApplicationSelected = true;
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
          ciPolicies[client._id] && ciPolicies[client._id]['discretionaryLimit']
            ? ciPolicies[client._id]['discretionaryLimit']
            : 0;
      }
      if (isRESChecksSelected) {
        client.noOfResChecks =
          rmpPolicies[client._id] && rmpPolicies[client._id]['noOfResChecks']
            ? rmpPolicies[client._id]['noOfResChecks']
            : 0;
      }
      if (isTotalApplicationSelected) {
        client.totalApplication = clientApplications[client._id]
          ? clientApplications[client._id]
          : 0;
      }
      if (isRemainingApplicationSelected) {
        client.remainingApplication =
          rmpPolicies[client._id] &&
          rmpPolicies[client._id]['noOfResChecks'] &&
          rmpPolicies[client._id]['noOfResChecks'].length !== 0 &&
          clientApplications[client._id]
            ? parseInt(rmpPolicies[client._id]['noOfResChecks']) -
                clientApplications[client._id] >=
              0
              ? parseInt(rmpPolicies[client._id]['noOfResChecks']) -
                clientApplications[client._id]
              : 0
            : 0;
      }
    });
    console.log('response', response);
    return { response, total };
  } catch (e) {
    Logger.log.error('Error occurred in get client list report');
    Logger.log.error(e.message || e);
  }
};

const getLimitListReport = async ({
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
    if (reportColumn.includes('riskAnalystId')) {
      query.push({
        $lookup: {
          from: 'users',
          localField: 'riskAnalystId',
          foreignField: '_id',
          as: 'riskAnalystId',
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
    const response = clients[0]['paginatedResult']
      ? clients[0]['paginatedResult']
      : clients;
    const total =
      clients.length !== 0 &&
      clients[0]['totalCount'] &&
      clients[0]['totalCount'].length !== 0
        ? clients[0]['totalCount'][0]['count']
        : 0;
    const ciPolicies = {};
    const rmpPolicies = {};
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
          .select('_id clientId product discretionaryLimit noOfResChecks')
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
        ciPolicies[policy.clientId] = policy;
      });
      rmpPolicy.forEach((policy) => {
        rmpPolicies[policy.clientId] = policy;
      });
      if (reportColumn.includes('remainingApplication')) {
        const promises = [];
        isRemainingApplicationSelected = true;
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
          ciPolicies[client._id] && ciPolicies[client._id]['discretionaryLimit']
            ? ciPolicies[client._id]['discretionaryLimit']
            : 0;
      }
      if (isRESChecksSelected) {
        client.noOfResChecks =
          rmpPolicies[client._id] && rmpPolicies[client._id]['noOfResChecks']
            ? rmpPolicies[client._id]['noOfResChecks']
            : 0;
      }
      if (isTotalApplicationSelected) {
        client.totalApplication = clientApplications[client._id]
          ? clientApplications[client._id]
          : 0;
      }
      if (isRemainingApplicationSelected) {
        client.remainingApplication =
          rmpPolicies[client._id] &&
          rmpPolicies[client._id]['noOfResChecks'] &&
          rmpPolicies[client._id]['noOfResChecks'].length !== 0 &&
          clientApplications[client._id]
            ? parseInt(rmpPolicies[client._id]['noOfResChecks']) -
                clientApplications[client._id] >=
              0
              ? parseInt(rmpPolicies[client._id]['noOfResChecks']) -
                clientApplications[client._id]
              : 0
            : 0;
      }
    });
    console.log('response', response);
    return { response, total };
  } catch (e) {
    Logger.log.error('Error occurred in get limit list report');
    Logger.log.error(e.message || e);
  }
};

module.exports = { gerClientListReport };

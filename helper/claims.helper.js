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
const { getClaimsDetails } = require('./rss.helper');

const getClaimsList = async ({
  hasFullAccess = false,
  userId,
  claimColumn,
  requestedQuery,
  moduleColumn,
  isForRisk = true,
  clientId,
}) => {
  try {
    let clientCRMIds = [];
    if (isForRisk && !hasFullAccess && !requestedQuery.clientId) {
      const clients = await Client.find({
        isDeleted: false,
        $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
      })
        .select('_id crmClientId')
        .lean();
      clientCRMIds = clients.map((i) => i.crmClientId);
    } else if (requestedQuery.clientId) {
      const client = await Client.findById(requestedQuery.clientId)
        .select('_id crmClientId')
        .lean();
      clientCRMIds = [client.crmClientId];
    } else if (!isForRisk) {
      const client = await Client.findById(clientId)
        .select('_id crmClientId')
        .lean();
      clientCRMIds = [client.crmClientId];
    }
    requestedQuery.page = requestedQuery.page || 1;
    requestedQuery.limit = requestedQuery.limit || 10;
    const { claims, totalCount } = await getClaimsDetails({
      crmIds: clientCRMIds,
      page: requestedQuery.page,
      limit: requestedQuery.limit,
    });
    const response = {};
    if (
      claimColumn.includes('accountid') ||
      claimColumn.includes('insurerId') ||
      claimColumn.includes('sector')
    ) {
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

    /*const currentColumn = claimColumn.reduce((obj, key) => {
      obj[key] = 1;
      return obj;
    }, {});
    if (
      !claimColumn.includes('accountid') &&
      (claimColumn.includes('insurerId') || claimColumn.includes('sector'))
    ) {
      currentColumn['accountid'] = 1;
    }*/
    const claimsList = [];
    let data = {};
    claims.forEach((claim) => {
      const id = claim['accountid'];
      claimColumn.map((key) => {
        if (key === 'insurerId') {
          data[key] =
            response[id] &&
            response[id]['insurerId'] &&
            response[id]['insurerId']['name']
              ? response[id]['insurerId']['name']
              : '';
        } else if (key === 'sector') {
          data[key] =
            response[id] && response[id]['sector']
              ? response[id]['sector']
              : '';
        } else if (key === 'accountid') {
          data[key] =
            response[id] && response[id]['name']
              ? { _id: response[id]['_id'], value: response[id]['name'] }
              : '';
        } else {
          data[key] = claim[key];
        }
      });
      claimsList.push(data);
    });
    const headers = [];
    for (let i = 0; i < moduleColumn.length; i++) {
      if (claimColumn.includes(moduleColumn[i].name)) {
        headers.push(moduleColumn[i]);
      }
    }

    return {
      docs: claimsList,
      headers,
      total: totalCount,
      page: parseInt(requestedQuery.page),
      limit: parseInt(requestedQuery.limit),
      pages: Math.ceil(totalCount / parseInt(requestedQuery.limit)),
    };
    // return claimsList;
    /*if (reportColumn.includes('insurerId')) {
      query.push({
        $lookup: {
          from: 'insures',
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
    query.unshift({ $match: queryFilter });*/

    /*const clients = await Client.aggregate(query).allowDiskUse(true);
    console.log('clients', clients);*/
    /*const [ciPolicy, rmpPolicy] = await Promise.all([
          Policy.find({
            clientId: {},
            product: { $regex: '.*Credit Insurance.*' },
            inceptionDate: { $lte: new Date() },
            expiryDate: { $gt: new Date() },
          })
            .select(
              'clientId product policyPeriod discretionaryLimit aggregateOfCreditLimit inceptionDate expiryDate',
            )
            .lean(),
          Policy.find({
            clientId: {},
            product: { $regex: '.*Risk Management Package.*' },
            inceptionDate: { $lte: new Date() },
            expiryDate: { $gt: new Date() },
          })
            .select(
              'clientId product policyPeriod discretionaryLimit inceptionDate expiryDate',
            )
            .lean(),
        ]);*/
  } catch (e) {
    Logger.log.error('Error occurred in get client list report');
    Logger.log.error(e);
  }
};

module.exports = { getClaimsList };

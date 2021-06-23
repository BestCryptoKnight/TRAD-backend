/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Client = mongoose.model('client');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { getClaimsDetails, addClaimDetail } = require('./rss.helper');

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
      clientCRMIds = [requestedQuery.clientId];
    } else if (!isForRisk) {
      const client = await Client.findById(clientId)
        .select('_id crmClientId')
        .lean();
      clientCRMIds = [client.crmClientId];
    } else if (isForRisk) {
      const client = await Client.find({ isDeleted: false })
        .select('_id crmClientId')
        .lean();
      const crmIds = client.map((i) => i.crmClientId);
      clientCRMIds = crmIds;
    }
    requestedQuery.page = requestedQuery.page || 1;
    requestedQuery.limit = requestedQuery.limit || 10;
    const { claims, totalCount } = await getClaimsDetails({
      crmIds: clientCRMIds,
      page: requestedQuery.page,
      limit: requestedQuery.limit,
    });
    const response = {};
    claimColumn.push('id');
    if (claimColumn.includes('accountid')) {
      clientCRMIds = claims.map((i) => i.accountid);
      const clients = await Client.find({
        crmClientId: { $in: clientCRMIds },
      })
        .select('_id crmClientId name')
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
      data = {};
      const clientId = claim['accountid'];
      claimColumn.map((key) => {
        if (key === 'accountid') {
          data[key] =
            response[clientId] && response[clientId]['name']
              ? {
                  _id: response[clientId]['_id'],
                  value: response[clientId]['name'],
                }
              : '';
        } else if (
          key === 'claimsinforequested' ||
          key === 'claimsinforeviewed' ||
          key === 'reimbursementrequired' ||
          key === 'tradinghistory'
        ) {
          data[key] = claim[key] === '1' ? 'Yes' : 'No';
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
  } catch (e) {
    Logger.log.error('Error occurred in get client list report');
    Logger.log.error(e);
  }
};

const addClaimInRSS = async ({ requestBody }) => {
  try {
    const keys = [
      'name',
      'accountid',
      'description',
      'notifiedofcase',
      'claimsinforequested',
      'claimsinforeviewed',
      'datesubmittedtouw',
      'podreceived',
      'podsenttouw',
      'codrequested',
      'codreceived',
      'grossdebtamount',
      'amountpaid',
      'receivedlolfromuw',
      'claimpaidbyuw',
      'reimbursementrequired',
      'reimbursementrequested',
      'reimbursementreceived',
      'tradinghistory',
      'dljustification',
      'underwriter',
      'stage',
      'sector',
      'reimbursementspaid',
      'repaymentplanamount',
      'dateofoldestinvoice',
      'instalmentamounts',
      'frequency',
      'finalpaymentdate',
      'repaymentplanlength',
    ];
    const claim = {};
    keys.map((key) => {
      if (
        key === 'claimsinforequested' ||
        key === 'claimsinforeviewed' ||
        key === 'reimbursementrequired' ||
        key === 'tradinghistory'
      ) {
        requestBody[key] = requestBody[key] ? '1' : '0';
      }
      claim[key] = requestBody[key];
    });
    const response = await addClaimDetail({ claim: claim });
    return response;
  } catch (e) {
    Logger.log.error('Error occurred while adding claim in RSS');
    Logger.log.error(e.message || e);
  }
};

module.exports = { getClaimsList, addClaimInRSS };

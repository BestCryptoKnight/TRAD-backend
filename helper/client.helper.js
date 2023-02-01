/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Client = mongoose.model('client');
const ClientUser = mongoose.model('client-user');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticData = require('./../static-files/staticData.json');
const { getDebtorFullAddress } = require('./debtor.helper');
const config = require('./../config');

const getClientList = async ({
  hasFullAccess = false,
  userId,
  sendCRMIds = false,
  isForRisk = true,
  page = 1,
  limit = 200,
  clientId,
}) => {
  try {
    let query = {
      isDeleted: false,
    };
    if (isForRisk && !hasFullAccess) {
      query = {
        isDeleted: false,
        $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
      };
    } else {
      query.clientId = clientId;
    }
    let select = '_id name';
    if (sendCRMIds) {
      select += ' crmClientId';
    }
    return await Client.find(query)
      .select(select)
      .limit(limit)
      .skip(page ? (page - 1) * limit : page)
      .lean();
  } catch (e) {
    Logger.log.error('Error occurred in get client list', e.message || e);
  }
};

const getUserClientList = async ({ clientId, isForAssignee = false }) => {
  try {
    const clientUser = await ClientUser.find({ clientId: clientId })
      .select('_id name')
      .lean();
    if (isForAssignee) {
      const client = await Client.findById(clientId)
        .populate({ path: 'riskAnalystId serviceManagerId', select: 'name' })
        .select('riskAnalystId serviceManagerId')
        .lean();

      clientUser.forEach((i) => (i._id = 'client-user|' + i._id));
      if (client && client.riskAnalystId && client.riskAnalystId.name) {
        client.riskAnalystId._id = 'user|' + client.riskAnalystId._id;
        clientUser.push(client.riskAnalystId);
      }
      if (client && client.serviceManagerId && client.serviceManagerId.name) {
        client.serviceManagerId._id = 'user|' + client.serviceManagerId._id;
        clientUser.push(client.serviceManagerId);
      }
    }
    return clientUser;
  } catch (e) {
    Logger.log.error(
      'Error occurred in get user & client list',
      e.message || e,
    );
  }
};

const getClientListWithDetails = async ({
  clientColumn,
  requestedQuery,
  hasFullAccess = false,
  userId,
  moduleColumn,
  isForDownload = false,
}) => {
  try {
    let queryFilter = { isDeleted: false };
    const filterArray = [];
    if (!hasFullAccess && userId) {
      queryFilter = {
        isDeleted: false,
        $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
      };
    }
    requestedQuery.sortBy = requestedQuery.sortBy || '_id';
    requestedQuery.sortOrder = requestedQuery.sortOrder || 'desc';

    if (requestedQuery.sector) {
      queryFilter.sector = requestedQuery.sector;
      if (isForDownload) {
        filterArray.push({
          label: 'Sector',
          value: requestedQuery.sector,
          type: 'string',
        });
      }
    }
    if (requestedQuery.inceptionStartDate || requestedQuery.inceptionEndDate) {
      let dateQuery = {};
      if (requestedQuery.inceptionStartDate) {
        dateQuery = {
          $gte: new Date(requestedQuery.inceptionStartDate),
        };
        if (isForDownload) {
          filterArray.push({
            label: 'Inception Start Date',
            value: requestedQuery.inceptionStartDate,
            type: 'date',
          });
        }
      }
      if (requestedQuery.inceptionEndDate) {
        dateQuery = Object.assign({}, dateQuery, {
          $lte: new Date(requestedQuery.inceptionEndDate),
        });
        if (isForDownload) {
          filterArray.push({
            label: 'Inception End Date',
            value: requestedQuery.inceptionEndDate,
            type: 'date',
          });
        }
      }
      queryFilter.inceptionDate = dateQuery;
    }
    if (requestedQuery.expiryStartDate || requestedQuery.expiryEndDate) {
      let dateQuery = {};
      if (requestedQuery.expiryStartDate) {
        dateQuery = {
          $gte: new Date(requestedQuery.expiryStartDate),
        };
        if (isForDownload) {
          filterArray.push({
            label: 'expiry Start Date',
            value: requestedQuery.expiryStartDate,
            type: 'date',
          });
        }
      }
      if (requestedQuery.expiryEndDate) {
        dateQuery = Object.assign({}, dateQuery, {
          $lte: new Date(requestedQuery.expiryEndDate),
        });
        if (isForDownload) {
          filterArray.push({
            label: 'Expiry End Date',
            value: requestedQuery.expiryEndDate,
            type: 'date',
          });
        }
      }
      queryFilter.expiryDate = dateQuery;
    }

    let sortingOptions = {};
    let aggregationQuery = [];
    if (
      requestedQuery.serviceManagerId ||
      clientColumn.includes('serviceManagerId')
    ) {
      aggregationQuery.push({
        $lookup: {
          from: 'users',
          localField: 'serviceManagerId',
          foreignField: '_id',
          as: 'serviceManagerId',
        },
      });
    }
    if (requestedQuery.serviceManagerId) {
      aggregationQuery.push({
        $match: {
          'serviceManagerId._id': mongoose.Types.ObjectId(
            requestedQuery.serviceManagerId,
          ),
        },
      });
    }
    if (
      requestedQuery.riskAnalystId ||
      clientColumn.includes('riskAnalystId')
    ) {
      aggregationQuery.push({
        $lookup: {
          from: 'users',
          localField: 'riskAnalystId',
          foreignField: '_id',
          as: 'riskAnalystId',
        },
      });
    }
    if (requestedQuery.riskAnalystId) {
      aggregationQuery.push({
        $match: {
          'riskAnalystId._id': mongoose.Types.ObjectId(
            requestedQuery.riskAnalystId,
          ),
        },
      });
    }
    if (requestedQuery.insurerId || clientColumn.includes('insurerId')) {
      aggregationQuery.push({
        $lookup: {
          from: 'insurers',
          localField: 'insurerId',
          foreignField: '_id',
          as: 'insurerId',
        },
      });
    }
    if (requestedQuery.insurerId) {
      aggregationQuery.push({
        $match: {
          'insurerId._id': mongoose.Types.ObjectId(requestedQuery.insurerId),
        },
      });
    }
    clientColumn.push('address');
    const fields = clientColumn.map((i) => {
      if (
        i === 'serviceManagerId' ||
        i === 'riskAnalystId' ||
        i === 'insurerId'
      ) {
        i = i + '.name';
      }
      return [i, 1];
    });
    aggregationQuery.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });
    if (requestedQuery.sortBy && requestedQuery.sortOrder) {
      const addressFields = [
        'fullAddress',
        'addressLine',
        'city',
        'state',
        'country',
        'zipCode',
      ];
      if (addressFields.includes(requestedQuery.sortBy)) {
        requestedQuery.sortBy = 'address.' + requestedQuery.sortBy;
      }
      sortingOptions[requestedQuery.sortBy] =
        requestedQuery.sortOrder === 'desc' ? -1 : 1;
      aggregationQuery.push({ $sort: sortingOptions });
    }
    /*aggregationQuery.push({
      $skip: (parseInt(requestedQuery.page) - 1) * parseInt(requestedQuery.limit),
    });
    aggregationQuery.push({ $limit: parseInt(requestedQuery.limit) });*/
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

    response.forEach((user) => {
      if (clientColumn.includes('riskAnalystId') && user.riskAnalystId) {
        user.riskAnalystId = user.riskAnalystId[0]
          ? user.riskAnalystId[0].name
          : '';
      }
      if (clientColumn.includes('serviceManagerId') && user.serviceManagerId) {
        user.serviceManagerId = user.serviceManagerId[0]
          ? user.serviceManagerId[0].name
          : '';
      }
      if (clientColumn.includes('insurerId') && user.insurerId) {
        user.insurerId = user.insurerId[0] ? user.insurerId[0].name : '';
      }
      if (clientColumn.includes('addressLine')) {
        user.addressLine = user.address.addressLine;
      }
      if (clientColumn.includes('city')) {
        user.city = user.address.city;
      }
      if (clientColumn.includes('state')) {
        const state =
          user.address.country.toLowerCase() === 'australia'
            ? StaticData.australianStates.find((i) => {
                if (i._id === user.address.state) return i;
              })
            : user.address.country.toLowerCase() === 'new zealand'
            ? StaticData.newZealandStates.find((i) => {
                if (i._id === user.address.state) return i;
              })
            : { name: user.address.state };
        user.state = state && state.name ? state.name : user.address.state;
      }
      if (clientColumn.includes('country')) {
        user.country = user.address.country;
      }
      if (clientColumn.includes('zipCode')) {
        user.zipCode = user.address.zipCode;
      }
      if (clientColumn.includes('fullAddress')) {
        user.fullAddress = getDebtorFullAddress({
          address: user.address,
          country: user.address.country,
        });
      }
      if (user.hasOwnProperty('isAutoApproveAllowed')) {
        user.isAutoApproveAllowed = user.isAutoApproveAllowed ? 'Yes' : 'No';
      }
      delete user.address;
    });
    const headers = [];
    for (let i = 0; i < moduleColumn.length; i++) {
      if (clientColumn.includes(moduleColumn[i].name)) {
        headers.push(moduleColumn[i]);
      }
    }
    const clientResponse = {
      docs: response,
      headers,
      total,
      page: parseInt(requestedQuery.page),
      limit: parseInt(requestedQuery.limit),
      pages: Math.ceil(total / parseInt(requestedQuery.limit)),
      filterArray,
    };
    if (isForDownload) {
      clientResponse.filterArray = filterArray;
    }
    return clientResponse;
  } catch (e) {
    Logger.log.error('Error occurred in get client list');
    Logger.log.error(e);
  }
};

const removeClientUserToken = async () => {
  try {
    const users = await ClientUser.find({
      isDeleted: false,
      hasPortalAccess: true,
    }).lean();
    const date = new Date();
    const expireTime = new Date(
      date.setHours(date.getHours() - config.jwt.expireTime),
    );
    const promises = [];
    let update;
    for (let i = 0; i < users.length; i++) {
      if (users[i].jwtToken && users[i].jwtToken.length !== 0) {
        update = {};
        users[i].jwtToken = users[i].jwtToken.filter((i) => {
          return expireTime < i.lastAPICallTime;
        });
        update.jwtToken = users[i].jwtToken;
        if (users[i].jwtToken.length === 0) {
          update.socketIds = [];
        }
        promises.push(
          ClientUser.updateOne({ _id: users[i]._id }, { $set: update }),
        );
      }
    }
    await Promise.all(promises);
  } catch (e) {
    Logger.log.error('Error occurred remove token from DB');
    Logger.log.error(e);
  }
};

const getUserDetailsByClientId = async ({ clientId }) => {
  try {
    const client = await Client.findOne({ _id: clientId })
      .select('name serviceManagerId riskAnalystId')
      .lean();
    return client;
  } catch (e) {
    Logger.log.error('Error occurred in get user details', e);
  }
};

module.exports = {
  getClientList,
  getUserClientList,
  getClientListWithDetails,
  removeClientUserToken,
  getUserDetailsByClientId,
};

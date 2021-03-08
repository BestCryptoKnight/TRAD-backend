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

const getClientList = async ({ hasFullAccess = false, userId }) => {
  try {
    let query = {
      isDeleted: false,
    };
    if (!hasFullAccess) {
      query = {
        isDeleted: false,
        $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
      };
    }
    return await Client.find(query).select('_id name').lean();
  } catch (e) {
    Logger.log.error('Error occurred in get client list ', e.message || e);
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
      'Error occurred in get user & client list ',
      e.message || e,
    );
  }
};

module.exports = { getClientList, getUserClientList };

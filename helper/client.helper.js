/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Client = mongoose.model('client');
const ClientUser = mongoose.model('client-user');
const ClientDebtor = mongoose.model('client-debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticData = require('./../static-files/staticData.json');

const getClientList = async ({
  hasFullAccess = false,
  userId,
  sendCRMIds = false,
}) => {
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
    let select = '_id name';
    if (sendCRMIds) {
      select += ' crmClientId';
    }
    return await Client.find(query).select(select).lean();
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

const getCreditLimitList = async ({ clientId }) => {
  try {
    const debtors = await ClientDebtor.find({
      isActive: true,
      clientId: mongoose.Types.ObjectId(clientId),
      creditLimit: { $exists: true, $ne: null },
    })
      .populate('clientId debtorId')
      .lean();
    let creditLimits = [];
    let data = {};
    debtors.forEach((debtor) => {
      data = {
        debtorName: debtor.debtorId.entityName,
        abn: debtor.debtorId.abn,
        acn: debtor.debtorId.acn,
        registrationNumber: debtor.debtorId.registrationNumber,
        entityType: debtor.debtorId.entityType
          .replace(/_/g, ' ')
          .replace(/\w\S*/g, function (txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
          }),
        creditLimit: debtor.creditLimit,
        contactNumber: debtor.debtorId.contactNumber,
        riskRating: debtor.debtorId.riskRating,
        reviewDate: debtor.debtorId.reviewDate
          ? new Date(debtor.debtorId.reviewDate).getDate() +
            '-' +
            (new Date(debtor.debtorId.reviewDate).getMonth() + 1) +
            '-' +
            new Date(debtor.debtorId.reviewDate).getFullYear()
          : null,
      };
      for (let key in debtor.debtorId.address) {
        data[key] = debtor.debtorId.address[key];
      }
      const state =
        data.country.code === 'AUS'
          ? StaticData.australianStates.find((i) => {
              if (i._id === data.state) return i;
            })
          : data.country.code === 'NZL'
          ? StaticData.newZealandStates.find((i) => {
              if (i._id === data.state) return i;
            })
          : { name: data.state };
      if (state && state.name) {
        data.state = state.name;
      }
      const streetType = StaticData.streetType.find((i) => {
        if (i._id === data.streetType) return i;
      });
      if (streetType && streetType.name) {
        data.streetType = streetType.name;
      }
      data.country = data.country.name;
      creditLimits.push(data);
    });
    return creditLimits;
  } catch (e) {
    Logger.log.error('Error occurred in get credit-limit list', e.message || e);
  }
};

module.exports = { getClientList, getUserClientList, getCreditLimitList };

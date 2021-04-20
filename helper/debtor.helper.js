/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Client = mongoose.model('client');
const ClientDebtor = mongoose.model('client-debtor');
const Debtor = mongoose.model('debtor');
const Organization = mongoose.model('organization');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { addAuditLog } = require('./audit-log.helper');

const getClientDebtorList = async ({
  hasFullAccess = false,
  userId,
  isForRisk = false,
}) => {
  try {
    let clientIds;
    if (!isForRisk) {
      clientIds = [userId];
    } else {
      const query = hasFullAccess
        ? { isDeleted: false }
        : {
            isDeleted: false,
            $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
          };
      const clients = await Client.find(query).select('_id').lean();
      clientIds = clients.map((i) => i._id);
    }
    const debtors = await ClientDebtor.find({ clientId: { $in: clientIds } })
      .populate({ path: 'debtorId', select: 'entityName' })
      .select('_id')
      .lean();
    debtors.forEach((i) => {
      i.name = i.debtorId.entityName;
      delete i.debtorId;
    });
    return debtors;
  } catch (e) {
    Logger.log.error(
      'Error occurred in get client-debtor list ',
      e.message || e,
    );
  }
};

const getDebtorList = async () => {
  try {
    const debtors = await Debtor.find({ isActive: true })
      .select('_id entityName abn acn')
      .lean();
    debtors.forEach((debtor) => {
      debtor.name =
        debtor.entityName + ' (' + (debtor.abn ? debtor.abn : debtor.acn) + ')';
      delete debtor.entityName;
      delete debtor.abn;
      delete debtor.acn;
    });
    return debtors;
  } catch (e) {
    Logger.log.error('Error occurred in get debtor list ', e.message || e);
  }
};

const createDebtor = async ({
  requestBody,
  organization,
  isDebtorExists,
  userId,
  userName,
}) => {
  try {
    let update = {};
    if (requestBody.address && Object.keys(requestBody.address).length !== 0) {
      update.address = {};
      if (
        requestBody.address.property &&
        requestBody.address.property.length !== 0
      ) {
        update.address.property = requestBody.address.property;
      }
      if (
        requestBody.address.unitNumber &&
        requestBody.address.unitNumber.length !== 0
      ) {
        update.address.unitNumber = requestBody.address.unitNumber;
      }
      if (
        requestBody.address.streetNumber &&
        requestBody.address.streetNumber.length !== 0
      ) {
        update.address.streetNumber = requestBody.address.streetNumber;
      }
      if (
        requestBody.address.streetName &&
        requestBody.address.streetName.length !== 0
      ) {
        update.address.streetName = requestBody.address.streetName;
      }
      if (
        requestBody.address.streetType &&
        requestBody.address.streetType.length !== 0
      ) {
        update.address.streetType = requestBody.address.streetType;
      }
      if (
        requestBody.address.suburb &&
        requestBody.address.suburb.length !== 0
      ) {
        update.address.suburb = requestBody.address.suburb;
      }
      if (requestBody.address.state && requestBody.address.state.length !== 0) {
        update.address.state = requestBody.address.state;
      }
      if (
        requestBody.address.country &&
        requestBody.address.country.name &&
        requestBody.address.country.code
      ) {
        update.address.country = requestBody.address.country;
      }
      if (
        requestBody.address.postCode &&
        requestBody.address.postCode.length !== 0
      ) {
        update.address.postCode = requestBody.address.postCode;
      }
      /*update.address = {
        property: requestBody.address.property,
        unitNumber: requestBody.address.unitNumber,
        streetNumber: requestBody.address.streetNumber,
        streetName: requestBody.address.streetName,
        streetType: requestBody.address.streetType,
        suburb: requestBody.address.suburb,
        state: requestBody.address.state,
        country: requestBody.address.country,
        postCode: requestBody.address.postCode,
      };*/
    }
    if (requestBody.entityType) update.entityType = requestBody.entityType;
    if (requestBody.contactNumber)
      update.contactNumber = requestBody.contactNumber;
    if (requestBody.tradingName) update.tradingName = requestBody.tradingName;
    if (requestBody.entityName) update.entityName = requestBody.entityName;
    if (requestBody.acn) update.acn = requestBody.acn;
    if (requestBody.abn) update.abn = requestBody.abn;
    if (requestBody.isActive) update.isActive = requestBody.isActive;
    if (!isDebtorExists) {
      update.debtorCode =
        'D' + (organization.entityCount.debtor + 1).toString().padStart(4, '0');
      await Organization.updateOne(
        { isDeleted: false },
        { $inc: { 'entityCount.debtor': 1 } },
      );
    }
    await Debtor.updateOne(
      { $or: [{ abn: requestBody.abn }, { acn: requestBody.acn }] },
      update,
      { upsert: true },
    );
    const debtor = await Debtor.findOne({
      $or: [{ abn: requestBody.abn }, { acn: requestBody.acn }],
    }).lean();
    await ClientDebtor.updateOne(
      { clientId: requestBody.clientId, debtorId: debtor._id },
      {
        clientId: requestBody.clientId,
        debtorId: debtor._id,
        isActive: true,
        outstandingAmount: requestBody.outstandingAmount,
      },
      { upsert: true },
    );
    const clientDebtor = await ClientDebtor.findOne({
      clientId: requestBody.clientId,
      debtorId: debtor._id,
    }).lean();
    await addAuditLog({
      entityType: 'debtor',
      entityRefId: debtor._id,
      actionType: 'add',
      userType: 'user',
      userRefId: userId,
      logDescription: `A debtor ${debtor.entityName} is successfully updated by ${userName}`,
    });
    return { debtor, clientDebtor };
  } catch (e) {
    Logger.log.error('Error occurred in creating debtor ', e);
  }
};

module.exports = { getDebtorList, createDebtor };

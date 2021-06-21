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
const StaticData = require('./../static-files/staticData.json');

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
      .select('_id entityName abn acn registrationNumber')
      .lean();
    debtors.forEach((debtor) => {
      debtor.name =
        debtor.entityName +
        ' (' +
        (debtor.abn
          ? debtor.abn
          : debtor.acn
          ? debtor.acn
          : debtor.registrationNumber) +
        ')';
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
  clientId,
}) => {
  try {
    let update = {};
    console.log('isDebtorExists::', isDebtorExists);
    if (requestBody.address && Object.keys(requestBody.address).length !== 0) {
      update.address = {};
      update.address.property =
        requestBody.address.property &&
        requestBody.address.property.length !== 0
          ? requestBody.address.property
          : undefined;
      update.address.unitNumber =
        requestBody.address.unitNumber &&
        requestBody.address.unitNumber.length !== 0
          ? requestBody.address.unitNumber
          : undefined;
      if (
        requestBody.address.streetNumber &&
        requestBody.address.streetNumber.length !== 0
      ) {
        update.address.streetNumber = requestBody.address.streetNumber;
      }
      update.address.streetName =
        requestBody.address.streetName &&
        requestBody.address.streetName.length !== 0
          ? requestBody.address.streetName
          : undefined;
      if (
        requestBody.address.streetType &&
        requestBody.address.streetType.length !== 0
      ) {
        update.address.streetType = requestBody.address.streetType;
      }
      update.address.suburb =
        requestBody.address.suburb && requestBody.address.suburb.length !== 0
          ? requestBody.address.suburb
          : undefined;

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
    }
    if (requestBody.entityType) update.entityType = requestBody.entityType;
    update.contactNumber = requestBody.contactNumber
      ? requestBody.contactNumber
      : undefined;
    update.tradingName = requestBody.tradingName
      ? requestBody.tradingName
      : undefined;
    if (requestBody.entityName) update.entityName = requestBody.entityName;
    update.acn = requestBody.acn ? requestBody.acn : undefined;
    update.registrationNumber = requestBody.registrationNumber
      ? requestBody.registrationNumber
      : undefined;
    if (requestBody.abn) update.abn = requestBody.abn;
    if (requestBody.isActive) update.isActive = requestBody.isActive;
    if (!isDebtorExists) {
      const date = new Date();
      update.reviewDate = new Date(date.setMonth(date.getMonth() + 11));
      update.debtorCode =
        'D' + (organization.entityCount.debtor + 1).toString().padStart(4, '0');
      await Organization.updateOne(
        { isDeleted: false },
        { $inc: { 'entityCount.debtor': 1 } },
      );
    }
    let query;
    if (requestBody.registrationNumber) {
      query = { registrationNumber: requestBody.registrationNumber };
    } else if (requestBody.abn) {
      query = { abn: requestBody.abn };
    } else {
      query = { acn: requestBody.acn };
    }
    await Debtor.updateOne(query, update, { upsert: true });
    const debtor = await Debtor.findOne(query).lean();
    await ClientDebtor.updateOne(
      { clientId: clientId, debtorId: debtor._id },
      {
        clientId: clientId,
        debtorId: debtor._id,
        isActive: true,
        // outstandingAmount: requestBody.outstandingAmount,
      },
      { upsert: true },
    );
    const clientDebtor = await ClientDebtor.findOne({
      clientId: clientId,
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

const getDebtorFullAddress = ({ address }) => {
  try {
    let fullAddress;
    if (address.state) {
      const state =
        address.country.code === 'AUS' ||
        (typeof address.country === 'string' && address.country === 'Australia')
          ? StaticData.australianStates.find((i) => {
              if (i._id === address.state) return i;
            })
          : address.country.code === 'NZL'
          ? StaticData.newZealandStates.find((i) => {
              if (i._id === address.state) return i;
            })
          : { name: address.state };
      address.state = state && state.name ? state.name : address.state;
    }
    if (address.streetType) {
      const streetType = StaticData.streetType.find((i) => {
        if (i._id === address.streetType) return i;
      });
      address.streetType =
        streetType && streetType.name ? streetType.name : address.streetType;
    }
    if (address.country && address.country.name) {
      address.country = address.country.name;
    }
    fullAddress =
      (address.property ? address.property + ', ' : '') +
      (address.unitNumber ? address.unitNumber + ', ' : '') +
      (address.streetNumber ? address.streetNumber + ', ' : '') +
      (address.streetName ? address.streetName + ', ' : '') +
      (address.streetType ? address.streetType + ', ' : '') +
      (address.suburb ? address.suburb + ', ' : '') +
      (address.state ? address.state + ', ' : '') +
      (address.postCode ? address.postCode + ', ' : '') +
      address.country;
    return fullAddress;
  } catch (e) {
    Logger.log.error(
      'Error occurred in get debtor full address ',
      e.message || e,
    );
  }
};

const getCreditLimitList = async ({ debtorId }) => {
  try {
    const debtors = await ClientDebtor.find({
      isActive: true,
      debtorId: mongoose.Types.ObjectId(debtorId),
      creditLimit: { $exists: true, $ne: null },
    })
      .populate('clientId debtorId')
      .lean();
    let creditLimits = [];
    debtors.forEach((debtor) =>
      creditLimits.push({
        clientName: debtor.clientId.name,
        abn: debtor.clientId.abn,
        acn: debtor.clientId.acn,
        registrationNumber: debtor.clientId.registrationNumber,
        creditLimit: debtor.creditLimit,
        contactNumber: debtor.clientId.contactNumber,
        inceptionDate:
          new Date(debtor.clientId.inceptionDate).getDate() +
          '-' +
          (new Date(debtor.clientId.inceptionDate).getMonth() + 1) +
          '-' +
          new Date(debtor.clientId.inceptionDate).getFullYear(),
        expiryDate:
          new Date(debtor.clientId.expiryDate).getDate() +
          '-' +
          (new Date(debtor.clientId.expiryDate).getMonth() + 1) +
          '-' +
          new Date(debtor.clientId.expiryDate).getFullYear(),
      }),
    );
    return creditLimits;
  } catch (e) {
    Logger.log.error('Error occurred in get credit-limit list', e.message || e);
  }
};

const getStateName = (state, countryCode) => {
  try {
    const stateData =
      countryCode === 'AUS'
        ? StaticData.australianStates.find((i) => {
            if (i._id === state) return i;
          })
        : countryCode === 'NZL'
        ? StaticData.newZealandStates.find((i) => {
            if (i._id === state) return i;
          })
        : { name: state };
    return stateData;
  } catch (e) {
    Logger.log.error('Error occurred in get state name');
    Logger.log.error(e.message || e);
  }
};

const getStreetTypeName = (streetType) => {
  try {
    const streetTypeString = StaticData.streetType.find((i) => {
      if (i._id === streetType) return i;
    });
    return {
      value: streetType,
      label:
        streetTypeString && streetTypeString.name
          ? streetTypeString.name
          : streetType,
    };
  } catch (e) {
    Logger.log.error('Error occurred in get state name');
    Logger.log.error(e.message || e);
  }
};

module.exports = {
  getDebtorList,
  createDebtor,
  getDebtorFullAddress,
  getCreditLimitList,
  getStateName,
  getStreetTypeName,
};

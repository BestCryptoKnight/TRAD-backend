/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Client = mongoose.model('client');
const ClientDebtor = mongoose.model('client-debtor');
const Debtor = mongoose.model('debtor');
const DebtorDirector = mongoose.model('debtor-director');
const Organization = mongoose.model('organization');
const CreditReport = mongoose.model('credit-report');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { addAuditLog } = require('./audit-log.helper');
const StaticData = require('./../static-files/staticData.json');
const { formatString } = require('./overdue.helper');
const { addNotification } = require('./notification.helper');
const { sendNotification } = require('./socket.helper');
const { createTask } = require('./task.helper');
const {
  addEntitiesToProfile,
  removeEntitiesFromProfile,
} = require('./illion.helper');

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
      update.address.property = requestBody.address.property
        ? requestBody.address.property
        : undefined;
      update.address.unitNumber = requestBody.address.unitNumber
        ? requestBody.address.unitNumber
        : undefined;

      update.address.streetNumber = requestBody.address.streetNumber
        ? requestBody.address.streetNumber
        : null;

      update.address.streetName = requestBody.address.streetName
        ? requestBody.address.streetName
        : undefined;
      if (
        requestBody.address.streetType &&
        requestBody.address.streetType.length !== 0
      ) {
        update.address.streetType = requestBody.address.streetType;
      }
      update.address.suburb = requestBody.address.suburb
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
    //TODO add logs for update on back step
    if (!isDebtorExists) {
      addAuditLog({
        entityType: 'debtor',
        entityRefId: debtor._id,
        actionType: 'add',
        userType: 'user',
        userRefId: userId,
        logDescription: `A debtor ${debtor.entityName} is successfully added by ${userName}`,
      });
    }
    return { debtor, clientDebtor };
  } catch (e) {
    Logger.log.error('Error occurred in creating debtor ', e);
  }
};

const getDebtorFullAddress = ({ address, country }) => {
  try {
    let fullAddress;
    if (address.state) {
      const state =
        country.code === 'AUS' ||
        (typeof country === 'string' && country === 'Australia')
          ? StaticData.australianStates.find((i) => {
              if (i._id === address.state) return i;
            })
          : country.code === 'NZL'
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
    if (country && country.name) {
      country = country.name;
    }
    fullAddress =
      (address.addressLine ? address.addressLine + ', ' : '') +
      (address.property ? address.property + ', ' : '') +
      (address.unitNumber ? address.unitNumber + ', ' : '') +
      (address.streetNumber ? address.streetNumber + ', ' : '') +
      (address.streetName ? address.streetName + ', ' : '') +
      (address.streetType ? address.streetType + ', ' : '') +
      (address.suburb ? address.suburb + ', ' : '') +
      (address.city ? address.city + ', ' : '') +
      (address.state ? address.state + ', ' : '') +
      (address.postCode ? address.postCode + ', ' : '') +
      country;
    return fullAddress;
  } catch (e) {
    Logger.log.error(
      'Error occurred in get debtor full address ',
      e.message || e,
    );
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

const checkDirectorsOfDebtor = async ({ parameter, value }) => {
  try {
    const debtor = await Debtor.findOne({
      [parameter]: value,
      isDeleted: false,
    });
    if (!debtor) {
      return 0;
    }
    const debtorDirectors = await DebtorDirector.find({
      debtorId: debtor._id,
      isDeleted: false,
    }).select({ _id: 1 });
    return debtorDirectors.length;
  } catch (e) {
    Logger.log.error('Error occurred in get state name');
    Logger.log.error(e.message || e);
  }
};

const getDebtorListWithDetails = async ({
  debtorColumn,
  requestedQuery,
  hasFullAccess = false,
  userId,
  moduleColumn,
  isForDownload = false,
}) => {
  try {
    let queryFilter = {
      // isActive: true,
    };
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
    const filterArray = [];
    const aggregationQuery = [];

    requestedQuery.sortBy = requestedQuery.sortBy || '_id';
    requestedQuery.sortOrder = requestedQuery.sortOrder || 'desc';
    if (!hasFullAccess && userId) {
      const debtors = await Client.find({
        isDeleted: false,
        $or: [{ riskAnalystId: userId }, { serviceManagerId: userId }],
      })
        .select({ _id: 1 })
        .lean();
      const clientIds = debtors.map((i) => i._id);
      const clientDebtor = await ClientDebtor.find({
        clientId: { $in: clientIds },
      })
        .select('_id')
        .lean();
      const debtorIds = clientDebtor.map((i) => i._id);
      queryFilter = {
        _id: { $in: debtorIds },
      };
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
    if (requestedQuery.search) {
      queryFilter.entityName = { $regex: requestedQuery.search, $options: 'i' };
    }
    const fields = debtorColumn.map((i) => {
      if (addressFields.includes(i)) {
        i = 'address.' + i;
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
      let sortingOptions = {};
      if (addressFields.includes(requestedQuery.sortBy)) {
        requestedQuery.sortBy = 'address.' + requestedQuery.sortBy;
      }
      sortingOptions[requestedQuery.sortBy] =
        requestedQuery.sortOrder === 'desc' ? -1 : 1;
      aggregationQuery.push({ $sort: sortingOptions });
    }
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

    let debtors = await Debtor.aggregate(aggregationQuery).allowDiskUse(true);

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

    const headers = [];
    for (let i = 0; i < moduleColumn.length; i++) {
      if (debtorColumn.includes(moduleColumn[i].name)) {
        headers.push(moduleColumn[i]);
      }
    }
    response.forEach((debtor) => {
      if (debtorColumn.includes('property')) {
        debtor.property = debtor.address.property;
      }
      if (debtorColumn.includes('unitNumber')) {
        debtor.unitNumber = debtor.address.unitNumber;
      }
      if (debtorColumn.includes('streetNumber')) {
        debtor.streetNumber = debtor.address.streetNumber;
      }
      if (debtorColumn.includes('streetName')) {
        debtor.streetName = debtor.address.streetName;
      }
      if (debtorColumn.includes('streetType')) {
        debtor.streetType = getStreetTypeName(debtor.address.streetType).label;
      }
      if (debtorColumn.includes('suburb')) {
        debtor.suburb = debtor.address.suburb;
      }
      if (debtorColumn.includes('state')) {
        const state = getStateName(
          debtor.address.state,
          debtor.address.country.code,
        );
        debtor.state = state && state.name ? state.name : debtor.address.state;
      }
      if (debtorColumn.includes('country')) {
        debtor.country = debtor.address.country.name;
      }
      if (debtorColumn.includes('postCode')) {
        debtor.postCode = debtor.address.postCode;
      }
      if (debtorColumn.includes('fullAddress')) {
        debtor.fullAddress = getDebtorFullAddress({
          address: debtor.address,
          country: debtor.address.country,
        });
      }
      if (debtor.entityType) {
        debtor.entityType = formatString(debtor.entityType);
      }
      if (debtor.hasOwnProperty('isActive')) {
        debtor.isActive = debtor.isActive ? 'Yes' : 'No';
      }
      delete debtor.address;
      delete debtor.id;
    });
    const debtorResponse = {
      docs: response,
      headers,
      total,
      page: parseInt(requestedQuery.page),
      limit: parseInt(requestedQuery.limit),
      pages: Math.ceil(total / parseInt(requestedQuery.limit)),
      filterArray,
    };
    if (isForDownload) {
      debtorResponse.filterArray = filterArray;
    }
    return debtorResponse;
  } catch (e) {
    Logger.log.error('Error occurred in get debtor list');
    Logger.log.error(e);
  }
};

const checkForExpiringReports = async ({ startDate, endDate }) => {
  try {
    const reports = await CreditReport.find({
      isDeleted: false,
      expiryDate: { $gte: startDate, $lte: endDate },
    }).lean();
    if (reports.length !== 0) {
      const debtorIds = [];
      const stakeholderIds = [];
      reports.forEach((i) => {
        if (i.entityType === 'debtor') {
          debtorIds.push(i.entityId);
        } else {
          stakeholderIds.push(i.entityId);
        }
      });
      if (stakeholderIds.length !== 0) {
        const stakeholders = await DebtorDirector.find({
          _id: { $in: stakeholderIds },
        })
          .select('debtorId')
          .lean();
        if (stakeholders.length !== 0) {
          stakeholders.forEach((i) => {
            debtorIds.push(i.debtorId);
          });
        }
      }
      const clientDebtors = await ClientDebtor.find({
        debtorId: { $in: debtorIds },
      })
        .populate({
          path: 'clientId',
          populate: { path: 'riskAnalystId serviceManagerId' },
        })
        .populate('debtorId')
        .lean();
      const response = [];
      clientDebtors.forEach((i) => {
        if (
          i.clientId &&
          i.clientId.riskAnalystId &&
          i.clientId.riskAnalystId._id &&
          i.debtorId &&
          i.debtorId._id &&
          i.debtorId.entityName
        ) {
          response.push({
            id: i.debtorId._id + i.clientId.riskAnalystId._id,
            debtorId: i.debtorId._id,
            debtorName: i.debtorId.entityName,
            riskAnalystId: i.clientId.riskAnalystId._id,
          });
        }
      });
      const filteredData = Array.from(new Set(response.map((s) => s.id))).map(
        (id) => {
          return {
            id: id,
            debtorId: response.find((i) => i.id === id).debtorId,
            debtorName: response.find((i) => i.id === id).debtorName,
            riskAnalystId: response.find((i) => i.id === id).riskAnalystId,
          };
        },
      );
      console.log(filteredData, 'filteredData');
      for (let i = 0; i < filteredData.length; i++) {
        const notification = await addNotification({
          userId: filteredData[i].riskAnalystId,
          userType: 'user',
          description: `Credit report for ${filteredData[i].debtorName} is expiring today`,
        });
        if (notification) {
          sendNotification({
            notificationObj: {
              type: 'REPORT_EXPIRING',
              data: notification,
            },
            type: notification.userType,
            userId: notification.userId,
          });
        }
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in check for expiring reports');
    Logger.log.error(e.message || e);
  }
};

const checkForReviewDebtor = async ({ endDate }) => {
  try {
    const debtors = await Debtor.find({
      reviewDate: { $lte: endDate },
      // isActive: true,
    }).lean();
    const debtorIds = debtors.map((i) => i._id);
    const clientDebtors = await ClientDebtor.find({
      debtorId: { $in: debtorIds },
    })
      .populate({
        path: 'clientId',
        populate: { path: 'riskAnalystId serviceManagerId' },
      })
      .populate('debtorId')
      .lean();
    const response = [];
    clientDebtors.forEach((i) => {
      if (
        i.clientId &&
        i.clientId.riskAnalystId &&
        i.clientId.riskAnalystId._id &&
        i.debtorId &&
        i.debtorId._id &&
        i.debtorId.entityName
      ) {
        response.push({
          id: i.debtorId._id + i.clientId.riskAnalystId._id,
          debtorId: i.debtorId._id,
          debtorName: i.debtorId.entityName,
          riskAnalystId: i.clientId.riskAnalystId._id,
        });
      }
    });
    const filteredData = Array.from(new Set(response.map((s) => s.id))).map(
      (id) => {
        return {
          id: id,
          debtorId: response.find((i) => i.id === id).debtorId,
          debtorName: response.find((i) => i.id === id).debtorName,
          riskAnalystId: response.find((i) => i.id === id).riskAnalystId,
        };
      },
    );
    console.log(filteredData, 'filteredData');
    for (let i = 0; i < filteredData.length; i++) {
      const notification = await addNotification({
        userId: filteredData[i].riskAnalystId,
        userType: 'user',
        description: `Review Debtor ${filteredData[i].debtorName}`,
      });
      if (notification) {
        sendNotification({
          notificationObj: {
            type: 'REVIEW_DEBTOR',
            data: notification,
          },
          type: notification.userType,
          userId: notification.userId,
        });
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in check for review debtor');
    Logger.log.error(e.message || e);
  }
};

const createTaskOnAlert = async ({ debtorABN, debtorACN }) => {
  try {
    const debtors = await Debtor.find({
      $or: [{ abn: { $in: debtorABN } }, { acn: { $in: debtorACN } }],
    }).lean();
    const debtorIds = debtors.map((i) => i._id);
    const clientDebtors = await ClientDebtor.find({
      debtorId: { $in: debtorIds },
    })
      .populate({
        path: 'clientId',
        populate: { path: 'riskAnalystId' },
      })
      .populate('debtorId')
      .lean();
    const response = [];
    clientDebtors.forEach((i) => {
      if (
        i.clientId &&
        i.clientId.riskAnalystId &&
        i.clientId.riskAnalystId._id &&
        i.debtorId &&
        i.debtorId._id &&
        i.debtorId.entityName
      ) {
        response.push({
          id: i.debtorId._id + i.clientId.riskAnalystId._id,
          debtorId: i.debtorId._id,
          debtorName: i.debtorId.entityName,
          riskAnalystId: i.clientId.riskAnalystId._id,
        });
      }
    });
    const filteredData = Array.from(new Set(response.map((s) => s.id))).map(
      (id) => {
        return {
          id: id,
          debtorId: response.find((i) => i.id === id).debtorId,
          debtorName: response.find((i) => i.id === id).debtorName,
          riskAnalystId: response.find((i) => i.id === id).riskAnalystId,
        };
      },
    );
    console.log(filteredData, 'filteredData');
    const date = new Date();
    for (let i = 0; i < filteredData.length; i++) {
      const data = {
        description: `High/Medium/Low Alert on ${filteredData[i].debtorName}`,
        createdByType: 'user',
        createdById: filteredData[i].riskAnalystId,
        assigneeType: 'user',
        assigneeId: filteredData[i].riskAnalystId,
        dueDate: new Date(date.setDate(date.getDate() + 7)),
        entityType: 'debtor',
        entityId: filteredData[i].debtorId,
      };
      await createTask(data);
      const notification = await addNotification({
        userId: filteredData[i].riskAnalystId,
        userType: 'user',
        description: `High/Medium/Low Alert on ${filteredData[i].debtorName}`,
      });
      if (notification) {
        sendNotification({
          notificationObj: {
            type: 'ALERT',
            data: notification,
          },
          type: notification.userType,
          userId: notification.userId,
        });
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in create task on alert');
    Logger.log.error(e);
  }
};

const updateEntitiesToAlertProfile = async ({ entityList, action }) => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.illionAlert': 1, illionAlertProfile: 1 })
      .lean();
    const lookupType = {
      ABN: 0,
      ACN: 1,
      NCN: 2,
    };
    entityList.forEach((i) => {
      i.lookupMethod = lookupType[i.lookupMethod];
      i.profileId = organization.illionAlertProfile.profileId;
    });
    console.log('entityList :: ', entityList);
    if (action === 'add') {
      await addEntitiesToProfile({
        entities: entityList,
        integration: organization.integration,
      });
    } else if (action === 'remove') {
      await removeEntitiesFromProfile({
        entities: entityList,
        integration: organization.integration,
      });
    }
  } catch (e) {
    Logger.log.error('Error occurred in add entities in alert profile');
    Logger.log.error(e.message || e);
  }
};

module.exports = {
  getDebtorList,
  createDebtor,
  getDebtorFullAddress,
  getStateName,
  getStreetTypeName,
  getDebtorListWithDetails,
  checkDirectorsOfDebtor,
  checkForExpiringReports,
  checkForReviewDebtor,
  createTaskOnAlert,
  updateEntitiesToAlertProfile,
};

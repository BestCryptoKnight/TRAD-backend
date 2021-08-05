/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Organization = mongoose.model('organization');
const Alert = mongoose.model('alert');
const Debtor = mongoose.model('debtor');
const DebtorDirector = mongoose.model('debtor-director');
const ClientDebtor = mongoose.model('client-debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const {
  retrieveAlertList,
  retrieveDetailedAlertList,
  getMonitoredEntities,
} = require('./illion.helper');
const {
  createTaskOnAlert,
  updateEntitiesToAlertProfile,
} = require('./debtor.helper');

const retrieveAlertListFromIllion = async ({ startDate, endDate }) => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.illionAlert': 1, illionAlertProfile: 1 })
      .lean();
    if (
      !organization ||
      !organization.integration ||
      !organization.integration.illionAlert ||
      !organization.integration.illionAlert.userId ||
      !organization.integration.illionAlert.subscriberId ||
      !organization.integration.illionAlert.password
    ) {
      Logger.log.error('ILLION_CREDENTIALS_NOT_PRESENT');
      return { status: 'ERROR', message: 'Illion credentials are not present' };
    }
    const response = await retrieveAlertList({
      startDate,
      endDate,
      illionAlertProfile: organization.illionAlertProfile,
      integration: organization.integration,
    });
    if (response && response.alerts.length !== 0) {
      const debtorABN = [];
      const debtorACN = [];
      const monitoringArray = [];
      response.alerts.forEach((i) => {
        if (i.entity.companyNumbers && i.entity.companyNumbers.duns) {
          monitoringArray.push({ duns: i.entity.companyNumbers.duns });
          i.entity.companyNumbers.abn
            ? debtorABN.push(i.entity.companyNumbers.abn)
            : i.entity.companyNumbers.acn
            ? debtorACN.push(i.entity.companyNumbers.acn)
            : debtorACN.push(i.entity.companyNumbers.ncn);
        }
      });
      const detailedResponse = await retrieveDetailedAlertList({
        startDate,
        endDate,
        monitoringArray,
        illionAlertProfile: organization.illionAlertProfile,
        integration: organization.integration,
      });
      console.log('detailedResponse', detailedResponse);
      //TODO send notification + create a task
      await createTaskOnAlert({ debtorACN, debtorABN });
    }
  } catch (e) {
    Logger.log.error('Error occurred in retrieve alert list from illion');
    Logger.log.error(e);
  }
};

const listEntitySpecificAlerts = async ({
  debtorId,
  requestedQuery,
  alertColumn,
}) => {
  try {
    const debtor = await Debtor.findOne({ _id: debtorId }).lean();
    const entityTypes = ['TRUST', 'PARTNERSHIP'];
    let entityIds = [debtor._id];
    if (debtor && entityTypes.includes(debtor.entityType)) {
      const directors = await DebtorDirector.find({
        debtorId: debtorId,
      }).lean();
      directors.forEach((i) => {
        entityIds.push(i._id);
      });
    }
    const queryFilter = {
      entityId: { $in: entityIds },
    };
    const query = [];
    const fields = alertColumn.map((i) => [i, 1]);
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
    const alerts = await Alert.aggregate(query).allowDiskUse(true);
    const response =
      alerts && alerts[0] && alerts[0]['paginatedResult']
        ? alerts[0]['paginatedResult']
        : alerts;

    const total =
      alerts.length !== 0 &&
      alerts[0]['totalCount'] &&
      alerts[0]['totalCount'].length !== 0
        ? alerts[0]['totalCount'][0]['count']
        : 0;
    const headers = [
      { label: 'Alert Type', name: 'alertType', type: 'string' },
      { label: 'Alert Category', name: 'alertCategory', type: 'string' },
      { label: 'Alert Priority', name: 'alertPriority', type: 'string' },
      { label: 'Alert Date', name: 'createdAt', type: 'date' },
    ];
    return {
      docs: response,
      headers,
      total,
      page: parseInt(requestedQuery.page),
      limit: parseInt(requestedQuery.limit),
      pages: Math.ceil(total / parseInt(requestedQuery.limit)),
    };
  } catch (e) {
    Logger.log.error('Error occurred in get list of alerts');
    Logger.log.error(e);
  }
};

const getAlertDetail = async ({ alertId }) => {
  try {
    const alert = await Alert.findOne({ _id: alertId }).lean();
    if (!alert) {
      return {
        status: 'ERROR',
        messageCode: 'NO_ALERT_FOUND',
        message: 'No alert found',
      };
    }
    const response = {
      priority: alert.alertPriority,
      name: alert.companyName,
      generalDetails: [
        { label: 'Name', value: alert.companyName, type: 'string' },
        { label: 'Alert Date', value: alert.createdAt, type: 'date' },
        { label: 'Alert Trigger', value: alert.alertType, type: 'string' },
        { label: 'Source', value: 'Illion Monitoring Alert', type: 'string' },
        {
          label: 'Account No',
          value: alert.companyNumbers.duns,
          type: 'string',
        },
      ],
      alertDetails: [],
    };
    if (alert.companyNumbers.ncn) {
      response.generalDetails.push({
        label: 'NCN',
        value: alert.companyNumbers.ncn,
        type: 'string',
      });
    } else {
      response.generalDetails.push(
        { label: 'ACN', value: alert.companyNumbers.acn, type: 'string' },
        { label: 'ABN', value: alert.companyNumbers.abn, type: 'string' },
      );
    }
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in get alert details');
    Logger.log.error(e);
  }
};

const addEntitiesToAlertProfile = async ({ debtorId }) => {
  try {
    const debtor = await Debtor.findOne({ _id: debtorId }).lean();
    const entityList = [];
    if (
      debtor.address.country.code === 'AUS' ||
      debtor.address.country.code === 'NZL'
    ) {
      const response = await getMonitoredEntities();
      if (
        debtor.entityType !== 'TRUST' &&
        debtor.entityType !== 'PARTNERSHIP'
      ) {
        const lookupMethod =
          debtor.address.country.code === 'NZL'
            ? 'NCN'
            : debtor.abn
            ? 'ABN'
            : 'ACN';
        const lookupValue =
          debtor.address.country.code === 'NZL'
            ? debtor.acn
            : debtor.abn
            ? debtor.abn
            : debtor.acn;
        if (lookupValue) {
          const foundEntity = response.monitoredEntities.find((i) => {
            return i.companyNumbers[lookupMethod.toLowerCase()] === lookupValue;
          });
          if (!foundEntity) {
            entityList.push({
              lookupMethod: lookupMethod,
              lookupValue: lookupValue,
            });
          }
        }
      } else {
        const stakeholders = await DebtorDirector.find({
          debtorId: debtor._id,
          isDeleted: false,
          type: 'company',
        }).lean();
        for (let i = 0; i < stakeholders.length; i++) {
          if (
            stakeholders[i].country.code === 'AUS' ||
            stakeholders[i].country.code === 'NZL'
          ) {
            const lookupMethod =
              stakeholders[i].country.code === 'NZL'
                ? 'NCN'
                : stakeholders[i].abn
                ? 'ABN'
                : 'ACN';
            const lookupValue =
              stakeholders[i].country.code === 'NZL'
                ? stakeholders[i].acn
                : stakeholders[i].abn
                ? stakeholders[i].abn
                : stakeholders[i].acn;
            if (lookupValue) {
              const foundEntity = response.monitoredEntities.find((i) => {
                return (
                  i.companyNumbers[lookupMethod.toLowerCase()] === lookupValue
                );
              });
              if (!foundEntity) {
                entityList.push({
                  lookupMethod: lookupMethod,
                  lookupValue: lookupValue,
                });
              }
            }
          }
        }
      }
      if (entityList.length !== 0) {
        console.log('entityList ::', entityList);
        updateEntitiesToAlertProfile({ entityList, action: 'add' });
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in add entity in alert profile');
    Logger.log.error(e);
  }
};

const checkForEntityInProfile = async ({ entityType, entityId, action }) => {
  try {
    const response = await getMonitoredEntities();
    let lookupMethod;
    let lookupValue;
    if (entityType === 'debtor') {
      const debtor = await Debtor.findOne({ _id: entityId }).lean();
      if (
        debtor.address.country.code === 'AUS' ||
        debtor.address.country.code === 'NZL'
      ) {
        lookupMethod =
          debtor.address.country.code === 'NZL'
            ? 'NCN'
            : debtor.abn
            ? 'ABN'
            : 'ACN';
        lookupValue =
          debtor.address.country.code === 'NZL'
            ? debtor.acn
            : debtor.abn
            ? debtor.abn
            : debtor.acn;
        if (action === 'remove') {
          const creditLimit = await ClientDebtor.findOne({
            isActive: true,
            debtorId: debtor._id,
          }).lean();
          if (!creditLimit) {
            if (
              debtor.entityType !== 'TRUST' &&
              debtor.entityType !== 'PARTNERSHIP'
            ) {
              updateEntitiesToAlertProfile({
                entityList: [
                  {
                    lookupMethod: lookupMethod,
                    lookupValue: lookupValue,
                  },
                ],
                action,
              });
            } else {
              const stakeholders = await DebtorDirector.find({
                debtorId: debtor._id,
                isDeleted: false,
                type: 'company',
              }).lean();
              for (let i = 0; i < stakeholders.length; i++) {
                if (
                  stakeholders[i].country.code === 'AUS' ||
                  stakeholders[i].country.code === 'NZL'
                ) {
                  await checkForEntityInProfile({
                    action,
                    entityId: stakeholders[i]._id,
                    entityType: 'stakeholder',
                  });
                }
              }
            }
          }
        }
      }
    } else if (entityType === 'stakeholder') {
      const stakeholder = await DebtorDirector.findOne({
        _id: entityId,
      }).lean();
      if (
        stakeholder.country.code === 'AUS' ||
        stakeholder.country.code === 'NZL'
      ) {
        lookupMethod =
          stakeholder.country.code === 'NZL'
            ? 'NCN'
            : stakeholder.abn
            ? 'ABN'
            : 'ACN';
        lookupValue =
          stakeholder.country.code === 'NZL'
            ? stakeholder.acn
            : stakeholder.abn
            ? stakeholder.abn
            : stakeholder.acn;
        if (action === 'add') {
          if (lookupValue) {
            const foundEntity = filterEntity({
              monitoredEntities: response.monitoredEntities,
              lookupValue,
              lookupMethod,
            });
            if (!foundEntity) {
              updateEntitiesToAlertProfile({
                entityList: [
                  {
                    lookupMethod: lookupMethod,
                    lookupValue: lookupValue,
                  },
                ],
                action,
              });
            }
          }
        } else {
          const query = stakeholder.abn
            ? { abn: stakeholder.abn }
            : { acn: stakeholder.acn };
          const anotherStakeholder = await DebtorDirector.findOne(query).lean();
          if (!anotherStakeholder) {
            updateEntitiesToAlertProfile({
              entityList: [
                {
                  lookupMethod: lookupMethod,
                  lookupValue: lookupValue,
                },
              ],
              action,
            });
          }
        }
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in check entity in alert profile');
    Logger.log.error(e);
  }
};

const filterEntity = ({ monitoredEntities, lookupMethod, lookupValue }) => {
  try {
    const foundEntity = monitoredEntities.find((i) => {
      return i.companyNumbers[lookupMethod.toLowerCase()] === lookupValue;
    });
    return foundEntity;
  } catch (e) {
    Logger.log.error('Error occurred in filter entity from list');
    Logger.log.error(e);
  }
};

module.exports = {
  retrieveAlertListFromIllion,
  listEntitySpecificAlerts,
  getAlertDetail,
  addEntitiesToAlertProfile,
  checkForEntityInProfile,
};

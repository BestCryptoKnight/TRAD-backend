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
const { updateEntitiesToAlertProfile } = require('./debtor.helper');
const StaticData = require('./../static-files/staticData.json');
const { addNotification } = require('./notification.helper');
const { sendNotification } = require('./socket.helper');
const { createTask } = require('./task.helper');

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
    let response = await retrieveAlertList({
      startDate,
      endDate,
      illionAlertProfile: organization.illionAlertProfile,
      integration: organization.integration,
    });
    if (response && response.alerts.length !== 0) {
      const alertList = [];
      let companyDetails = {};
      let usedFields = {};
      let alertResponse = {};
      for (let i = 0; i < response.alerts.length; i++) {
        let detailedResponse = await retrieveDetailedAlertList({
          startDate,
          endDate,
          monitoringArray: [
            { duns: response.alerts[i].entity.companyNumbers.duns },
          ],
          illionAlertProfile: organization.illionAlertProfile,
          integration: organization.integration,
        });
        console.log('detailedResponse', detailedResponse);
        if (
          detailedResponse?.detailedAlerts &&
          detailedResponse.detailedAlerts.length !== 0
        ) {
          for (let j = 0; j < detailedResponse.detailedAlerts.length; j++) {
            detailedResponse.detailedAlerts[j] = JSON.parse(
              JSON.stringify(detailedResponse.detailedAlerts[j]),
            );
            usedFields = {};
            for (let k = 0; k < response.alerts[i].alerts.length; k++) {
              companyDetails = {};
              companyDetails['companyNumbers'] =
                detailedResponse.detailedAlerts[j]['companyNumbers'];
              companyDetails['companyName'] =
                detailedResponse.detailedAlerts[j]['companyName'];
              companyDetails['countryCode'] =
                detailedResponse.detailedAlerts[j]['countryCode'];
              const alertDetails =
                StaticData.AlertList[response.alerts[i].alerts[k].alertId];
              if (
                alertDetails?.fieldName &&
                detailedResponse.detailedAlerts[j][alertDetails.fieldName]
                  .length !== 0 &&
                !usedFields[alertDetails.fieldName]
              ) {
                usedFields[alertDetails?.fieldName] = true;
                for (
                  let l = 0;
                  l <
                  detailedResponse.detailedAlerts[j][alertDetails.fieldName]
                    .length;
                  l++
                ) {
                  alertResponse = {};

                  for (let key in detailedResponse.detailedAlerts[j][
                    alertDetails.fieldName
                  ][l]['alertDetails']) {
                    alertResponse[key] =
                      detailedResponse.detailedAlerts[j][
                        alertDetails.fieldName
                      ][l]['alertDetails'][key];
                  }
                  alertResponse[alertDetails.fieldName] =
                    detailedResponse.detailedAlerts[j][alertDetails.fieldName][
                      l
                    ];

                  alertResponse = Object.assign(
                    {},
                    companyDetails,
                    alertResponse,
                  );

                  alertList.push(alertResponse);
                }
              }
            }
          }
        }
      }
      const mappedResponse = await mapEntityToAlert({ alertList });
      await createTaskOnAlert({ alertList: mappedResponse });
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
      return Promise.reject({
        status: 'ERROR',
        messageCode: 'NO_ALERT_FOUND',
        message: 'No alert found',
      });
    }
    const alertDetails = StaticData.AlertList[alert.alertId];
    const response = {
      priority: alert?.alertPriority,
      name: alert?.companyName,
      generalDetails: [
        { label: 'Name', value: alert?.companyName, type: 'string' },
        { label: 'Alert Date', value: alert?.createdAt, type: 'date' },
        { label: 'Alert Trigger', value: alert?.alertType, type: 'string' },
        { label: 'Source', value: 'Illion Monitoring Alert', type: 'string' },
        {
          label: 'Account No',
          value: alert?.companyNumbers.duns,
          type: 'string',
        },
      ],
      alertDetails: [],
    };
    if (alertDetails?.fieldName && alert[alertDetails.fieldName]) {
      for (let key of alertDetails.alertFields) {
        response.alertDetails.push({
          label:
            key.charAt(0).toUpperCase() +
            key
              .substr(1)
              .replace(/([A-Z])/g, ' $1')
              .trim(),
          value: alert[alertDetails.fieldName][key],
          type: StaticData.AlertFieldTypes[key] || 'string',
        });
      }
    }
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
    const entityList = [];
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
        if (action === 'add') {
          if (
            debtor.entityType !== 'TRUST' &&
            debtor.entityType !== 'PARTNERSHIP'
          ) {
            if (lookupValue) {
              const foundEntity = response.monitoredEntities.find((i) => {
                return (
                  i.companyNumbers[lookupMethod.toLowerCase()] === lookupValue
                );
              });
              if (!foundEntity) {
                /*updateEntitiesToAlertProfile({
                  entityList: [
                    {
                      lookupMethod: lookupMethod,
                      lookupValue: lookupValue,
                    },
                  ],
                  action: 'add',
                });*/
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
                lookupMethod =
                  stakeholders[i].country.code === 'NZL'
                    ? 'NCN'
                    : stakeholders[i].abn
                    ? 'ABN'
                    : 'ACN';
                lookupValue =
                  stakeholders[i].country.code === 'NZL'
                    ? stakeholders[i].acn
                    : stakeholders[i].abn
                    ? stakeholders[i].abn
                    : stakeholders[i].acn;
                if (lookupValue) {
                  const foundEntity = response.monitoredEntities.find((i) => {
                    return (
                      i.companyNumbers[lookupMethod.toLowerCase()] ===
                      lookupValue
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
        } else {
          const creditLimit = await ClientDebtor.findOne({
            isActive: true,
            debtorId: debtor._id,
          }).lean();
          if (!creditLimit) {
            if (
              debtor.entityType !== 'TRUST' &&
              debtor.entityType !== 'PARTNERSHIP'
            ) {
              /*updateEntitiesToAlertProfile({
                entityList: [
                  {
                    lookupMethod: lookupMethod,
                    lookupValue: lookupValue,
                  },
                ],
                action,
              });*/
              entityList.push({
                lookupMethod: lookupMethod,
                lookupValue: lookupValue,
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
              /*updateEntitiesToAlertProfile({
                entityList: [
                  {
                    lookupMethod: lookupMethod,
                    lookupValue: lookupValue,
                  },
                ],
                action,
              });*/
              entityList.push({
                lookupMethod: lookupMethod,
                lookupValue: lookupValue,
              });
            }
          }
        } else {
          const query = stakeholder.abn
            ? { abn: stakeholder.abn }
            : { acn: stakeholder.acn };
          const anotherStakeholder = await DebtorDirector.findOne(query).lean();
          if (!anotherStakeholder) {
            /* updateEntitiesToAlertProfile({
              entityList: [
                {
                  lookupMethod: lookupMethod,
                  lookupValue: lookupValue,
                },
              ],
              action,
            });*/
            entityList.push({
              lookupMethod: lookupMethod,
              lookupValue: lookupValue,
            });
          }
        }
      }
    }
    if (entityList.length !== 0) {
      console.log('entityList ::', entityList);
      updateEntitiesToAlertProfile({ entityList, action });
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

const mapEntityToAlert = async ({ alertList }) => {
  try {
    let query = {};
    const promises = [];
    for (let i = 0; i < alertList.length; i++) {
      console.log(alertList[i]);
      query = {};
      query[
        alertList[i].companyNumbers?.abn
          ? 'abn'
          : alertList[i].companyNumbers.acn
          ? 'acn'
          : 'abn'
      ] = alertList[i].companyNumbers.abn
        ? alertList[i].companyNumbers.abn
        : alertList[i].companyNumbers.acn
        ? alertList[i].companyNumbers.acn
        : alertList[i].companyNumbers.ncn;
      const [debtor, stakeholder] = await Promise.all([
        Debtor.findOne(query).select('_id').lean(),
        DebtorDirector.findOne(query).select('_id debtorId').lean(),
      ]);
      alertList[i].entityId = stakeholder ? stakeholder?._id : debtor?._id;
      alertList[i].entityType = stakeholder ? 'debtor-director' : 'debtor';
      alertList[i].debtorId = stakeholder ? stakeholder?.debtorId : null;
      promises.push(Alert.create(alertList[i]));
    }
    const response = await Promise.all(promises);
    console.log(JSON.stringify(response, null, 3));
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in map entity to alerts');
    Logger.log.error(e);
  }
};

const createTaskOnAlert = async ({ alertList }) => {
  try {
    let debtor;
    let clientDebtors;
    const response = [];
    for (let index = 0; index < alertList.length; index++) {
      if (alertList[index].entityType === 'debtor') {
        debtor = await Debtor.findOne({
          _id: alertList[index].entityId,
        }).lean();
      } else {
        const stakeholder = await DebtorDirector.findOne({
          _id: alertList[index].entityId,
        })
          .populate('debtorId')
          .lean();
        debtor = stakeholder?.debtorId;
      }
      clientDebtors = await ClientDebtor.find({ debtorId: debtor?._id })
        .populate({
          path: 'clientId',
          populate: { path: 'riskAnalystId' },
        })
        .populate('debtorId')
        .lean();
      clientDebtors?.forEach((i) => {
        if (
          i?.clientId?.riskAnalystId?._id &&
          i?.debtorId?._id &&
          i?.debtorId?.entityName
        ) {
          response.push({
            id:
              i.debtorId._id +
              i.clientId.riskAnalystId._id +
              +alertList[index]._id,
            debtorId: i.debtorId._id,
            debtorName: i.debtorId.entityName,
            riskAnalystId: i.clientId.riskAnalystId._id,
            alertPriority: alertList[index].alertPriority,
            alertCategory: alertList[index].alertCategory,
            alertId: alertList[index]._id,
            alertTypeId: alertList[index].alertId,
          });
        }
      });
    }

    const filteredData = Array.from(new Set(response.map((s) => s.id))).map(
      (id) => {
        return {
          id: id,
          debtorId: response.find((i) => i.id === id).debtorId,
          debtorName: response.find((i) => i.id === id).debtorName,
          riskAnalystId: response.find((i) => i.id === id).riskAnalystId,
          alertPriority: response.find((i) => i.id === id).alertPriority,
          alertCategory: response.find((i) => i.id === id).alertCategory,
          alertTypeId: response.find((i) => i.id === id).alertTypeId,
          alertId: response.find((i) => i.id === id).alertId,
        };
      },
    );
    console.log(filteredData, 'filteredData');
    const date = new Date();
    for (let i = 0; i < filteredData.length; i++) {
      const data = {
        description: `${filteredData[i].alertPriority} alert on ${filteredData[i].debtorName}`,
        // createdByType: 'user',
        // createdById: filteredData[i].riskAnalystId,
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
        description: data.description,
        entityId: filteredData[i]?.alertId,
        entityType: 'alert',
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

module.exports = {
  retrieveAlertListFromIllion,
  listEntitySpecificAlerts,
  getAlertDetail,
  addEntitiesToAlertProfile,
  checkForEntityInProfile,
};

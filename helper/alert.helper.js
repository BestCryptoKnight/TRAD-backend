/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Organization = mongoose.model('organization');
const Alert = mongoose.model('alert');
const Debtor = mongoose.model('debtor');
const DebtorDirector = mongoose.model('debtor-director');
const ClientDebtor = mongoose.model('client-debtor');
const fs = require('fs');

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
const {
  getEntityDetailsByABN,
  getEntityDetailsByACN,
  getEntityListByNameFromNZBN,
} = require('./abr.helper');

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
    if (response && response?.alerts?.length !== 0) {
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
        Logger.log.info(
          'Detailed Alert Response',
          JSON.stringify(detailedResponse, null, 2),
        );
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
    query.push({ $sort: { createdAt: -1 } });
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
        const value =
          key === 'defendantAddress'
            ? alert[alertDetails.fieldName][key]?.['unformattedAddress']
            : alert[alertDetails.fieldName][key];
        response.alertDetails.push({
          label:
            key.charAt(0).toUpperCase() +
            key
              .substr(1)
              .replace(/([A-Z])/g, ' $1')
              .trim(),
          value: value || '',
          type: StaticData.AlertFieldTypes[key] || 'string',
        });
      }
      response.alertDetails.push({
        label: 'Status',
        value: alert.status ?? 'Pending',
        type: 'string',
      })
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

let entityList = [];
//TODO remove import applications
const addEntitiesToAlertProfile = async ({
  entityType,
  entityId,
  action,
  entityData = null,
  unProcessed,
  response,
  clientDebtorId,
  isLastCall,
}) => {
  try {
    // const response = await getMonitoredEntities();
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
        if (action === 'add') {
          const valid = await checkForValidEntity({
            lookupValue,
            lookupMethod,
          });
          if (valid) {
            if (
              debtor.entityType !== 'TRUST' &&
              debtor.entityType !== 'PARTNERSHIP'
            ) {
              if (lookupValue) {
                let foundEntity;
                if (response && response?.monitoredEntities?.length !== 0) {
                  foundEntity = filterEntity({
                    monitoredEntities: response.monitoredEntities,
                    lookupValue,
                    lookupMethod,
                  });
                }
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
              if (stakeholders.length !== 0) {
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
                      let foundEntity;
                      if (
                        response &&
                        response?.monitoredEntities?.length !== 0
                      ) {
                        foundEntity = filterEntity({
                          monitoredEntities: response.monitoredEntities,
                          lookupValue,
                          lookupMethod,
                        });
                      }
                      if (!foundEntity) {
                        entityList.push({
                          lookupMethod: lookupMethod,
                          lookupValue: lookupValue,
                        });
                      }
                    }
                  }
                }
              } else {
                unProcessed.push({
                  entityType,
                  entityId,
                  reason: 'No stakeholder found',
                });
              }
            }
          } else {
            unProcessed.push({
              entityType,
              entityId,
              reason: 'Invalid lookup value',
              request: {
                lookupMethod: lookupMethod,
                lookupValue: lookupValue,
              },
            });
          }
        } else {
          if (
            debtor.entityType !== 'TRUST' &&
            debtor.entityType !== 'PARTNERSHIP'
          ) {
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
    } else if (entityType === 'stakeholder') {
      let stakeholder;
      if (entityData) {
        stakeholder = entityData;
      } else {
        stakeholder = await DebtorDirector.findOne({
          _id: entityId,
        }).lean();
      }
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
            let foundEntity;
            if (response && response?.monitoredEntities?.length !== 0) {
              foundEntity = filterEntity({
                monitoredEntities: response.monitoredEntities,
                lookupValue,
                lookupMethod,
              });
            }
            if (!foundEntity) {
              entityList.push({
                lookupMethod: lookupMethod,
                lookupValue: lookupValue,
              });
            }
          }
        } else {
          const query = stakeholder?.abn
            ? { abn: stakeholder.abn, isDeleted: false }
            : { acn: stakeholder.acn, isDeleted: false };
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
    if (entityList.length === 1000 || isLastCall) {
      const responseData = await updateEntitiesToAlertProfile({
        entityList,
        action,
      });
      entityList = [];
      return responseData;
    } else {
      return clientDebtorId;
    }
  } catch (e) {
    Logger.log.error('Error occurred in check entity in alert profile');
    Logger.log.error(e);
  }
};

/*
Add Entity into Alert Profile
 */
const checkForEntityInProfile = async ({
  entityType,
  entityId,
  action,
  entityData = null,
  clientDebtorId,
}) => {
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
              let foundEntity;
              if (response && response?.monitoredEntities?.length !== 0) {
                foundEntity = filterEntity({
                  monitoredEntities: response.monitoredEntities,
                  lookupValue,
                  lookupMethod,
                });
              }
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
                  let foundEntity;
                  if (response && response?.monitoredEntities?.length !== 0) {
                    foundEntity = filterEntity({
                      monitoredEntities: response.monitoredEntities,
                      lookupValue,
                      lookupMethod,
                    });
                  }
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
          const hasActiveCreditLimit = await checkForActiveCreditLimit({
            debtorId: debtor._id,
          });
          if (!hasActiveCreditLimit) {
            if (
              debtor.entityType !== 'TRUST' &&
              debtor.entityType !== 'PARTNERSHIP'
            ) {
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
      let stakeholder;
      if (entityData) {
        stakeholder = entityData;
      } else {
        stakeholder = await DebtorDirector.findOne({
          _id: entityId,
        }).lean();
      }
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
            let foundEntity;
            if (response && response?.monitoredEntities?.length !== 0) {
              foundEntity = filterEntity({
                monitoredEntities: response.monitoredEntities,
                lookupValue,
                lookupMethod,
              });
            }
            if (!foundEntity) {
              entityList.push({
                lookupMethod: lookupMethod,
                lookupValue: lookupValue,
              });
            }
          }
        } else {
          const query = stakeholder?.abn
            ? { abn: stakeholder.abn, isDeleted: false }
            : { acn: stakeholder.acn, isDeleted: false };
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
            let foundEntity;
            if (response && response?.monitoredEntities?.length !== 0) {
              foundEntity = filterEntity({
                monitoredEntities: response.monitoredEntities,
                lookupValue,
                lookupMethod,
              });
            }
            if (foundEntity) {
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
      updateEntitiesToAlertProfile({ entityList, action });
    }
  } catch (e) {
    Logger.log.error('Error occurred in check entity in alert profile');
    Logger.log.error(e);
  }
};

const filterEntity = ({ monitoredEntities, lookupMethod, lookupValue }) => {
  try {
    const foundEntity = monitoredEntities?.find((i) => {
      return (
        i.companyNumbers[lookupMethod.toLowerCase()]?.toString() ===
        lookupValue.toString()
      );
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
      query = {};
      query[alertList[i].companyNumbers?.abn ? 'abn' : 'acn'] = alertList[i]
        .companyNumbers.abn
        ? alertList[i].companyNumbers.abn?.toString()
        : alertList[i].companyNumbers.acn
          ? alertList[i].companyNumbers.acn?.toString()?.length !== 0
            ? alertList[i].companyNumbers.acn?.toString().padStart(9, '0')
            : alertList[i].companyNumbers.acn?.toString()
          : alertList[i].companyNumbers.ncn?.toString();
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
    Logger.log.info(
      'Entity mapped to Alert Profile',
      JSON.stringify(response, null, 2),
    );
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
        priority: 'URGENT',
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

/*
Check for active credit limit
 */
const checkForActiveCreditLimit = async ({ debtorId }) => {
  try {
    const creditLimit = await ClientDebtor.findOne({
      // isActive: true,
      debtorId: debtorId,
      status: { $exists: true, $in: ['APPROVED'] },
      // $and: [
      //   { creditLimit: { $exists: true } },
      //   { creditLimit: { $ne: null } },
      //   { creditLimit: { $ne: 0 } },
      // ],
      // creditLimit: { $exists: true, $ne: null },
    }).lean();
    return !!creditLimit;
  } catch (e) {
    Logger.log.error(
      'Error occurred in check for active credit limit',
      e.message || e,
    );
    return Promise.reject(e.message || e);
  }
};

const addImportApplicationEntitiesToProfile = async () => {
  try {
    const response = await getMonitoredEntities();
    const unProcessed = [];
    const processed = [];
    const creditLimits = await ClientDebtor.find({
      isActive: true,
      $and: [
        { creditLimit: { $exists: true } },
        { creditLimit: { $ne: null } },
        { creditLimit: { $ne: 0 } },
      ],
      isEndorsedLimit: false,
    }).lean();
    for (let i = 0; i < creditLimits.length; i++) {
      const data = await addEntitiesToAlertProfile({
        entityType: 'debtor',
        action: 'add',
        entityId: creditLimits[i]?.debtorId,
        unProcessed,
        response,
        clientDebtorId: creditLimits[i]?._id,
        isLastCall: i === creditLimits.length,
      });
      processed.push(data);
      Logger.log.trace(
        'Entity added successfully..',
        creditLimits[i]?.debtorId,
        'index',
        i,
        'Entity length',
        entityList.length,
      );
    }
    Logger.log.trace('UnProcessed', JSON.stringify(unProcessed, null, 3));
    fs.writeFileSync('alert-response.json', JSON.stringify(processed, null, 3));
  } catch (e) {
    Logger.log.error('Error occurred in add entities to alert profile', e);
  }
};

const checkForValidEntity = async ({ lookupValue, lookupMethod }) => {
  try {
    let valid = false;
    let entityData;
    if (lookupMethod === 'ABN') {
      entityData = await getEntityDetailsByABN({ searchString: lookupValue });
      if (entityData && entityData?.response?.businessEntity202001) {
        valid = true;
      }
    } else if (lookupMethod === 'ACN') {
      entityData = await getEntityDetailsByACN({ searchString: lookupValue });
      if (entityData && entityData?.response?.businessEntity201408) {
        valid = true;
      }
    } else if (lookupMethod === 'NCN') {
      entityData = await getEntityListByNameFromNZBN({
        searchString: lookupValue,
      });
      let identifiedData = {};
      if (entityData && entityData.items && entityData.items.length !== 0) {
        for (let i = 0; i < entityData.items.length; i++) {
          if (
            entityData.items[i].sourceRegisterUniqueId &&
            entityData.items[i].sourceRegisterUniqueId === lookupValue
          ) {
            identifiedData = entityData.items[i];
            break;
          }
        }
        if (identifiedData?.nzbn) {
          valid = true;
        }
      }
    }
    return valid;
  } catch (e) {
    Logger.log.error('Error occurred in check for valid entity');
    Logger.log.error(e);
  }
};

const getClientAlertList = async ({
  hasFullAccess = false,
  clientId,
  reportColumn,
  requestedQuery,
  isForDownload = false,
}) => {
  try {
    const queryFilter = {};
    let query = [];
    query.push({
      $match: {
        status: 'Processed',
      },
    });
    query.push({
      $sort: { 'alertDate': -1 }
    });
    const facetQuery = [];
    let creditLimits;
    let debtorProject = {};
    const mapClientNames = {};
    const filterArray = [];

    reportColumn.push('alertId');
    const isDescriptionFieldSelected = reportColumn.includes('description');
    const isClientFieldSelected = reportColumn.includes('clientName');
    const isABNFieldSelected = reportColumn.includes('abn');
    const isACNFieldSelected = reportColumn.includes('acn');
    const isDebtorFieldSelected = reportColumn.includes('debtorName');

    if (
      !hasFullAccess ||
      reportColumn.includes('clientName')
    ) {
      creditLimits = await ClientDebtor.find({ clientId: clientId })
        .select('debtorId clientId')
        .populate({ path: 'clientId', select: '_id name' })
        .lean();
      const debtorIds = creditLimits.map((i) => i.debtorId);
      queryFilter.entityId = { $in: debtorIds };

      creditLimits.forEach((creditLimit) => {
        if (!mapClientNames[creditLimit.debtorId]) {
          mapClientNames[creditLimit.debtorId] = [];
        }
        mapClientNames[creditLimit.debtorId].push(creditLimit.clientId?.name);
      });
    }

    let dateQuery = {};
    if (requestedQuery.startDate || requestedQuery.endDate) {
      if (requestedQuery.startDate) {
        dateQuery = {
          $gte: new Date(requestedQuery.startDate),
        };
      }
      if (requestedQuery.endDate) {
        dateQuery = Object.assign({}, dateQuery, {
          $lte: new Date(requestedQuery.endDate),
        });
      }
      queryFilter.alertDate = dateQuery;
    }

    if (requestedQuery.alertPriority) {
      queryFilter.alertPriority = requestedQuery.alertPriority;
    }
    if (requestedQuery.alertType) {
      queryFilter.alertType = requestedQuery.alertType;
    }

    const fields = reportColumn.map((i) => {
      return [i, 1];
    });

    if (
      reportColumn.includes('debtorName') ||
      reportColumn.includes('abn') ||
      reportColumn.includes('acn') ||
      reportColumn.includes('clientName')
    ) {
      facetQuery.push(
        {
          $lookup: {
            from: 'debtors',
            localField: 'entityId',
            foreignField: '_id',
            as: 'debtor',
          },
        },
        {
          $lookup: {
            from: 'debtor-directors',
            localField: 'entityId',
            foreignField: 'debtorId',
            as: 'debtorDirector',
          },
        },
        {
          $lookup: {
            from: 'debtors',
            localField: 'debtorDirector.debtorId',
            foreignField: '_id',
            as: 'debtorOfDirector',
          },
        },
        {
          $unwind: {
            path: '$debtor',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: '$debtorOfDirector',
            preserveNullAndEmptyArrays: true,
          },
        },
      );

      debtorProject = {
        debtorDetails: {
          $cond: {
            if: { $eq: ['$entityType', 'debtor-director'] },
            then: '$debtorOfDirector',
            else: '$debtor',
          },
        },
      };
    }

    const projectFields = fields.reduce((obj, [key, val]) => {
      obj[key] = val;
      return obj;
    }, {});
    facetQuery.push({
      $project: { ...debtorProject, ...projectFields },
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
            ...facetQuery,
          ],
          totalCount: [
            {
              $count: 'count',
            },
          ],
        },
      });
    } else {
      query.push({
        $facet: {
          paginatedResult: [
            ...facetQuery,
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
    response.forEach((alert) => {
      if (isDescriptionFieldSelected) {
        alert.description = StaticData.AlertList[alert.alertId].description;
      }
      if (isClientFieldSelected) {
        if (alert.entityId) {
          alert.clientName = mapClientNames[alert.entityId]?.join(', ') || '';
        } else {
          alert.clientName =
            mapClientNames[alert.debtorDetails?._id]?.join(', ') || '';
        }
      }
      if (isABNFieldSelected) {
        alert.abn = alert.debtorDetails?.abn;
      }
      if (isACNFieldSelected) {
        alert.acn = alert.debtorDetails?.acn;
      }
      if (isDebtorFieldSelected) {
        if (alert.companyName) {
          alert.debtorName = alert.companyName;
        } else {
          alert.debtorName = alert.debtorDetails?.entityName;
        }
      }
      delete alert.alertId;
      delete alert.debtorDetails;
    });
    return { response, total, filterArray };
  } catch (e) {
    Logger.log.error('Error occurred in get alert report');
    Logger.log.error(e.message || e);
  }
};

module.exports = {
  retrieveAlertListFromIllion,
  listEntitySpecificAlerts,
  getAlertDetail,
  addEntitiesToAlertProfile,
  checkForEntityInProfile,
  checkForActiveCreditLimit,
  addImportApplicationEntitiesToProfile,
  getClientAlertList,
};

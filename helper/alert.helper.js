/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Organization = mongoose.model('organization');
const Alert = mongoose.model('alert');
const Debtor = mongoose.model('debtor');
const DebtorDirector = mongoose.model('debtor-director');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const {
  retrieveAlertList,
  retrieveDetailedAlertList,
} = require('./illion.helper');
const { createTaskOnAlert } = require('./debtor.helper');

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
    return alert;
  } catch (e) {
    Logger.log.error('Error occurred in get alert details');
    Logger.log.error(e);
  }
};

module.exports = {
  retrieveAlertListFromIllion,
  listEntitySpecificAlerts,
  getAlertDetail,
};

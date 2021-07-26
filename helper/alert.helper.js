/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Organization = mongoose.model('organization');
const Alert = mongoose.model('alert');

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

module.exports = { retrieveAlertListFromIllion };

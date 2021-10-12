/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Policy = mongoose.model('policy');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

const getPolicyDetails = ({ policyData, isForRisk = true }) => {
  try {
    let policyColumns = [
      { name: 'clientId', label: 'Client Name', type: 'string' },
      { name: 'insurerId', label: 'Insurer Name', type: 'string' },
      {
        name: 'product',
        label: 'Product',
        type: 'string',
      },
      { name: 'policyPeriod', label: 'Policy Period', type: 'string' },
      { name: 'policyCurrency', label: 'Policy Currency', type: 'string' },
      { name: 'policyNumber', label: 'Policy Number', type: 'string' },
      { name: 'crmNote', label: 'CRM Note', type: 'string' },
      {
        name: 'brokersCommission',
        label: 'Brokers Commission',
        type: 'dollar',
      },
      { name: 'tcrServiceFee', label: 'TCR Service Fee', type: 'dollar' },
      { name: 'rmpFee', label: 'RMP Fee', type: 'dollar' },
      {
        name: 'noOfMonitoredAccounts',
        label: 'No Of Monitored Accounts',
        type: 'string',
      },
      { name: 'noOfResChecks', label: 'No Of RES Checks', type: 'string' },
      { name: 'premiumFunder', label: 'Premium Funder', type: 'string' },
      { name: 'premiumRate', label: 'Premium Rate', type: 'percent' },
      {
        name: 'estimatedPremium',
        label: 'Estimated Premium',
        type: 'dollar',
      },
      { name: 'minimumPremium', label: 'Minimum Premium', type: 'dollar' },
      {
        name: 'approvedCountries',
        label: 'Approved Countries',
        type: 'string',
      },
      { name: 'indemnityLevel', label: 'Indemnity Level', type: 'string' },
      { name: 'maxSumInsured', label: 'Max Sum Insured', type: 'dollar' },
      {
        name: 'discretionaryLimit',
        label: 'Discretionary Limit',
        type: 'dollar',
      },
      {
        name: 'creditChecks',
        label: 'Credit Checks',
        type: 'string',
      },
      {
        name: 'healthChecks',
        label: 'Health Checks',
        type: 'string',
      },
      {
        name: 'alerts247',
        label: '24/7 Alerts',
        type: 'string',
      },
      {
        name: 'nzCreditChecks',
        label: 'NZ Credit Checks',
        type: 'string',
      },
      {
        name: 'overdueReportingLimit',
        label: 'Overdue Reporting Limit',
        type: 'string',
      },
      { name: 'termsOfPayment', label: 'Terms Of Payment', type: 'string' },
      {
        name: 'maximumExtensionPeriod',
        label: 'Maximum Extension Period',
        type: 'string',
      },
      {
        name: 'maximumInvoicingPeriod',
        label: 'Maximum Invoicing Period',
        type: 'string',
      },
      { name: 'threshold', label: 'Threshold', type: 'dollar' },
      { name: 'excess', label: 'Excess', type: 'dollar' },
      {
        name: 'aggregateFirstLoss',
        label: 'Aggregate First Loss',
        type: 'dollar',
      },
      { name: 'profitShare', label: 'Profit Share', type: 'string' },
      { name: 'noClaimsBonus', label: 'No Claims Bonus', type: 'percent' },
      { name: 'grade', label: 'Grade', type: 'string' },
      { name: 'specialClauses', label: 'Special Clauses', type: 'string' },
      {
        name: 'maximumCreditPeriod',
        label: 'Maximum Credit Period',
        type: 'string',
      },
      {
        name: 'estTurnOverNSW',
        label: 'Est Turnover NSW',
        type: 'dollar',
      },
      {
        name: 'estTurnOverVIC',
        label: 'Est Turnover VIC',
        type: 'dollar',
      },
      {
        name: 'estTurnOverQLD',
        label: 'Est Turnover QLD',
        type: 'dollar',
      },
      { name: 'estTurnOverSA', label: 'Est Turnover SA', type: 'dollar' },
      { name: 'estTurnOverWA', label: 'Est Turnover WA', type: 'dollar' },
      {
        name: 'estTurnOverTAS',
        label: 'Est Turnover TAS',
        type: 'dollar',
      },
      { name: 'estTurnOverNT', label: 'Est Turnover NT', type: 'dollar' },
      {
        name: 'estTurnOverExports',
        label: 'Est Turnover Exports',
        type: 'dollar',
      },
      {
        name: 'estimatedTurnOver',
        label: 'Estimated Turnover',
        type: 'dollar',
      },
      {
        name: 'actTurnOverNSW',
        label: 'Act Turnover NSW',
        type: 'dollar',
      },
      {
        name: 'actTurnOverVIC',
        label: 'Act Turnover VIC',
        type: 'dollar',
      },
      {
        name: 'actTurnOverQLD',
        label: 'Act Turnover QLD',
        type: 'dollar',
      },
      { name: 'actTurnOverSA', label: 'Act Turnover SA', type: 'dollar' },
      { name: 'actTurnOverWA', label: 'Act Turnover WA', type: 'dollar' },
      {
        name: 'actTurnOverTAS',
        label: 'Act Turnover TAS',
        type: 'dollar',
      },
      { name: 'actTurnOverNT', label: 'Act Turnover NT', type: 'dollar' },
      {
        name: 'actTurnOverExports',
        label: 'Act Turnover Exports',
        type: 'dollar',
      },
      { name: 'actualTurnOver', label: 'Actual Turnover', type: 'dollar' },
      {
        name: 'estTurnOverAct',
        label: 'Est Turnover Act',
        type: 'dollar',
      },
      {
        name: 'timeLimitNotification',
        label: 'Time Limit Notification',
        type: 'string',
      },
      {
        name: 'actTurnOverAct',
        label: 'Act Turnover Act',
        type: 'dollar',
      },
      { name: 'twoYearPolicy', label: '2 Year Policy', type: 'string' },
      {
        name: 'aggregateOfCreditLimit',
        label: 'Aggregate Of Credit Limit',
        type: 'dollar',
      },
      {
        name: 'descriptionOfTrade',
        label: 'Description Of Trade',
        type: 'string',
      },
      { name: 'inceptionDate', label: 'Inception Date', type: 'date' },
      { name: 'expiryDate', label: 'Expiry Date', type: 'date' },
    ];
    if (!isForRisk) {
      const fields = [
        'policyPeriod',
        'crmNote',
        'brokersCommission',
        'tcrServiceFee',
        'rmpFee',
        'grade',
        'specialClauses',
        'premiumRate',
        'estimatedPremium',
        'minimumPremium',
        'minimumPremium',
        'estTurnOverNSW',
        'estTurnOverVIC',
        'estTurnOverQLD',
        'estTurnOverSA',
        'estTurnOverWA',
        'estTurnOverTAS',
        'estTurnOverNT',
        'estTurnOverExports',
        'estimatedTurnOver',
        'actTurnOverNSW',
        'actTurnOverVIC',
        'actTurnOverQLD',
        'actTurnOverSA',
        'actTurnOverWA',
        'actTurnOverTAS',
        'actTurnOverNT',
        'actTurnOverExports',
        'actualTurnOver',
        'estTurnOverAct',
        'actTurnOverAct',
      ];
      policyColumns = policyColumns.filter((i) => !fields.includes(i.name));
    }
    let response = [];
    policyColumns.forEach((i) => {
      if (policyData.hasOwnProperty(i.name)) {
        const value =
          (i.name === 'insurerId' || i.name === 'clientId') &&
          policyData[i.name]
            ? policyData[i.name]['name']
            : policyData[i.name] || null;
        response.push({
          label: i.label,
          value: value,
          type: i.type,
        });
      }
    });
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in get policy details ', e.message || e);
  }
};

const checkForEndorsedLimit = async ({ clientId, creditLimit }) => {
  try {
    let isEndorsedLimit = false;
    const ciPolicy = await Policy.findOne({
      clientId: clientId,
      product: { $regex: '.*Credit Insurance.*' },
      inceptionDate: { $lte: new Date() },
      expiryDate: { $gt: new Date() },
    })
      .select(
        'clientId product policyPeriod discretionaryLimit inceptionDate expiryDate',
      )
      .lean();
    if (
      ciPolicy &&
      ciPolicy?.discretionaryLimit &&
      ciPolicy.discretionaryLimit < creditLimit
    ) {
      isEndorsedLimit = true;
    }
    return isEndorsedLimit;
  } catch (e) {
    Logger.log.error('Error occurred in check for endorsed limit');
    Logger.log.error(e);
  }
};

module.exports = {
  getPolicyDetails,
  checkForEndorsedLimit,
};

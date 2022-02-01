/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const policySchema = new Schema(
  {
    insurerId: { type: Schema.Types.ObjectId, ref: 'insurer' },
    clientId: { type: Schema.Types.ObjectId, ref: 'client' },
    crmPolicyId: { type: Schema.Types.String, unique: true },
    product: { type: Schema.Types.String },
    policyPeriod: { type: Schema.Types.String },
    policyCurrency: { type: Schema.Types.String },
    policyNumber: { type: Schema.Types.String },
    crmNote: { type: Schema.Types.String },
    brokersCommission: { type: Schema.Types.String },
    tcrServiceFee: { type: Schema.Types.String },
    rmpFee: { type: Schema.Types.String },
    noOfMonitoredAccounts: { type: Schema.Types.String },
    noOfResChecks: { type: Schema.Types.String },
    premiumFunder: { type: Schema.Types.String },
    premiumRate: { type: Schema.Types.String },
    estimatedPremium: { type: Schema.Types.String },
    minimumPremium: { type: Schema.Types.String },
    approvedCountries: { type: Schema.Types.String },
    indemnityLevel: { type: Schema.Types.String },
    maxSumInsured: { type: Schema.Types.String },
    discretionaryLimit: { type: Schema.Types.String },
    termsOfPayment: { type: Schema.Types.String },
    maximumExtensionPeriod: { type: Schema.Types.String },
    maximumInvoicingPeriod: { type: Schema.Types.String },
    threshold: { type: Schema.Types.String },
    excess: { type: Schema.Types.String },
    aggregateFirstLoss: { type: Schema.Types.String },
    profitShare: { type: Schema.Types.String },
    noClaimsBonus: { type: Schema.Types.String },
    grade: { type: Schema.Types.String },
    specialClauses: { type: Schema.Types.String },
    maximumCreditPeriod: { type: Schema.Types.String },
    estTurnOverNSW: { type: Schema.Types.String },
    estTurnOverVIC: { type: Schema.Types.String },
    estTurnOverQLD: { type: Schema.Types.String },
    estTurnOverSA: { type: Schema.Types.String },
    estTurnOverWA: { type: Schema.Types.String },
    estTurnOverTAS: { type: Schema.Types.String },
    estTurnOverNT: { type: Schema.Types.String },
    estTurnOverExports: { type: Schema.Types.String },
    estimatedTurnOver: { type: Schema.Types.String },
    actTurnOverNSW: { type: Schema.Types.String },
    actTurnOverVIC: { type: Schema.Types.String },
    actTurnOverQLD: { type: Schema.Types.String },
    actTurnOverSA: { type: Schema.Types.String },
    actTurnOverWA: { type: Schema.Types.String },
    actTurnOverTAS: { type: Schema.Types.String },
    actTurnOverNT: { type: Schema.Types.String },
    actTurnOverExports: { type: Schema.Types.String },
    actualTurnOver: { type: Schema.Types.String },
    twoYearPolicy: { type: Schema.Types.String },
    estTurnOverAct: { type: Schema.Types.String },
    timeLimitNotification: { type: Schema.Types.String },
    actTurnOverAct: { type: Schema.Types.String },
    aggregateOfCreditLimit: { type: Schema.Types.String },
    descriptionOfTrade: { type: Schema.Types.String },
    creditChecks: { type: Schema.Types.String },
    healthChecks: { type: Schema.Types.String },
    alerts247: { type: Schema.Types.String },
    nzCreditChecks: { type: Schema.Types.String },
    overdueReportingLimit: { type: Schema.Types.String },
    inceptionDate: { type: Schema.Types.Date },
    expiryDate: { type: Schema.Types.Date },
    isDeleted: { type: Schema.Types.Boolean, default: false },
  },
  { timestamps: true },
);

policySchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('policy', policySchema);

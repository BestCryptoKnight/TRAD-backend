/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const alertSchema = new Schema(
  {
    entityId: { type: Schema.Types.ObjectId },
    entityType: {
      type: Schema.Types.String,
      enum: ['debtor', 'debtor-director'],
    },
    alertId: { type: Schema.Types.String },
    alertType: { type: Schema.Types.String },
    alertCategory: { type: Schema.Types.String },
    alertPriority: { type: Schema.Types.String },
    companyNumbers: { type: Schema.Types.Mixed },
    companyName: { type: Schema.Types.String },
    countryCode: { type: Schema.Types.String },
    collectionChange: { type: Schema.Types.Mixed },
    hasCollectionChange: { type: Schema.Types.Boolean, default: false },
    courtDetailsChange: { type: Schema.Types.Mixed },
    hasCourtDetailsChange: { type: Schema.Types.Boolean, default: false },
    directorChange: { type: Schema.Types.Mixed },
    hasDirectorChange: { type: Schema.Types.Boolean, default: false },
    financialChange: { type: Schema.Types.Mixed },
    hasFinancialChange: { type: Schema.Types.Boolean, default: false },
    publicFilingChange: { type: Schema.Types.Mixed },
    hasPublicFilingChange: { type: Schema.Types.Boolean, default: false },
    scoreChange: { type: Schema.Types.Mixed },
    hasScoreChange: { type: Schema.Types.Boolean, default: false },
    shareholderChange: { type: Schema.Types.Mixed },
    hasShareholderChange: { type: Schema.Types.Boolean, default: false },
    statusChange: { type: Schema.Types.Mixed },
    hasStatusChange: { type: Schema.Types.Boolean, default: false },
    commercialDefaultChange: { type: Schema.Types.Mixed },
    hasCommercialDefaultChange: { type: Schema.Types.Boolean, default: false },
    abnStatusChange: { type: Schema.Types.Mixed },
    hasAbnStatusChange: { type: Schema.Types.Boolean, default: false },
    abnDetailChange: { type: Schema.Types.Mixed },
    hasAbnDetailChange: { type: Schema.Types.Boolean, default: false },
    solvencyChange: { type: Schema.Types.Mixed },
    hasSolvencyChange: { type: Schema.Types.Boolean, default: false },
    administrationChange: { type: Schema.Types.Mixed },
    hasAdministrationChange: { type: Schema.Types.Boolean, default: false },
    liquidationChange: { type: Schema.Types.Mixed },
    hasLiquidationChange: { type: Schema.Types.Boolean, default: false },
    deRegistrationChange: { type: Schema.Types.Mixed },
    hasDeRegistrationChange: { type: Schema.Types.Boolean, default: false },
    windUpActionsChange: { type: Schema.Types.Mixed },
    hasWindUpActionsChange: { type: Schema.Types.Boolean, default: false },
    shareIssuanceChange: { type: Schema.Types.Mixed },
    hasShareIssuanceChange: { type: Schema.Types.Boolean, default: false },
    companyNameChange: { type: Schema.Types.Mixed },
    hasCompanyNameChange: { type: Schema.Types.Boolean, default: false },
    addressChange: { type: Schema.Types.Mixed },
    hasAddressChange: { type: Schema.Types.Boolean, default: false },
    constitutionChange: { type: Schema.Types.Mixed },
    hasConstitutionChange: { type: Schema.Types.Boolean, default: false },
    companyDetailsChange: { type: Schema.Types.Mixed },
    hasCompanyDetailsChange: { type: Schema.Types.Boolean, default: false },
    companyTypeChange: { type: Schema.Types.Mixed },
    hasCompanyTypeChange: { type: Schema.Types.Boolean, default: false },
    individualCourtActionsChange: { type: Schema.Types.Mixed },
    hasIndividualCourtActionsChange: {
      type: Schema.Types.Boolean,
      default: false,
    },
    personalInsolvencyChange: { type: Schema.Types.Mixed },
    hasPersonalInsolvencyChange: { type: Schema.Types.Boolean, default: false },
    isDeleted: { type: Schema.Types.Boolean, default: false },
  },
  { timestamps: true },
);

alertSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('alert', alertSchema);

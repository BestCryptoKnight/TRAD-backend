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
    status: {
      type: Schema.Types.String,
      enum: ['Pending', 'Processed'],
      default: 'Pending',
    },
    alertId: { type: Schema.Types.String },
    alertType: { type: Schema.Types.String },
    alertCategory: { type: Schema.Types.String },
    alertPriority: { type: Schema.Types.String },
    alertDate: { type: Schema.Types.Date },
    companyNumbers: { type: Schema.Types.Mixed },
    companyName: { type: Schema.Types.String },
    countryCode: { type: Schema.Types.String },
    collectionChange: { type: Schema.Types.Mixed },
    courtDetailsChange: { type: Schema.Types.Mixed },
    directorChange: { type: Schema.Types.Mixed },
    financialChange: { type: Schema.Types.Mixed },
    publicFilingChange: { type: Schema.Types.Mixed },
    scoreChange: { type: Schema.Types.Mixed },
    shareholderChange: { type: Schema.Types.Mixed },
    statusChange: { type: Schema.Types.Mixed },
    commercialDefaultChange: { type: Schema.Types.Mixed },
    abnStatusChange: { type: Schema.Types.Mixed },
    abnDetailChange: { type: Schema.Types.Mixed },
    solvencyChange: { type: Schema.Types.Mixed },
    administrationChange: { type: Schema.Types.Mixed },
    liquidationChange: { type: Schema.Types.Mixed },
    deRegistrationChange: { type: Schema.Types.Mixed },
    windUpActionsChange: { type: Schema.Types.Mixed },
    shareIssuanceChange: { type: Schema.Types.Mixed },
    companyNameChange: { type: Schema.Types.Mixed },
    addressChange: { type: Schema.Types.Mixed },
    constitutionChange: { type: Schema.Types.Mixed },
    companyDetailsChange: { type: Schema.Types.Mixed },
    companyTypeChange: { type: Schema.Types.Mixed },
    individualCourtActionsChange: { type: Schema.Types.Mixed },
    personalInsolvencyChange: { type: Schema.Types.Mixed },
    isDeleted: { type: Schema.Types.Boolean, default: false },
  },
  { timestamps: true },
);

alertSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('alert', alertSchema);

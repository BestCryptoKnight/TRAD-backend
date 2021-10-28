/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const clientDebtorSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'client' },
    debtorId: { type: Schema.Types.ObjectId, ref: 'debtor' },
    isActive: { type: Schema.Types.Boolean, default: true },
    // isDeleted: { type: Schema.Types.Boolean, default: false },
    isEndorsedLimit: { type: Schema.Types.Boolean, default: false },
    creditLimit: { type: Schema.Types.Number },
    outstandingAmount: { type: Schema.Types.Number },
    expiryDate: { type: Schema.Types.Date },
    activeApplicationId: { type: Schema.Types.ObjectId, ref: 'application' },
    currentReportId: { type: Schema.Types.ObjectId, ref: 'credit-report' },
    isFromOldSystem: { type: Schema.Types.Boolean, default: false },
    status: {
      type: Schema.Types.String,
      enum: ['APPROVED', 'DECLINED', 'SURRENDERED', 'APPLIED'],
      default: 'APPLIED',
    },
  },
  { timestamps: true },
);

clientDebtorSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('client-debtor', clientDebtorSchema);

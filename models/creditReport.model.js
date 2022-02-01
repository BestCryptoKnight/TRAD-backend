/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const creditReportSchema = new Schema(
  {
    entityId: { type: Schema.Types.ObjectId },
    entityType: {
      type: Schema.Types.String,
      enum: ['debtor', 'debtor-director'],
    },
    reportProvider: { type: Schema.Types.String, enum: ['illion'] },
    name: { type: Schema.Types.String },
    productCode: { type: Schema.Types.String },
    creditReport: { type: Schema.Types.Mixed },
    keyPath: { type: Schema.Types.String },
    originalFileName: { type: Schema.Types.String },
    isExpired: { type: Schema.Types.Boolean, default: false },
    expiryDate: { type: Schema.Types.Date },
    isDeleted: { type: Schema.Types.Boolean, default: false },
  },
  { timestamps: true },
);

creditReportSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('credit-report', creditReportSchema);

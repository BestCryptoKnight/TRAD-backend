/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const debtorSchema = new Schema(
  {
    abn: { type: Schema.Types.String, unique: true },
    entityName: { type: Schema.Types.String },
    tradingName: { type: Schema.Types.String },
    entityType: {
      type: Schema.Types.String,
      enum: [
        'PROPRIETARY_LIMITED',
        'LIMITED_COMPANY',
        'PARTNERSHIP',
        'SOLE_TRADER',
        'TRUST',
        'BUSINESS',
        'CORPORATION',
        'GOVERNMENT',
        'INCORPORATED',
        'NO_LIABILITY',
        'PROPRIETARY',
        'REGISTERED_BODY',
      ],
    },
    contactNumber: { type: Schema.Types.String },
    address: { type: Schema.Types.String },
    isDeleted: { type: Schema.Types.Boolean, default: false },
  },
  { timestamps: true },
);

debtorSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('debtor', debtorSchema);

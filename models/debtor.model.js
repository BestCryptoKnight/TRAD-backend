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
    debtorCode: Schema.Types.String,
    abn: { type: Schema.Types.String, unique: true },
    acn: { type: Schema.Types.String, unique: true },
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
    address: {
      property: Schema.Types.String,
      unitNumber: Schema.Types.String,
      streetNumber: Schema.Types.String,
      streetName: Schema.Types.String,
      streetType: Schema.Types.String,
      suburb: Schema.Types.String,
      state: Schema.Types.String,
      country: Schema.Types.String,
      postCode: Schema.Types.String,
    },
    isActive: { type: Schema.Types.Boolean, default: false },
    isDeleted: { type: Schema.Types.Boolean, default: false },
  },
  { timestamps: true },
);

debtorSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('debtor', debtorSchema);

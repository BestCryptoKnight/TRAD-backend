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
    abn: { type: Schema.Types.String },
    acn: { type: Schema.Types.String },
    registrationNumber: { type: Schema.Types.String },
    entityName: { type: Schema.Types.String },
    tradingName: { type: Schema.Types.String },
    entityType: {
      type: Schema.Types.String,
      enum: [
        'PROPRIETARY_LIMITED',
        'LIMITED',
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
      country: {
        name: Schema.Types.String,
        code: Schema.Types.String,
      },
      postCode: Schema.Types.String,
    },
    reviewDate: { type: Schema.Types.Date },
    riskRating: { type: Schema.Types.String },
    isActive: { type: Schema.Types.Boolean, default: true },
    // isDeleted: { type: Schema.Types.Boolean, default: false },
    status: {
      type: Schema.Types.String,
      enum: ['DRAFT', 'SUBMITTED'],
      default: 'DRAFT',
    },
    debtorStage: { type: Schema.Types.Number },
  },
  { timestamps: true },
);

debtorSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('debtor', debtorSchema);

/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const debtorDirectorSchema = new Schema(
  {
    type: { type: Schema.Types.String, enum: ['individual', 'company'] },
    debtorId: { type: Schema.Types.ObjectId, ref: 'debtor' },
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
        'CORPORATION',
        'INCORPORATED',
        'NO_LIABILITY',
        'PROPRIETARY',
        'REGISTERED_BODY',
      ],
    },
    title: { type: Schema.Types.String },
    firstName: { type: Schema.Types.String },
    middleName: { type: Schema.Types.String },
    lastName: { type: Schema.Types.String },
    dateOfBirth: { type: Schema.Types.Date },
    driverLicenceNumber: { type: Schema.Types.String },
    residentialAddress: {
      property: Schema.Types.String,
      unitNumber: Schema.Types.String,
      streetNumber: Schema.Types.String,
      streetName: Schema.Types.String,
      streetType: Schema.Types.String,
      suburb: Schema.Types.String,
      state: Schema.Types.String,
      postCode: Schema.Types.String,
    },
    phoneNumber: { type: Schema.Types.String },
    mobileNumber: { type: Schema.Types.String },
    email: { type: Schema.Types.String },
    allowToCheckCreditHistory: { type: Schema.Types.Boolean },
    country: {
      name: Schema.Types.String,
      code: Schema.Types.String,
    },
    isDeleted: { type: Schema.Types.Boolean, default: false },
  },
  { timestamps: true },
);

debtorDirectorSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('debtor-director', debtorDirectorSchema);

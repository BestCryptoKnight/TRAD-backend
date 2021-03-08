/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const applicationSchema = new Schema(
  {
    applicationId: { type: Schema.Types.String },
    clientId: { type: Schema.Types.ObjectId, ref: 'client' },
    debtorId: { type: Schema.Types.ObjectId, ref: 'debtor' },
    clientDebtorId: { type: Schema.Types.ObjectId, ref: 'client-debtor' },
    status: {
      type: Schema.Types.String,
      enum: [
        'DRAFT',
        'SENT_TO_INSURER',
        'REVIEW_APPLICATION',
        'PENDING_INSURER_REVIEW',
        'APPROVED',
        'DECLINED',
        'CANCELLED',
        'WITHDRAWN',
        'SUBMITTED',
        'UNDER_REVIEW',
        'AWAITING_INFORMATION',
        'SURRENDERED',
      ],
      default: 'DRAFT',
    },
    creditLimit: { type: Schema.Types.Number },
    isExtendedPaymentTerms: { type: Schema.Types.Boolean },
    extendedPaymentTermsDetails: { type: Schema.Types.String },
    isPassedOverdueAmount: { type: Schema.Types.Boolean },
    passedOverdueDetails: { type: Schema.Types.String },
    partners: {
      person: [
        {
          _id: false,
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
            country: Schema.Types.String,
            postCode: Schema.Types.String,
          },
          phoneNumber: { type: Schema.Types.String },
          mobileNumber: { type: Schema.Types.String },
          email: { type: Schema.Types.String },
          allowToCheckCreditHistory: { type: Schema.Types.Boolean },
        },
      ],
      company: [
        {
          _id: false,
          abn: { type: Schema.Types.String },
          acn: { type: Schema.Types.String },
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
        },
      ],
    },
    isDeleted: { type: Schema.Types.Boolean, default: false },
  },
  { timestamps: true },
);

applicationSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('application', applicationSchema);

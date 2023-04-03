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
        'REVIEW_SURRENDERED',
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
      ],
      default: 'DRAFT',
    },
    creditLimit: { type: Schema.Types.Number },
    isExtendedPaymentTerms: { type: Schema.Types.Boolean },
    extendedPaymentTermsDetails: { type: Schema.Types.String },
    isPassedOverdueAmount: { type: Schema.Types.Boolean },
    passedOverdueDetails: { type: Schema.Types.String },
    note: { type: Schema.Types.String },
    applicationStage: { type: Schema.Types.Number },
    isAutoApproved: { type: Schema.Types.Boolean, default: false },
    isEndorsedLimit: { type: Schema.Types.Boolean, default: false },
    acceptedAmount: { type: Schema.Types.Number },
    outstandingAmount: { type: Schema.Types.Number },
    orderOnHand: { type: Schema.Types.Number },
    blockers: { type: Schema.Types.Mixed },
    createdByType: {
      type: Schema.Types.String,
      enum: ['user', 'client-user'],
    },
    createdById: { type: Schema.Types.ObjectId },
    requestDate: { type: Schema.Types.Date },
    approvalOrDecliningDate: { type: Schema.Types.Date },
    expiryDate: { type: Schema.Types.Date },
    clientReference: { type: Schema.Types.String },
    comments: { type: Schema.Types.String },
    limitType: {
      type: Schema.Types.String,
      enum: [
        'ENDORSED',
        'CREDIT_CHECK',
        'CREDIT_CHECK_NZ',
        'HEALTH_CHECK',
        '247_ALERT',
      ],
    },
    isDeleted: { type: Schema.Types.Boolean, default: false },
    isApprovedFromOldSystem: { type: Schema.Types.Boolean, default: false },
  },
  { timestamps: true },
);

applicationSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('application', applicationSchema);

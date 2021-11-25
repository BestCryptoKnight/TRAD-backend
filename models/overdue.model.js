/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const overdueSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'client' },
    debtorId: { type: Schema.Types.ObjectId, ref: 'debtor' },
    // applicationId: { type: Schema.Types.ObjectId, ref: 'application' },
    acn: { type: Schema.Types.String },
    dateOfInvoice: { type: Schema.Types.Date },
    overdueType: {
      type: Schema.Types.String,
      enum: [
        'PAID',
        'INSOLVENCY',
        'REPAYMENT_PLAN',
        'RETURNED_CHEQUE',
        'RETENTION',
        'PAYMENT_EXPECTED',
        'DISPUTE',
        'LEGAL/COLLECTIONS',
        'WRITTEN_OFF',
        'CLAIM_TO_BE_SUBMITTED_TO_TCR',
        'QUERIED_INVOICES_TO_BE_RECONCILED',
      ],
    },
    overdueAction: {
      type: Schema.Types.String,
      enum: ['MARK_AS_PAID', 'UNCHANGED', 'AMEND'],
      default: 'UNCHANGED',
    },
    status: {
      type: Schema.Types.String,
      enum: ['SUBMITTED', 'PENDING', 'REPORTED_TO_INSURER', 'NOT_REPORTABLE'],
    },
    insurerId: { type: Schema.Types.ObjectId, ref: 'insurer' },
    month: { type: Schema.Types.String },
    year: { type: Schema.Types.String },
    clientComment: { type: Schema.Types.String },
    analystComment: { type: Schema.Types.String },
    currentAmount: { type: Schema.Types.Number },
    thirtyDaysAmount: { type: Schema.Types.Number },
    sixtyDaysAmount: { type: Schema.Types.Number },
    ninetyDaysAmount: { type: Schema.Types.Number },
    ninetyPlusDaysAmount: { type: Schema.Types.Number },
    outstandingAmount: { type: Schema.Types.Number },
    isDeleted: { type: Schema.Types.Boolean, default: false },
    nilOverdue: { type: Schema.Types.Boolean, default: false },
    createdByType: { type: Schema.Types.String, enum: ['client-user', 'user'] },
    createdById: { type: Schema.Types.ObjectId },
  },
  { timestamps: true },
);

overdueSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('overdue', overdueSchema);

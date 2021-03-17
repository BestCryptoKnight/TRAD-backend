/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const insurerUserSchema = new Schema(
  {
    insurerId: { type: Schema.Types.ObjectId, ref: 'insurer' },
    name: Schema.Types.String,
    contactNumber: { type: Schema.Types.String },
    direct: { type: Schema.Types.String },
    jobTitle: { type: Schema.Types.String },
    crmContactId: { type: Schema.Types.String },
    email: { type: Schema.Types.String },
    hasLeftCompany: { type: Schema.Types.Boolean },
    isDecisionMaker: { type: Schema.Types.Boolean },
    isDeleted: { type: Schema.Types.Boolean, default: false },
  },
  { timestamps: true },
);

insurerUserSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('insurer-user', insurerUserSchema);

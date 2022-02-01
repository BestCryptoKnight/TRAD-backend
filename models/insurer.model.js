/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const insurerSchema = new Schema(
  {
    name: { type: Schema.Types.String },
    crmInsurerId: { type: Schema.Types.String },
    contactNumber: { type: Schema.Types.String },
    address: {
      addressLine: Schema.Types.String,
      city: Schema.Types.String,
      state: Schema.Types.String,
      country: Schema.Types.String,
      zipCode: Schema.Types.String,
    },
    email: { type: Schema.Types.String },
    website: { type: Schema.Types.String },
    isDefault: { type: Schema.Types.Boolean, default: false },
    isDeleted: { type: Schema.Types.Boolean, default: false },
  },
  { timestamps: true },
);

insurerSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('insurer', insurerSchema);

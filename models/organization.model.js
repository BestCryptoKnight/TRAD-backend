/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const organizationSchema = new Schema(
  {
    name: Schema.Types.String,
    isDeleted: { type: Schema.Types.Boolean, default: false },
    email: Schema.Types.String,
    website: Schema.Types.String,
    contactNumber: Schema.Types.String,
    address: Schema.Types.String,
    integration: {
      rss: {
        accessToken: Schema.Types.String,
      },
      abn: {
        guid: Schema.Types.String,
      },
    },
  },
  { timestamps: true },
);

organizationSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('organization', organizationSchema);

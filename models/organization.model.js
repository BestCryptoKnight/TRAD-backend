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
      illion: {
        userId: Schema.Types.String,
        password: Schema.Types.String,
        subscriberId: Schema.Types.String,
      },
      equifax: {
        username: Schema.Types.String,
        password: Schema.Types.String,
      },
      nzbn: {
        accessToken: Schema.Types.String,
      },
      illionAlert: {
        userId: Schema.Types.String,
        password: Schema.Types.String,
        subscriberId: Schema.Types.String,
      },
    },
    entityCount: {
      client: { type: Schema.Types.Number, default: 0 },
      debtor: { type: Schema.Types.Number, default: 0 },
      application: { type: Schema.Types.Number, default: 0 },
    },
    illionAlertProfile: {
      profileId: Schema.Types.String,
      profileName: Schema.Types.String,
      locked: Schema.Types.Boolean,
      useInternalReference: Schema.Types.Boolean,
      colour: Schema.Types.Mixed,
      alerts: Schema.Types.Mixed,
      email: Schema.Types.String,
    },
  },
  { timestamps: true },
);

organizationSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('organization', organizationSchema);

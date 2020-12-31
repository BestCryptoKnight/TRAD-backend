/*
* Module Imports
* */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const policySchema = new Schema(
    {
        insurerId: {type: Schema.Types.ObjectId, ref: 'insurer'},
        clientId: {type: Schema.Types.ObjectId, ref: 'client'},
        isDeleted: {type: Schema.Types.Boolean, default: false},
        crmPolicyId: {type: Schema.Types.String, unique: true},
    },
    {timestamps: true},
);

policySchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('policy', policySchema);

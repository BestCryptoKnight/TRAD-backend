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
        inceptionDate:{type:Schema.Types.Date},
        expiryDate:{type:Schema.Types.Date},
        product:{type:Schema.Types.String},
        policyPeriod:{type:Schema.Types.String},
        policyCurrency:{type:Schema.Types.String},
    },
    {timestamps: true},
);

policySchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('policy', policySchema);

/*
* Module Imports
* */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const claimSchema = new Schema(
    {
        clientId: {type: Schema.Types.ObjectId, ref: 'client'},
        debtorId: {type: Schema.Types.ObjectId, ref: 'debtor'},
        applicationId: {type: Schema.Types.ObjectId, ref: 'application'},
        isDeleted: {type: Schema.Types.Boolean, default: false},
    },
    {timestamps: true},
);

claimSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('claim', claimSchema);

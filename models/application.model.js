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
        clientId: {type: Schema.Types.ObjectId, ref: 'client'},
        debtorId: {type: Schema.Types.ObjectId, ref: 'debtor'},
        isDeleted: {type: Schema.Types.Boolean, default: false},
    },
    {timestamps: true},
);

applicationSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('application', applicationSchema);

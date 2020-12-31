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
        clientId: {type: Schema.Types.ObjectId, ref: 'client'},
        debtorId: {type: Schema.Types.ObjectId, ref: 'debtor'},
        applicationId: {type: Schema.Types.ObjectId, ref: 'application'},
        isDeleted: {type: Schema.Types.Boolean, default: false},
    },
    {timestamps: true},
);

overdueSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('overdue', overdueSchema);

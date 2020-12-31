/*
* Module Imports
* */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const notificationSchema = new Schema(
    {
        entityType: {type: Schema.Types.String, enum: ['user', 'client', 'debtor', 'client-debtor', 'application', 'claim', 'overdue']},
        entityId: {type: Schema.Types.ObjectId},
        isDeleted: {type: Schema.Types.Boolean, default: false},
    },
    {timestamps: true},
);

notificationSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('notification', notificationSchema);

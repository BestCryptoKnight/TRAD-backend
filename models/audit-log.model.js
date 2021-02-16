/*
* Module Imports
* */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const auditLogSchema = new Schema(
    {
        entityType:{type:Schema.Types.String},
        entityRefId:{type:Schema.Types.ObjectId},
        userType:{type:Schema.Types.String, enum: ['user', 'client-user', 'system']},
        userRefId:{type:Schema.Types.ObjectId},
        actionType:{type:Schema.Types.String, enum: ['add', 'edit', 'delete', 'sync']},
        logDescription: {type: Schema.Types.String},
    },
    {timestamps: true},
);

auditLogSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('audit-log', auditLogSchema);

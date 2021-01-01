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
        entities: [{
            entityType: {type: Schema.Types.String, enum: ['user', 'client']},
            entityRefId: {type: Schema.Types.ObjectId},

        }],
        logDescription: {type: Schema.Types.String},
    },
    {timestamps: true},
);

auditLogSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('audit-log', auditLogSchema);

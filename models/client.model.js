/*
* Module Imports
* */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const clientSchema = new Schema(
    {
        riskAnalystId: {type: Schema.Types.ObjectId, ref: 'user'},
        serviceManagerId: {type: Schema.Types.ObjectId, ref: 'user'},
        isDeleted: {type: Schema.Types.Boolean, default: false},
        crmClientId: {type: Schema.Types.String, unique: true},
    },
    {timestamps: true},
);

clientSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('client', clientSchema);

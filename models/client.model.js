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
        name: Schema.Types.String,
        riskAnalystId: {type: Schema.Types.ObjectId, ref: 'user'},
        serviceManagerId: {type: Schema.Types.ObjectId, ref: 'user'},
        insurerId: {type: Schema.Types.ObjectId, ref: 'insurer'},
        isDeleted: {type: Schema.Types.Boolean, default: false},
        crmClientId: {type: Schema.Types.String},
        address: {
            addressLine: Schema.Types.String,
            city: Schema.Types.String,
            state: Schema.Types.String,
            country: Schema.Types.String,
            zipCode: Schema.Types.String,
        },
        crmNote: Schema.Types.String,
        contactNumber: Schema.Types.String,
        website: Schema.Types.String,
        abn: Schema.Types.String,
        acn: Schema.Types.String,
        sector: Schema.Types.String,
        salesPerson: Schema.Types.String,

    },
    {timestamps: true},
);

clientSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('client', clientSchema);

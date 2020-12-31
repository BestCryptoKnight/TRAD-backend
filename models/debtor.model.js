/*
* Module Imports
* */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const debtorSchema = new Schema(
    {
        abn: {type: Schema.Types.String, unique: true},
        isDeleted: {type: Schema.Types.Boolean, default: false},
    },
    {timestamps: true},
);

debtorSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('debtor', debtorSchema);

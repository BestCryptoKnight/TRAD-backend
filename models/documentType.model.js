/*
* Module Imports
* */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const documentTypeSchema = new Schema(
    {
        documentFor: {type: Schema.Types.String, enum: ['client', 'debtor', 'application']},
        documentTitle: {type: Schema.Types.String},
        isDeleted: {type: Schema.Types.Boolean, default: false},
    },
    {timestamps: true},
);

documentTypeSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('document-type', documentTypeSchema);

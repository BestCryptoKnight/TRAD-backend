/*
* Module Imports
* */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const alertSchema = new Schema(
    {
        isDeleted: {type: Schema.Types.Boolean, default: false},
    },
    {timestamps: true},
);

alertSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('alert', alertSchema);

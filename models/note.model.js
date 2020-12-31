/*
* Module Imports
* */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const noteSchema = new Schema(
    {
        noteFor: {type: Schema.Types.String, enum: ['client', 'client-debtor', 'debtor', 'application']},
        entityId: {type: Schema.Types.ObjectId, ref: 'debtor'},
        description: {type: Schema.Types.ObjectId, ref: 'application'},
        isDeleted: {type: Schema.Types.Boolean, default: false},
    },
    {timestamps: true},
);

noteSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('note', noteSchema);

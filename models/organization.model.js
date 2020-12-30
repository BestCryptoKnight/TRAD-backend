/*
* Module Imports
* */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const organizationSchema = new Schema(
    {
        name: Schema.Types.String,
        email: Schema.Types.String,
        website: Schema.Types.String,
        contactNumber: Schema.Types.String,
        address: Schema.Types.String,
        profileImage: Schema.Types.String,
        originAdminId: { type: Schema.Types.ObjectId, ref: 'user' }
    },
    { timestamps: true },
);

organizationSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('organization', organizationSchema);

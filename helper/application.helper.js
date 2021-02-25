/*
 * Module Imports
 * */
const axios = require('axios');
const convert = require('xml-js');
const mongoose = require('mongoose');
const Organization = mongoose.model('organization');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

const getEntityDetailsByABN = ({ searchString }) => {
  return new Promise(async (resolve, reject) => {
    try {
      const organization = await Organization.findOne({
        isDeleted: false,
      }).select({ 'integration.abn': 1 });
      const url = `https://abr.business.gov.au/ABRXMLSearch/AbrXmlSearch.asmx/SearchByABNv202001?searchString=${searchString}&includeHistoricalDetails=y&authenticationGuid=${organization.integration.abn.guid}`;
      const options = {
        method: 'GET',
        url: url,
      };
      console.log('options: ', options);
      const { data } = await axios(options);
      const jsonData = convert.xml2js(data);
      return resolve(jsonData.elements);
    } catch (e) {
      Logger.log.error('Error in getting entity details from ABN');
      Logger.log.error(e.message || e);
      return reject(e);
    }
  });
};

const getEntityDetailsByACN = ({ searchString }) => {
  return new Promise(async (resolve, reject) => {
    try {
      const organization = await Organization.findOne({
        isDeleted: false,
      }).select({ 'integration.abn': 1 });
      const url = `https://abr.business.gov.au/ABRXMLSearch/AbrXmlSearch.asmx/SearchByASICv201408?searchString=${searchString}&includeHistoricalDetails=y&authenticationGuid=${organization.integration.abn.guid}`;
      const options = {
        method: 'GET',
        url: url,
      };
      const { data } = await axios(options);
      const jsonData = convert.xml2js(data);
      return resolve(jsonData.elements);
    } catch (e) {
      Logger.log.error('Error in getting entity details from ABN lookup ');
      Logger.log.error(e.message || e);
      return reject(e);
    }
  });
};

module.exports = { getEntityDetailsByABN, getEntityDetailsByACN };

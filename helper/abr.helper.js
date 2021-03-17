/*
 * Module Imports
 * */
const axios = require('axios');
const convert = require('xml-js');
const parser = require('xml2json');
const mongoose = require('mongoose');
const Organization = mongoose.model('organization');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

const getEntityDetailsByABN = async ({ searchString }) => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.abn': 1 })
      .lean();
    const url = `https://abr.business.gov.au/ABRXMLSearch/AbrXmlSearch.asmx/SearchByABNv202001?searchString=${searchString}&includeHistoricalDetails=y&authenticationGuid=${organization.integration.abn.guid}`;
    const options = {
      method: 'GET',
      url: url,
    };
    const { data } = await axios(options);
    let jsonData = parser.toJson(data);
    jsonData = JSON.parse(jsonData);
    return jsonData.ABRPayloadSearchResults;
  } catch (e) {
    Logger.log.error('Error in getting entity details from ABN');
    Logger.log.error(e.message || e);
  }
};

const getEntityDetailsByACN = async ({ searchString }) => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.abn': 1 })
      .lean();
    const url = `https://abr.business.gov.au/ABRXMLSearch/AbrXmlSearch.asmx/SearchByASICv201408?searchString=${searchString}&includeHistoricalDetails=y&authenticationGuid=${organization.integration.abn.guid}`;
    const options = {
      method: 'GET',
      url: url,
    };
    const { data } = await axios(options);
    let jsonData = parser.toJson(data);
    jsonData = JSON.parse(jsonData);
    return jsonData.ABRPayloadSearchResults;
  } catch (e) {
    Logger.log.error('Error in getting entity details from ABN lookup ');
    Logger.log.error(e.message || e);
  }
};

const getEntityListByName = async ({ searchString }) => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.abn': 1 })
      .lean();
    const requestBody = `<?xml version="1.0" encoding="utf-8"?>
    <soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
    <soap12:Body>
    <ABRSearchByNameSimpleProtocol xmlns="http://abr.business.gov.au/ABRXMLSearch/">
    <name>${searchString}</name>
    <legalName>Y</legalName>
    <tradingName>Y</tradingName>
    <NSW>Y</NSW>\n<SA>Y</SA>\n<ACT>Y</ACT>\n<VIC>Y</VIC>\n<WA>Y</WA>\n<NT>Y</NT>\n<QLD>Y</QLD>\n<TAS>Y</TAS>
    <authenticationGuid>${organization.integration.abn.guid}</authenticationGuid>
    </ABRSearchByNameSimpleProtocol>
    </soap12:Body>
    </soap12:Envelope>`;
    const options = {
      method: 'post',
      url: 'https://abr.business.gov.au/ABRXMLSearch/AbrXmlSearch.asmx',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
      },
      data: requestBody,
    };
    const { data } = await axios(options);
    let jsonData = parser.toJson(data);
    jsonData = JSON.parse(jsonData);
    return jsonData['soap:Envelope']['soap:Body'][
      'ABRSearchByNameSimpleProtocolResponse'
    ];
  } catch (e) {
    Logger.log.error('Error in getting entity details from ABN lookup ');
    Logger.log.error(e.message || e);
  }
};

module.exports = {
  getEntityDetailsByABN,
  getEntityDetailsByACN,
  getEntityListByName,
};

/**
 * Config
 * */
const config = require('../config');
module.exports = ({
  name,
  setPasswordLink,
  riskAnalystName,
  serviceManagerName,
  riskAnalystNumber,
  serviceManagerNumber,
  riskAnalystEmail,
  serviceManagerEmail,
  email,
  contactNumber,
  address,
}) => {
  let mailTemplate = `<html>
<head>
    <meta charset='utf-8'/>
    <meta name='viewport' content='width=device-width, initial-scale=1'/>
</head>
<body style="margin:0; padding:0; word-spacing:normal; background-color: #F4F6F8">
<table style="width: 100%; height: 100%; background-color: #F4F6F8">
    <tr style="font-family: 'open sans', 'helvetica neue', sans-serif;">
        <td align="center">
            <table style="max-width:600px; min-width:240px; width: 600px; background-color: white; border-radius: 10px" border="0" cellspacing="0"
                   cellpadding="0"
                   align="center">
                <tbody>
                <tr>
                    <td height="32"
                        style="background-color: #003A78;"></td>
                </tr>

                <tr>
                    <td align="center" valign="center" height="85" style="background-color: #F4F6F8;">
                        <img height="40" src="${config.staticServing.bucketURL}static-files/mail-images/tcr-logo.png"/>
                    </td>
                </tr>

                <tr>
                    <td align="center" valign="center" width="100"
                        style="padding-top: 20px; font-size: 24px; color: #003A78; background-color: white;">
                        Dear ${name}
                    </td>
                </tr>

                <tr>
                    <td align="center" valign="center" width="100"
                        style="font-size: 34px; color: #EF7B10; background-color: white;">
                        Welcome to TCR
                    </td>
                </tr>


               <!-- <tr>
                    <td align="center" valign="center" width="100"
                        style="padding: 3px 15%; font-size: 15px; color: #37404D; background-color: white; opacity: .5">
                        We’re glad you’re here.
                    </td>
                </tr>-->

                <tr>
                    <td align="center" valign="center" width="80"
                        style="padding: 20px 5% 5px 5%; font-size: 22px; color: #003A78; background-color: white">
                        Check out our client portal and get daily updates on all your credit limits, claims
                            and alerts.
                    </td>
                </tr>

                <!--<tr>
                    <td align="center" valign="center" width="60"
                        style="padding: 5px 15%; font-size: 15px; line-height: 24px; color: #828F9D; background-color: white">
                        Check out our client portal in detail and get daily updates for all your credit limits, claims
                        and debtor
                    </td>
                </tr>-->

                <tr>
                    <td align="center" valign="center"
                        style="padding: 10px 0 20px 0; background-color: white">
                        <a href="${setPasswordLink}" style="text-decoration: none;">
                            <button style="padding: 10px 20px; font-size: 16px; color: white; background-color: #003A78; border-radius: 5px; border: none; outline: none; cursor: pointer">
                                Get Started!
                            </button>
                        </a>
                    </td>
                </tr>`;

  if (riskAnalystName || serviceManagerName) {
    mailTemplate += `<tr>
                    <td>
                        <table style="max-width: 600px; min-width: 240px; width: 600px; border-collapse: collapse">
                            <tr>`;
    if (serviceManagerName) {
      if (!riskAnalystName) {
        mailTemplate += `<td align="center" style="width: 50%; border-left: 0; vertical-align: top; padding: 30px 20px; background-color: #003A78; word-break: break-word">`;
      } else {
        mailTemplate += `<td style="width: 50%; border-left: 0; vertical-align: top; padding: 30px 20px; background-color: #003A78; word-break: break-word">`;
      }
      mailTemplate += ` <table>
                                        <tr>
                                            <td
                                                    style="font-size: 16px; color: white">
                                                Service Manager
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <table>
                                                    <tr>
                                                        <td style="padding: 3px 0; vertical-align: top;">
                                                            <img height="18"
                                                                 src="${config.staticServing.bucketURL}static-files/mail-images/account_circle_white.png"/>
                                                        </td>
                                                        <td style="padding: 3px 0; font-size: 13px; color: white">
                                                            ${serviceManagerName}
                                                        </td>
                                                    </tr>`;
      if (serviceManagerNumber) {
        mailTemplate += `<tr>
                                                        <td style="padding: 3px 0; vertical-align: top;">
                                                            <img height="16"
                                                                 src="${config.staticServing.bucketURL}static-files/mail-images/phone_in_talk_white.png"/>
                                                        </td>
                                                        <td style="padding: 3px 0; font-size: 13px; color: white">
                                                            <a style="color: white; text-decoration: none"
                                                              href="tel:${serviceManagerNumber}">
                                                                            ${serviceManagerNumber}
                                                            </a>
                                                        </td>
                                                    </tr>`;
      }
      mailTemplate += `<tr>
                                                        <td style="padding: 3px 0; vertical-align: top;">
                                                            <img height="18"
                                                                 src="${config.staticServing.bucketURL}static-files/mail-images/mail_white.png"/>
                                                        </td>
                                                        <td style="padding: 3px 0; font-size: 13px; color: white">
                                                            <a style="color: white; text-decoration: none"
                                                               href="mailto:${serviceManagerEmail}">
                                                                            ${serviceManagerEmail}
                                                            </a>
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>

                                    </table>
                                </td>`;
    }
    if (riskAnalystName) {
      if (!serviceManagerName) {
        mailTemplate += `<td align="center" style="width: 50%; border-left: 0; vertical-align: top; padding: 30px 20px; background-color: #EF7B10; word-break: break-word">`;
      } else {
        mailTemplate += `<td style="width: 50%; border-left: 0; vertical-align: top; padding: 30px 20px; background-color: #EF7B10; word-break: break-word">`;
      }
      mailTemplate += `<table>
                                        <tr>
                                            <td style="font-size: 16px; color: white">
                                                Risk Analyst
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <table>
                                                    <tr>
                                                        <td style="padding: 3px 0; vertical-align: top;">
                                                            <img height="18"
                                                                 src="${config.staticServing.bucketURL}static-files/mail-images/account_circle_white.png"/>
                                                        </td>
                                                        <td style="padding: 3px 0; font-size: 13px; color: white">
                                                            ${riskAnalystName}
                                                        </td>
                                                    </tr>`;
      if (riskAnalystNumber) {
        mailTemplate += ` <tr>
                                                        <td style="padding: 3px 0; vertical-align: top;">
                                                            <img height="16"
                                                                 src="${config.staticServing.bucketURL}static-files/mail-images/phone_in_talk_white.png"/>
                                                        </td>
                                                        <td style="padding: 3px 0; font-size: 13px; color: white">
                                                            <a style="color: white; text-decoration: none"
                                                               href="tel:${riskAnalystNumber}">
                                                                            ${riskAnalystNumber}
                                                            </a>
                                                        </td>
                                                    </tr>`;
      }

      mailTemplate += `<tr>
                                                        <td style="padding: 3px 0; vertical-align: top;">
                                                            <img height="18"
                                                                 src="${config.staticServing.bucketURL}static-files/mail-images/mail_white.png"/>
                                                        </td>
                                                        <td style="padding: 3px 0; font-size: 13px; color: white">
                                                            <a style="color: white; text-decoration: none"
                                                               href="mailto:${riskAnalystEmail}">
                                                                            ${riskAnalystEmail}
                                                            </a>
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>
                                </td>`;
    }
    mailTemplate += `</tr>
                                    </table>
                                </td>
                            </tr>`;
  }

  mailTemplate += `<tr>
                    <td>
                        <table width="100%" style="border-collapse: collapse">
                            <tr>
                                <td width="33.33" align="center" valign="middle" style="vertical-align: middle; word-break: break-word; border-left: 0; padding: 20px; background-color: #F4F6F8;">
                                    <table>
                                        <tr>
                                            <td align="center">
                                                <img height="30" src="${config.staticServing.bucketURL}static-files/mail-images/call.png"/>
                                            </td>
                                        </tr>
                                        <tr style="font-size: 13px; color: #003A78">
                                            <td align="center">
                                                <a style="color: #003A78; text-decoration: none"
                                                   href="tel:${contactNumber}">
                                                    ${contactNumber}
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                                <td width="33.33" align="center" valign="middle" style="word-break: break-word; border-left: 2px solid white; border-right: 2px solid white; padding: 20px; background-color: #F4F6F8;">
                                    <table>
                                        <tr>
                                            <td align="center">
                                                <img height="30" src="${config.staticServing.bucketURL}static-files/mail-images/mail.png"/>
                                            </td>
                                        </tr>
                                        <tr style="font-size: 13px; color: #003A78">
                                            <td align="center">
                                                <a style="color: #003A78; text-decoration: none"
                                                   href="mailto:${email}">
                                                    ${email}
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                                <td width="33.33" align="center" valign="middle" style="word-break: break-word; border-right: 0; padding: 20px; background-color: #F4F6F8;">
                                    <table>
                                        <tr>
                                            <td align="center">
                                                <img height="30" src="${config.staticServing.bucketURL}static-files/mail-images/location.png"/>
                                            </td>
                                        </tr>
                                        <tr style="font-size: 13px; color: #003A78">
                                            <td align="center">
                                                ${address}
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <tr>
                    <td align="center" style="padding: 30px 0 5px 0">
                        <img height="40" src="${config.staticServing.bucketURL}static-files/mail-images/trad-icon.png"/>
                    </td>
                </tr>

                <tr>
                    <td align='center' valign='center'
                        style='padding: 5px 40px; font-size: 16px; line-height: 24px; font-weight: 400;  color: #828F9D'>
                        Copyright © 2021 Trade Credit Risk
                    </td>
                </tr>

                <tr>
                    <td align="center" style="padding-bottom: 40px">
                        <table>
                            <tr>
                                <td>
                                    <a style="text-decoration: none" href="https://www.facebook.com/tradecreditrisk/">
                                        <img height="30" style="cursor:pointer;"
                                             src="${config.staticServing.bucketURL}static-files/mail-images/facebook.png"/>
                                    </a>
                                </td>
                                <td>
                                    <a style="text-decoration: none" href="https://au.linkedin.com/company/trade-credit-risk-pty-ltd">
                                        <img height="30" style="cursor:pointer;"
                                             src="${config.staticServing.bucketURL}static-files/mail-images/linkedin.png"/>
                                    </a>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                </tbody>
            </table>
        </td>
    </tr>
</table>
</body>
</html>`;

  return mailTemplate;
};

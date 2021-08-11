/**
 * Config
 * */
const config = require('../config');
module.exports = ({
  name,
  otp,
  expireTime,
  riskAnalystName,
  serviceManagerName,
  riskAnalystNumber,
  serviceManagerNumber,
  riskAnalystEmail,
  serviceManagerEmail,
}) => {
  let mailTemplate = `<html>
<head>
    <meta charset='utf-8' />
    <meta name='viewport' content='width=device-width, initial-scale=1' />
    <style>
        @font-face {
            font-family: "GoogleSans-Medium";
            src: local("GoogleSans-Medium"), url("${config.server.backendServerUrl}fonts/GoogleSans-Medium.ttf") format("truetype");
            font-weight: normal;
        }

        @font-face {
            font-family: "GoogleSans-Regular";
            src: local("GoogleSans-Regular"), url('${config.server.backendServerUrl}fonts/GoogleSans-Regular.ttf') format("truetype");
            font-weight: normal;
        }

        @font-face {
            font-family: "GoogleSans-Bold";
            src: local("GoogleSans-Bold"), url('${config.server.backendServerUrl}fonts/GoogleSans-Bold.ttf') format("truetype");
            font-weight: normal;
        }

        body * {
            font-family: GoogleSans-Regular, SansSerif;
        }
    </style>
</head>
<body style="margin:0; padding:0; word-spacing:normal; background-color: #F4F6F8">
    <div role="article" aria-roledescription="email" lang="en"
        style="text-size-adjust:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background-color:#F4F6F8;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#ffffff" role="presentation"
            style="width:100%;border:none;border-spacing:0;border-collapse:collapse">
            <tbody>
                <tr>
                    <td align="center" style="padding: 5%; background-color: #F4F6F8;">
                        <table cellspacing='0' cellpadding='0' role="presentation"
                            style="width: 600px; background-color: white; border-radius: 10px; box-shadow: 0px 0px 30px #BFBFBF29;">
                            <tr>
                                <td height="32"
                                    style="background-color: #003A78; border-top-left-radius: 10px; border-top-right-radius: 10px">
                                </td>
                            </tr>

                            <tr>
                                <td align="center" valign="center" height="85" style="background-color: #F4F6F8;">
                                    <img height="40"
                                        src="${config.server.backendServerUrl}mail-images/tcr-logo.png" />
                                </td>
                            </tr>

                            <tr>
                                <td align="center" valign="center"
                                    style="padding-top: 20px; font-size: 24px; font-family: GoogleSans-Medium; color: #003A78; background-color: white;">
                                    Dear ${name}!
                                </td>
                            </tr>

                            <tr>
                                <td align="center" valign="center"
                                    style="padding: 3px 8%; font-size: 14px; font-family: GoogleSans-Regular; color: #37404D; background-color: white; opacity: .5">
                                    You have requested to reset your TCR Portal password.
                                     <br />Use the following OTP to reset your password.
                                </td>
                            </tr>

                            <tr>
                                <td align="center" valign="center" style="padding: 10px 0; background-color: white">
                                    <a style="text-decoration: none;">
                                        <button
                                            style="padding: 10px 20px; font-size: 16px; font-family: GoogleSans-Medium; color: white; background-color: #38c976; border-radius: 5px; border: none; outline: none; cursor: pointer">
                                            ${otp}
                                        </button>
                                    </a>
                                </td>
                            </tr>

                            <tr>
                                <td align="center" valign="center"
                                    style="padding: 20px 5% 0 5%; font-size: 16px; font-family: GoogleSans-Medium; color: #003A78; background-color: white">
                                    Note
                                </td>
                            </tr>

                            <tr>
                                <td align="center" valign="center"
                                    style="padding: 3px 8%; font-size: 14px; font-family: GoogleSans-Regular; color: #37404D; background-color: white; opacity: .5">
                                    For security reasons this OTP will only be valid for a ${expireTime} minutes. For further
                                    information
                                    or questions, see the link below:
                                </td>
                            </tr>

                            <tr>
                                <td align="center" valign="center" width="60"
                                    style="font-size: 14px; line-height: 24px; background-color: white">
                                    <a style=" font-family: GoogleSans-Medium; color: #003A78; text-decoration: none"
                                        href="https://tradecreditrisk.com.au/">
                                        https://tradecreditrisk.com.au/
                                    </a>
                                </td>
                            </tr>

                            <tr>
                                <td align="center" valign="center"
                                    style="padding: 15px 0; font-size: 24px; font-family: GoogleSans-Medium; color: #EF7B10">
                                    Thank You!
                                </td>
                            </tr>`;
  if (riskAnalystName || serviceManagerName) {
    mailTemplate += `  <tr>
                                <td>
                                    <table width="100%" style="border-collapse: collapse">
                                        <tr>`;
    if (serviceManagerName) {
      if (!riskAnalystName) {
        mailTemplate += `<td align="center" style="width: 50%; border-left: 0; vertical-align: top; padding: 30px 20px; background-color: #003A78; word-break: break-word">`;
      } else {
        mailTemplate += `<td style="width: 50%; border-left: 0; vertical-align: top; padding: 30px 20px; background-color: #003A78; word-break: break-word">`;
      }
      mailTemplate += `<table>
                                                    <tr>
                                                        <td
                                                            style="font-size: 16px; font-family: GoogleSans-Medium; color: white">
                                                            Service Manager
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td>
                                                            <table>
                                                                <tr>
                                                                    <td style="padding: 3px 0; vertical-align: top;">
                                                                        <img height="18"
                                                                            src="${config.server.backendServerUrl}mail-images/account_circle_white.png" />
                                                                    </td>
                                                                    <td
                                                                        style="padding: 3px 0; font-size: 13px; color: white">
                                                                        ${serviceManagerName}
                                                                    </td>
                                                                </tr>`;
      if (serviceManagerNumber) {
        mailTemplate += `<tr>
                                                                    <td style="padding: 3px 0; vertical-align: top;">
                                                                        <img height="16"
                                                                            src="${config.server.backendServerUrl}mail-images/phone_in_talk_white.png" />
                                                                    </td>
                                                                    <td
                                                                        style="padding: 3px 0; font-size: 13px; color: white">
                                                                        <a style=" font-family: GoogleSans-Medium; color: white; text-decoration: none"
                                                                            href="tel:${serviceManagerNumber}">
                                                                            ${serviceManagerNumber}
                                                                        </a>
                                                                    </td>
                                                                </tr>`;
      }
      mailTemplate += `<tr>
                                                                    <td style="padding: 3px 0; vertical-align: top;">
                                                                        <img height="18"
                                                                            src="${config.server.backendServerUrl}mail-images/mail_white.png" />
                                                                    </td>
                                                                    <td
                                                                        style="padding: 3px 0; font-size: 13px; color: white">
                                                                        <a style=" font-family: GoogleSans-Medium; color: white; text-decoration: none"
                                                                            href="mailto:${serviceManagerEmail}">
                                                                            ${serviceManagerEmail}
                                                                        </a>
                                                                    </td>
                                                                </tr>
                                                            </table>
                                                        </td>
                                                    </tr>

                                                </table> </td>`;
    }
    if (riskAnalystName) {
      if (!serviceManagerName) {
        mailTemplate += `<td align="center" style="width: 50%; border-left: 2px solid white; border-right: 2px solid white; vertical-align: top; padding: 30px 20px; background-color: #EF7B10; word-break: break-word">`;
      } else {
        mailTemplate += `<td style="width: 50%; border-left: 2px solid white; border-right: 2px solid white; vertical-align: top; padding: 30px 20px; background-color: #EF7B10; word-break: break-word">`;
      }
      mailTemplate += `<table>
                                                   <tr>
                                                        <td
                                                            style="font-size: 16px; font-family: GoogleSans-Medium; color: white">
                                                            Risk Analyst
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td>
                                                            <table>
                                                                <tr>
                                                                    <td style="padding: 3px 0; vertical-align: top;">
                                                                        <img height="18"
                                                                            src="${config.server.backendServerUrl}mail-images/account_circle_white.png" />
                                                                    </td>
                                                                    <td
                                                                        style="padding: 3px 0; font-size: 13px; color: white">
                                                                        ${riskAnalystName}
                                                                    </td>
                                                                </tr>`;
      if (riskAnalystNumber) {
        mailTemplate += `<tr>
                                                                    <td style="padding: 3px 0; vertical-align: top;">
                                                                        <img height="16"
                                                                            src="${config.server.backendServerUrl}mail-images/phone_in_talk_white.png" />
                                                                    </td>
                                                                    <td
                                                                        style="padding: 3px 0; font-size: 13px; color: white">
                                                                        <a style=" font-family: GoogleSans-Medium; color: white; text-decoration: none"
                                                                            href="tel:${riskAnalystNumber}">
                                                                            ${riskAnalystNumber}
                                                                        </a>
                                                                    </td>
                                                                </tr>`;
      }
      mailTemplate += `<tr>
                                                                    <td style="padding: 3px 0; vertical-align: top;">
                                                                        <img height="18"
                                                                            src="${config.server.backendServerUrl}mail-images/mail_white.png" />
                                                                    </td>
                                                                    <td
                                                                        style="padding: 3px 0; font-size: 13px; color: white">
                                                                        <a style=" font-family: GoogleSans-Medium; color: white; text-decoration: none"
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
                                            <td width="33.33" align="center" valign="middle"
                                                style="vertical-align: middle; word-break: break-word; border-left: 0; padding: 20px; background-color: #F4F6F8;">
                                                <table>
                                                    <tr>
                                                        <td align="center">
                                                            <img height="30"
                                                                src="${config.server.backendServerUrl}mail-images/call.png" />
                                                        </td>
                                                    </tr>
                                                    <tr style="font-size: 13px; color: #003A78">
                                                        <td align="center">
                                                            <a style=" font-family: GoogleSans-Medium; color: #003A78; text-decoration: none"
                                                                href="tel:1234420581">
                                                                1234 420 581
                                                            </a>
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                            <td width="33.33" align="center" valign="middle"
                                                style="word-break: break-word; border-left: 2px solid white; border-right: 2px solid white; padding: 20px; background-color: #F4F6F8;">
                                                <table>
                                                    <tr>
                                                        <td align="center">
                                                            <img height="30"
                                                                src="${config.server.backendServerUrl}mail-images/mail.png" />
                                                        </td>
                                                    </tr>
                                                    <tr style="font-size: 13px; color: #003A78">
                                                        <td align="center">
                                                            <a style=" font-family: GoogleSans-Medium; color: #003A78; text-decoration: none"
                                                                href="mailto:info@tradecreditrisk.com.au">
                                                                info@tradecreditrisk.com.au
                                                            </a>
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                            <td width="33.33" align="center" valign="middle"
                                                style="word-break: break-word; border-right: 0; padding: 20px; background-color: #F4F6F8;">
                                                <table>
                                                    <tr>
                                                        <td align="center">
                                                            <img height="30"
                                                                src="${config.server.backendServerUrl}mail-images/location.png" />
                                                        </td>
                                                    </tr>
                                                    <tr style="font-size: 13px; color: #003A78">
                                                        <td align="center">
                                                            Suite 11, 857 Doncaster Road Doncaster East, Victoria 3109
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
                                    <img height="40"
                                        src="${config.server.backendServerUrl}mail-images/trad-icon.png" />
                                </td>
                            </tr>

                            <tr>
                                <td align='center' valign='center'
                                    style='padding: 5px 40px; font-size: 16px; font-family: GoogleSans-Medium; line-height: 24px; font-weight: 400;  color: #828F9D'>
                                    Copyright © 2021 Trade Credit Risk
                                </td>
                            </tr>

                            <tr>
                                <td align="center" style="padding-bottom: 40px">
                                    <table>
                                        <tr>
                                            <td>
                                                <a style="text-decoration: none">
                                                    <img height="30" style="cursor:pointer;"
                                                        src="${config.server.backendServerUrl}mail-images/facebook.png" />
                                                </a>
                                            </td>
                                            <td>
                                                <a style="text-decoration: none">
                                                    <img height="30" style="cursor:pointer;"
                                                        src="${config.server.backendServerUrl}mail-images/linkedin.png" />
                                                </a>
                                            </td>
                                            <td>
                                                <a style="text-decoration: none">
                                                    <img height="30" style="cursor:pointer;"
                                                        src="${config.server.backendServerUrl}mail-images/twitter.png" />
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</body>
</html>`;
  return mailTemplate;
};

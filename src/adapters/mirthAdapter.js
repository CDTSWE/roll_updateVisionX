const axios = require("axios");
const https = require("https");
const fs = require("fs");
const { parseStringPromise, Builder } = require("xml2js");

class MirthAdapter {
  constructor(config) {
    this.config = config;
    this.baseUrl = `${config.MIRTH_HOST}:${config.MIRTH_PORT}/api`;
    this.authHeader = `Basic ${Buffer.from(
      `${config.MIRTH_USERNAME}:${config.MIRTH_PASSWORD}`
    ).toString("base64")}`;
    this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    this.headers = {
      "X-Requested-With": "OpenAPI",
      Authorization: this.authHeader,
      Accept: "application/xml",
    };
  }

  async getChannelIdByName(name) {
    const res = await axios.get(`${this.baseUrl}/channels`, {
      headers: this.headers,
      httpsAgent: this.httpsAgent,
    });
    const data = await parseStringPromise(res.data, {
      explicitArray: true,
      mergeAttrs: false,
    });
    const channels = data.list?.channel || [];
    const found = channels.find((c) => c.name?.[0] === name);
    return found ? found.id[0] : null;
  }

  async deleteChannel(channelId) {
    await axios.delete(`${this.baseUrl}/channels?channelId=${channelId}`, {
      headers: this.headers,
      httpsAgent: this.httpsAgent,
    });
  }

  async deployChannels(xmlString) {
    const deployHeaders = {
      ...this.headers,
      "Content-Type": "application/xml",
      Accept: "application/json",
    };
    return axios.post(
      `${this.baseUrl}/channels/_deploy?returnErrors=true`,
      xmlString,
      {
        headers: deployHeaders,
        httpsAgent: this.httpsAgent,
      }
    );
  }

  async importChannel(xmlString) {
    const headers = {
      ...this.headers,
      "Content-Type": "application/xml",
      Accept: "application/json",
    };
    return axios.post(`${this.baseUrl}/channels`, xmlString, {
      headers,
      httpsAgent: this.httpsAgent,
    });
  }

  // Utility: modify and rebuild XML
  async modifyChannelXml(xmlPath) {
    const hostMap = {
      7: this.config.KEYCLOAK_LOGIN,
      4: this.config.CHECK_MWL_EXIST,
      1: this.config.CHECK_PATIENT_EXIST,
      2: this.config.PATIENT_HTTP_SENDER,
      13: this.config.CHANGESTATUS_MWL,
      15: this.config.CHECK_SERVICE_REQUEST_EXIST,
      12: this.config.CHECK_STUDY_EXIST_IN_FHIR,
      9: this.config.PATCH_END_EXAM_SUPABASE,
      14: this.config.GET_STUDY_MODALITY,
      3: this.config.IMAGINGSTUDY_HTTP_SENDER,
      5: this.config.SERVICE_REQUEST_HTTP_SENDER,
      6: this.config.PROCEDURE_HTTP_SENDER,
      10: this.config.SEND_AUDIT_LOG,
      11: this.config.SEND_AUDIT_TRAIL,
    };

    let xmlStr = fs.readFileSync(xmlPath, "utf8").trim();
    const parsed = await parseStringPromise(xmlStr, {
      explicitArray: true,
      mergeAttrs: false,
    });

    let channelObj;
    if (parsed.channel) {
      channelObj = parsed.channel;
    } else if (parsed.list?.channel?.[0]) {
      channelObj = parsed.list.channel[0];
    } else {
      throw new Error("Unexpected XML structure");
    }

    // Modify hosts
    const connectors = channelObj.destinationConnectors?.[0]?.connector || [];
    for (const conn of connectors) {
      const id = conn.metaDataId?.[0];
      if (hostMap[id]) {
        conn.properties[0].host[0] = hostMap[id];
        if (id === "7") {
          conn.properties[0].parameters[0].entry[3].list[0].string[0] =
            this.config.KC_PASSWORD;
          conn.properties[0].parameters[0].entry[2].list[0].string[0] =
            this.config.KC_USERNAME;
        }
      }
    }

    const builder = new Builder({ headless: true });
    return builder.buildObject({ channel: channelObj });
  }
}

module.exports = MirthAdapter;

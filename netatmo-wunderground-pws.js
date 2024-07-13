const {NetatmoApiClient} = require('netatmo-api-client');
const fs = require('node:fs/promises');
const path = require('path');
var PWS = require('wunderground-pws');

var netatmoAuth;
var wundergroundAuth;
var netatmoClient;

var netatmo_pws = function (args) {
    this.setAuthVars(args);
  };

netatmo_pws.prototype.setAuthVars = function(args) {
    netatmoAuth = {
        "client_id": args.netamo_client_id,
        "client_secret": args.netamo_client_secret,
        "accessToken": args.netamo_accessToken,
        "refreshToken": args.netamo_refreshToken,
        "tokenFileDirectory": args.netamo_tokenFileDirectory
    };
    wundergroundAuth = {
        "wundergroundStationId": args.wundergroundStationId,
        "wundergroundUserPassword": args.wundergroundUserPassword
    };
    netatmoClient = new NetatmoApiClient(netatmoAuth.client_id, netatmoAuth.client_secret);
}

var pws;

//Data vars
var stationData;
var winddirection;
var windspeed;
var windgust;
var humidity;
var dewptf;
var tempf;
var rainin;
var dailyrainin;
var baromin;
var softwaretype=  'netatmo-wunderground-pws';

//Get data from Netatmo weather station
netatmo_pws.prototype.getNetatmoData = async function (){
    try {


        const tokenFilePath = path.join(netatmoAuth.tokenFileDirectory, 'auth.json');

        //If saved tokens exist, try them first
        if (!netatmoClient.accessToken){
            if (await exists(tokenFilePath)) {
                try {
                    const authFileData = await fs.readFile(tokenFilePath, 'utf-8');
                    const savedAuthInfo = JSON.parse(authFileData);
                    netatmoClient.setTokens(savedAuthInfo.accessToken, savedAuthInfo.refreshToken);
                    stationData = await netatmoClient.getStationData();
                    log('Succesfully logged in with saved tokens');
                } catch (error) {
                    log(`Failed to login with saved tokens (${error.message}). Trying again with environment variables.`, 1);
                    netatmoClient.accessToken = null;
                }
            }

            //Fallback to startup environment variables
            if (!netatmoClient?.accessToken){
                try {
                    netatmoClient.setTokens(netatmoAuth.accessToken, netatmoAuth.refreshToken);
                    stationData = await netatmoClient.getStationData();
                    log('Succesfully logged in with environment variables');
                } catch (error) {
                    log(`Failed to login with environment variables (${error.message}). Please get fresh tokens from the Netatmo Dev tool`, 1);
                }
            }
        }

        const accessDetails = {
            accessToken: netatmoClient.accessToken,
            refreshToken: netatmoClient.refreshToken
        }

        //Save tokens to file
        const tokenDirectoryExists = await exists(netatmoAuth.tokenFileDirectory)
        if (!tokenDirectoryExists){
            await fs.mkdir(netatmoAuth.tokenFileDirectory);
        }
        await fs.writeFile(tokenFilePath, JSON.stringify(accessDetails));


        let dev = stationData.devices[0];
        baromin = dev.pressure.current * 0.0295299830714;

        for (let mod of dev.modules){
            if (mod.type == "OUTDOOR_MODULE"){   //Outdoor module
                if (mod.reachable){
                    log("Got outdoor data...");
                    let tempCelsius = mod.temperature.current;
                    tempf = convertFromCtoF(tempCelsius);
                    humidity = mod.humidity;
                    dewptf = (tempCelsius - (14.55 + 0.114 * tempCelsius) * (1 - (0.01 * humidity)) - Math.pow((2.5 + 0.007 * tempCelsius) * (1 - (0.01 * humidity)), 3) - (15.9 + 0.117 * tempCelsius) * Math.pow(1 - (0.01 * humidity), 14));
                    dewptf = convertFromCtoF(dewptf);
                }
                else{
                    log("Outdoor module is unreachable.", 1);
                }
            }
            else if (mod.type == "RAIN_MODULE"){  //Rain module
                if (mod.reachable){
                    log("Got rain module data...");
                    rainin = convertFromMmtoIn(mod.rain.current);
                    dailyrainin = convertFromMmtoIn(mod.rain.last24Hours);
                }
                else{
                    log("Rain module is unreachable.", 1);
                }
            }
            else if (mod.type == "WIND_MODULE"){  //Wind module
                if (mod.reachable){
                    log("Got wind module data...");
                    winddirection = mod.wind.windAngle;
                    windspeed = convertFromKphToMph(mod.wind.windStrength);
                    windgust = convertFromKphToMph(mod.wind.gustStrength);
                }
                else{
                    log("Wind module is unreachable.", 1);
                }
            }
        }
        setObservations();
    } catch (error) {
        log(error.message, 1);
    }
}

function convertFromCtoF(value){
    return value * 9 /5 + 32
}

function convertFromKphToMph(value){
    return value * 0.621371;
}

function convertFromMmtoIn(value){
    return value * 0.0393701;
}

//Send to Wunderground
function setObservations(){
    try {
        pws = undefined;
        pws = new PWS(wundergroundAuth.wundergroundStationId, wundergroundAuth.wundergroundUserPassword);
        log("Sending to Weather Underground...");
        log("Temp: " + tempf);
        log("Humidity: " + humidity);
        log("DewPt: " + dewptf);
        log("Windspeed: " + windspeed);
        log("WindGust: " + windgust);
        log("rain: " + rainin);
        log("dailyRain: " + dailyrainin);
        pws.resetObservations();
        pws.setObservations({
            winddir: winddirection,
            windspeedmph: windspeed,
            windgustmph: windgust,
            humidity: humidity,
            dewptf: dewptf,
            tempf: tempf,
            rainin: rainin,
            dailyrainin: dailyrainin,
            baromin: baromin,
            softwaretype: softwaretype
        });

        pws.sendObservations(function(err, success){
            if (err){
                log("Error sending data to Weather Underground: " + err.message, 1);
            }
            else{
                log("Data successfully sent!");
            }

        });
    } catch (error) {
        log(error.message, 1)
    }
}

//Check if file exists
async function exists(f) {
    try {
        await fs.stat(f);
        return true;
    } catch (e) {
        return false;
    }
  }

//Logging with timestamp
function log(msg, isError) {
    let dt = new Date().toLocaleString();
    if (!isError) {
        console.log(dt + ' | ' + msg);
    }
    else{
        console.error(dt + ' | ' + msg);
    }
}

module.exports = netatmo_pws;
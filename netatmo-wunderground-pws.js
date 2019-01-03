
var netatmo = require('netatmo')
var PWS = require('wunderground-pws');

var netatmoAuth;
var wundergroundAuth;

var netatmo_pws = function (args) {
    this.setAuthVars(args);
  };

netatmo_pws.prototype.setAuthVars = function(args) {
    netatmoAuth = {
        "client_id": args.netamo_client_id,
        "client_secret": args.netamo_client_secret,
        "username": args.netamo_username,
        "password": args.netamo_password,
    };   
    wundergroundAuth = {
        "wundergroundStationId": args.wundergroundStationId,
        "wundergroundUserPassword": args.wundergroundUserPassword
    };
}

var pws;
var api;

//Data vars
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
netatmo_pws.prototype.getNetatmoData = function (){
    api = new netatmo(netatmoAuth);
    console.debug("Getting Netatmo data...");
    api.getStationsData(function(err, devices) {    
        let dev = devices[0];
        baromin = dev.dashboard_data.Pressure * 0.0295299830714;
        
        for (let mod of dev.modules){
            if (mod.type == "NAModule1"){   //Outdoor module
                if (mod.reachable){
                    console.debug("Got outdoor data...");
                    let data = mod.dashboard_data;                
                    tempf = convertFromCtoF(data.Temperature);
                    humidity = data.Humidity;
                    dewptf = (data.Temperature - (14.55 + 0.114 * data.Temperature) * (1 - (0.01 * data.Humidity)) - Math.pow((2.5 + 0.007 * data.Temperature) * (1 - (0.01 * data.Humidity)), 3) - (15.9 + 0.117 * data.Temperature) * Math.pow(1 - (0.01 * data.Humidity), 14));
                    dewptf = convertFromCtoF(dewptf);   
                }
                else{
                    console.debug("Wind module is unreachable.");
                }
            }
            else if (mod.type == "NAModule3"){  //Rain module
                if (mod.reachable){
                    console.debug("Got rain module data...");
                    let data = mod.dashboard_data;
                    rainin = convertFromMmtoIn(data.sum_rain_1);
                    dailyrainin = convertFromMmtoIn(data.sum_rain_24);
                }
                else{
                    console.debug("Wind module is unreachable.");
                }
            }
            else if (mod.type == "NAModule2"){  //Wind module
                if (mod.reachable){
                    console.debug("Got wind module data...");
                    let data = mod.dashboard_data;
                    winddirection = data.WindAngle;
                    windspeed = convertFromKphToMph(data.WindStrength);
                    windgust = convertFromKphToMph(data.GustStrength);
                }
                else{
                    console.debug("Wind module is unreachable.");
                }
            }        
        }
        setObservations();    
    });
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
    pws = undefined;
    pws = new PWS(wundergroundAuth.wundergroundStationId, wundergroundAuth.wundergroundUserPassword);
    console.debug("Sending to Weather Underground...");
    console.debug("Temp: " + tempf);
    console.debug("Humidity: " + humidity);
    console.debug("DewPt: " + dewptf);
    console.debug("Windspeed: " + windspeed);
    console.debug("WindGust: " + windgust);
    console.debug("rain: " + rainin);
    console.debug("dailyRain: " + dailyrainin);
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
            console.error("Error sending data to Weather Underground: " + err.message);
        }
        else{
            console.debug("Data successfully sent!");
        }
        
    });
}

module.exports = netatmo_pws;
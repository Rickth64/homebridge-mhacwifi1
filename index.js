/* MIT License

Copyright (c) 2020 Rickth64

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE. */

'use strict'

const acwm = require("./acwm-api/acwm-api.js")

let Service, Characteristic

module.exports = (homebridge) => {
    Service = homebridge.hap.Service
    Characteristic = homebridge.hap.Characteristic
    homebridge.registerAccessory('homebridge-mhacwifi1', 'MH-AC-WIFI-1', MHACWIFI1Accessory)
}

function MHACWIFI1Accessory(log, config) {
    this.log = log
    this.config = config

    this.dataMap = {
        "active": {
            "uid": 1, /* on,off */
            "mh": function (homekitActiveValue) {
                let mhActiveValue;
                switch (homekitActiveValue) {
                    case Characteristic.Active.ACTIVE:
                        mhActiveValue = 1;
                        break;
                    case Characteristic.Active.INACTIVE:
                    default:
                        mhActiveValue = 0;
                        break;
                }
                return mhActiveValue;
            },
            "homekit": function (mhActiveValue) {
                let homekitActiveValue;
                switch (mhActiveValue) {
                    case 1:
                        homekitActiveValue = Characteristic.Active.ACTIVE;
                        break;
                    case 0:
                    default:
                        homekitActiveValue = Characteristic.Active.INACTIVE;
                        break;
                }
                return homekitActiveValue;
            }
        },
        "mode": {
            "uid": 2, /* user mode */
            "mh": function (homekitStateValue) {
                let mhStateValue;
                switch (homekitStateValue) {
                    case Characteristic.TargetHeaterCoolerState.HEAT:
                        mhStateValue = 1;
                        break;
                    case Characteristic.TargetHeaterCoolerState.COOL:
                        mhStateValue = 4;
                        break;
                    case Characteristic.TargetHeaterCoolerState.AUTO:
                    default:
                        mhStateValue = 0;
                }
                return mhStateValue;
            },
            "homekit": function (mhStateValue) {
                let homekitStateValue;
                switch (mhStateValue) {
                    case 4: /* cool */
                        homekitStateValue = Characteristic.TargetHeaterCoolerState.COOL;
                        break;
                    case 3: /* fan, no homekit mapping so go for AUTO */
                        homekitStateValue = Characteristic.TargetHeaterCoolerState.AUTO;
                        break;
                    case 2: /* dry, no homekit mapping so go for AUTO */
                        homekitStateValue = Characteristic.TargetHeaterCoolerState.AUTO;
                        break;
                    case 1: /* heat */
                        homekitStateValue = Characteristic.TargetHeaterCoolerState.HEAT;
                        break;
                    case 0: /* auto */
                    default:
                        homekitStateValue = Characteristic.TargetHeaterCoolerState.AUTO;
                        break;
                }
                return homekitStateValue;
            }
        },
        "rotationspeed": {
            "uid": 4, /* fan speed, values are 0, 1, 2, 3, 4 for both platforms */
            "mh": function (homekitRotationSpeedValue) {
                return homekitRotationSpeedValue;
            },
            "homekit": function (mhRotationSpeedValue) {
                return mhRotationSpeedValue;
            }
        },
        "setpoint": {
            "uid": 9, /* user setpoint */
            "mh": this.hkTempToMhTemp,
            "homekit": this.mhTempToHkTemp
        },
        "temperature": {
            "uid": 10, /* return path temperature */
            "mh": this.hkTempToMhTemp,
            "homekit": this.mhTempToHkTemp
        },
        "lockphysicalcontrols": {
            "uid": 12, /* remote disable */
            "mh": function (homekitLockValue) {
                let mhLockValue;
                switch (homekitLockValue) {
                    case Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED:
                        mhLockValue = 1;
                        break;
                    case Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED:
                    default:
                        mhLockValue = 0;
                        break;
                }
                return mhLockValue;
            },
            "homekit": function (mhLockValue) {
                let homekitLockValue;
                switch (mhLockValue) {
                    case 1:
                        homekitLockValue = Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED;
                        break;
                    case 0:
                    default:
                        homekitLockValue = Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED;
                        break;
                }
                return homekitLockValue;
            }
        },
        "mintemp": {
            "uid": 35, /* min temperature setpoint */
            "mh": this.hkTempToMhTemp,
            "homekit": this.mhTempToHkTemp
        },
        "maxtemp": {
            "uid": 36, /* max temperature setpoint */
            "mh": this.hkTempToMhTemp,
            "homekit": this.mhTempToHkTemp
        },
        "outdoortemperature": {
            "uid": 37, /* outdoor temperature */
            "mh": this.hkTempToMhTemp,
            "homekit": this.mhTempToHkTemp
        }
    }

    this.airco = new acwm(config.ip, config.username, config.password)

    this.service = new Service.HeaterCooler(this.config.name)
}

MHACWIFI1Accessory.prototype = {
    getServices: function () {
        /*
         * The getServices function is called by Homebridge and should return an array of Services this accessory is exposing.
         * It is also where we bootstrap the plugin to tell Homebridge which function to use for which action.
         */

        /* Create a new information service. This just tells HomeKit about our accessory. */
        const informationService = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Manufacturer, this.config.manufacturer || 'Mitsubishi Heavy Industries')
            .setCharacteristic(Characteristic.Model, this.config.model || 'MH-AC-WIFI-1')
            .setCharacteristic(Characteristic.SerialNumber, this.config.serialNumber || '123-456-789')

        /*
         * For each of the service characteristics we need to register setters and getter functions
         * 'get' is called when HomeKit wants to retrieve the current state of the characteristic
         * 'set' is called when HomeKit wants to update the value of the characteristic
         */

        this.service.getCharacteristic(Characteristic.Active)
            .on('get', callback => { this.getValue('active', callback) })
            .on('set', (value, callback) => { this.setValue('active', value, callback) })

        this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .on('get', callback => { this.getCurrentState(callback) })

        this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .on('get', callback => { this.getValue('mode', callback) })
            .on('set', (value, callback) => { this.setValue('mode', value, callback) })

        this.service.getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', callback => { this.getValue('temperature', callback) })

        this.service.getCharacteristic(Characteristic.RotationSpeed)
            .setProps({ "maxValue": 4, "minValue": 0, "minStep": 1 })
            .on('get', callback => { this.getValue('rotationspeed', callback) })
            .on('set', (value, callback) => { this.setValue('rotationspeed', value, callback) })

        this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .setProps({ "maxValue": 30, "minValue": 18, "minStep": 1 }) // TODO: get from API
            .on('get', callback => { this.getValue('setpoint', callback) })
            .on('set', (value, callback) => { this.setValue('setpoint', value, callback) })

        this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .setProps({ "maxValue": 30, "minValue": 18, "minStep": 1 }) // TODO: get from API
            .on('get', callback => { this.getValue('setpoint', callback) })
            .on('set', (value, callback) => { this.setValue('setpoint', value, callback) })

        this.service.getCharacteristic(Characteristic.LockPhysicalControls)
            .on('get', callback => { this.getValue('lockphysicalcontrols', callback) })
            .on('set', (value, callback) => { this.setValue('lockphysicalcontrols', value, callback) })

        /* Return both the main service (this.service) and the informationService */
        return [informationService, this.service]
    },

    /*
    * Helpers
    **/

    getValue: function (datapoint, callback) {
        this.airco.getDataPointValue(this.dataMap[datapoint].uid)
            .then(info => {
                let value = this.dataMap[datapoint].homekit(info.value)
                this.log(`Successfully retrieved value for ${datapoint}`, value)
                callback(null, value)
            })
            .catch(error => {
                this.log(`Error occured while getting value for ${datapoint}`, error)
                callback(error)
            })
    },

    setValue: function (datapoint, value, callback) {
        this.airco.setDataPointValue(this.dataMap[datapoint].uid, this.dataMap[datapoint].mh(value))
            .then(info => {
                this.log(`Successfully set value for ${datapoint}`, value)
                callback(null)
            })
            .catch(error => {
                this.log(`Error occured while setting value for ${datapoint} to ${value}`, error)
                callback(error)
            })
    },

    //Special case. There is only one setpoint temp, need to determine current state in AUTO mode
    getCurrentState: function(callback) {
        //Get current mode
        this.airco.getDataPointValue(this.dataMap["mode"].uid)
            .then(info => {
                //Got the mode. If it is AUTO try to determine if currently heating or cooling
                this.log(`Successfully got mode: ${info.value}`)
                switch (info.value) {
                    case 4: /* cool */
                        callback(null, Characteristic.CurrentHeaterCoolerState.COOLING);
                        break;
                    case 3: /* fan, no homekit mapping so go for IDLE */
                        callback(null, Characteristic.CurrentHeaterCoolerState.IDLE);
                        break;
                    case 2: /* dry, no homekit mapping so go for IDLE */
                        callback(null, Characteristic.CurrentHeaterCoolerState.IDLE);
                        break;
                    case 1: /* heat */
                        callback(null, Characteristic.CurrentHeaterCoolerState.HEATING);
                        break;
                    case 0: /* auto */
                    default:
                        //Get current temp and setpoint
                        this.airco.getDataPointValue(this.dataMap["temperature"].uid)
                            .then(currentTemp => {
                                this.log(`Successfully got currentTemp: ${currentTemp.value}`)
                                this.airco.getDataPointValue(this.dataMap["setpoint"].uid)
                                    .then(setpoint => {
                                        this.log(`Successfully got setPoint: ${setpoint.value}`)
                                        if (currentTemp.value <= setpoint.value - 10) {
                                            this.log(`Probably HEATING`)
                                            callback(null, Characteristic.CurrentHeaterCoolerState.HEATING);
                                        }else if (currentTemp.value >= setpoint.value + 10) {
                                            this.log(`Probably COOLING`)
                                            callback(null, Characteristic.CurrentHeaterCoolerState.COOLING);
                                        }else{
                                            this.log(`Probably IDLE`)
                                            callback(null, Characteristic.CurrentHeaterCoolerState.IDLE);
                                        }
                                    })
                                    .catch(error => {
                                        this.log(`Error occured while getting value for setpoint`, error)
                                        callback(error)
                                    })
                            })
                            .catch(error => {
                                this.log(`Error occured while getting value for temperature`, error)
                                callback(error)
                            })
                        break;
                }
            })
            .catch(error => {
                this.log(`Error occured while getting value for mode`, error)
                callback(error)
            })

    },

    mhTempToHkTemp: function (mhTemp) {
        let homekitTemperatureValue = parseInt(mhTemp) / 10;
        return homekitTemperatureValue;
    },

    hkTempToMhTemp: function (hkTemp) {
        let mhTemperatureValue = hkTemp * 10;
        return mhTemperatureValue;
    },

    identify: function (callback) {
        this.log(`Identify requested`)
        this.airco.identify()
            .then(result => {
                this.log(`Identify succeeded`)
                callback(null)
            })
            .catch(error => {
                this.log(`Identify failed`, error)
                callback(error)
            })
    }
}

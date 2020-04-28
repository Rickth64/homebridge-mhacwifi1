'use strict'

/*
  Copyright (c) 2019 Ramón Baas
  Modified work copyright (c) 2020 Rickth64

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

  NodeJS code to control an airconditioner via an Intesis (airconwithme) web server
*/

const http = require('http')
const zlib = require('zlib')

class IntesisACWM {

    constructor(ip, username, password, auto) {
        this.ip = ip
        this.username = username
        this.password = password
        this.auto = (auto == null ? true : auto) // auto login
        this.initDone = false
        this.session
    }


    // Enable a retry mechanism for the writeCommand operation, which can intermittently fail on ECONNRESET
    wait = ms => new Promise(r => setTimeout(r, ms));

    retryWriteCommandOperation = (cmd, data, delay, times) => new Promise((resolve, reject) => {
        return this.writeCommand(cmd, data)
            .then(resolve)
            .catch((reason) => {
                if (times - 1 > 0) {
                    return this.wait(delay)
                        .then(this.retryWriteCommandOperation.bind(null, cmd, data, delay, times - 1))
                        .then(resolve)
                        .catch(reject);
                }
                return reject(reason);
            });
    });

    // init: Get reference information
    // The file 'data.json' should be accessible on the web server wothout authentication
    init() {
        return new Promise((resolve, reject) => {
            const url = {
                host: this.ip,
                path: '/js/data/data.json',
                encoding: 'utf8'
            }
            http.get(url, response => {
                const { statusCode } = response
                let data = new Buffer.from('')
                response.on('data', x => { data = Buffer.concat([data, x]) })
                response.on('end', () => {
                    if (statusCode === 200) {
                        this.ref = JSON.parse(zlib.unzipSync(new Buffer(data, 'utf8')).toString())
                        this.initDone = true
                        resolve(this.ref)
                    } else {
                        reject('Cannot load ' + url.path)
                    }
                })
                response.on('error', (error) => {
                    reject(error)
                })
            })
        })
    }

    // writeCommand: write a command to the unit via port 80
    // Expected only to be used internally
    writeCommand(cmd, data) {
        return new Promise((resolve, reject) => {
            const payload = JSON.stringify({
                command: cmd,
                data: data
            })
            const options = {
                hostname: this.ip,
                path: '/api.cgi',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': payload.length
                }
            }
            const req = http.request(options, (res) => {
                res.on('data', async (d) => {
                    let result = JSON.parse(d)
                    result.code = res.statusCode
                    //console.log(result)
                    if (result.success) {
                        resolve(result)
                    } else { // auto login
                        if (this.auto && cmd !== 'login' && result.error.code === 1) {
                            try {
                                await this.login()
                                data.sessionID = this.session // update session ID
                                resolve(this.writeCommand(cmd, data))
                            } catch (error) {
                                reject(error)
                            }
                        } else {
                            reject(result)
                        }
                    }
                })
            })

            req.on('error', (error) => {
                reject(error)
            })

            req.write(payload)
            req.end()
        }
        )
    }

    // getInfo: get info about the unit
    // This function does not need autorization
    getInfo() {
        return new Promise((resolve, reject) => {
            this.writeCommand('getinfo', null)
                .then(result => {
                    if (result.success) {
                        this.info = result.data.info
                        resolve(this.info)
                    } else {
                        reject(result)
                    }
                })
                .catch(error => reject(error))
        })
    }

    // Login to the web interface (most functions need authorization to work)
    // Provide a username and password (default is admin, admin)
    login(username, password) {
        return new Promise((resolve, reject) => {
            this.writeCommand('login', { username: username || this.username, password: password || this.password })
                .then(result => {
                    if (result.success) {
                        this.username = username || this.username
                        this.password = password || this.password
                        this.session = result.data.id.sessionID
                        resolve(result)
                    } else {
                        reject(result)
                    }
                })
                .catch(error => reject(error))
        })
    }

    // logout: end the session
    logout() {
        let session = this.session
        delete this.session
        return this.writeCommand('logout', { sessionID: session })
    }

    // getSession: return the session identifier
    getSession() {
        return this.session
    }

    getCurrentConfig() {
        return new Promise((resolve, reject) => {
            this.writeCommand('getcurrentconfig', { sessionID: this.session })
                .then(result => {
                    if (result.success) {
                        resolve(result.data.config)
                    } else {
                        reject(result)
                    }
                })
                .catch(error => reject(error))
        })
    }

    // getAvailableDataPoints: return the list of uids of the datapoints that are supported by this device
    getAvailableDataPoints() {
        return new Promise((resolve, reject) => {
            this.writeCommand('getavailabledatapoints', { sessionID: this.session })
                .then(result => {
                    if (result.success) {
                        resolve(result.data.dp.datapoints)
                    } else {
                        reject(result)
                    }
                })
                .catch(error => reject(error))
        })
    }

    // getDataPointValue: get the value of a certain datapoint (use 'null' to get all)
    getDataPointValue(uid) {
        return new Promise((resolve, reject) => {
            /*this.writeCommand('getdatapointvalue', { sessionID: this.session, uid: uid || 'all' })*/
            this.retryWriteCommandOperation('getdatapointvalue', { sessionID: this.session, uid: uid || 'all' }, 100, 5)
                .then(result => {
                    if (result.success) {
                        resolve(result.data.dpval)
                    } else {
                        reject(result)
                    }
                })
                .catch(error => reject(error))
        })
    }

    // setDataPointValue:
    setDataPointValue(uid, value) {
        return new Promise(async (resolve, reject) => {
            /*
            if (this.dp === undefined) {
              try {
                this.dp = await this.getAvailableDataPoints()
              } catch (error) {
                reject(error)
              }
            }
            if (this.dp[uid] !== undefined) {
      
            } else {
              reject('UID ' + uid + ' not supported')
            }
            */
            /*this.writeCommand('setdatapointvalue', { sessionID: this.session, uid: uid, value: value })*/
            this.retryWriteCommandOperation('setdatapointvalue', { sessionID: this.session, uid: uid, value: value }, 100, 5)
                .then(result => {
                    if (result.success) {
                        resolve(result)
                    } else {
                        reject(result)
                    }
                })
                .catch(error => reject(error))
        })
    }

    // identify: flash the light on de device to identify it
    identify() {
        return writeCommand('identify', { sessionID: this.session })
    }

    // reboot: reboot the device
    reboot() {
        return writeCommand('reboot', { sessionID: this.session })
    }

    // Not implemented:
    // - update_password { sessionID, currentPass, newPass }
    // - wpsstart { sessionID }
    // - setdefaults { sessionID }
    // - setconfig { sessionID, ip, netmask, dfltgw, dhcp, ssid, security, lastconfigdatetime }
    // - getaplist { sessionID }

}

module.exports = IntesisACWM

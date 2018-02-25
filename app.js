var fs = require("fs");
var os = require('os');
var dns = require('dns');
var readlineSync = require('readline-sync');
var SerialPort = require("serialport");
var telnet = require('telnet-client');
var tftp = require("tftp");
var path = require("path");

var connectType = ((process.argv[2] === "-t" || process.argv[2] === "--telnet") ? "telnet" : "serial");

if (process.argv[2] != undefined && (process.argv[2].toLowerCase() == "-h" || process.argv[2].toLowerCase() == "--help")) {
    console.log("\nUsage:\n" +
        "\tnode app.js [-t|--telnet]\n\n" +
        "\tusing serial port as default\n\n" +
        "\tignore all parameters except '-t' and '--telnet'"
    );
    process.exit(0);
}

var uploadDir = "./dut-root/";

try {
	fs.accessSync(path.join(__dirname, uploadDir));
}
catch(err) {
	fs.mkdirSync(uploadDir);
}

(async function() {
    try {
        var localIP = getLocalIP();
        var dutIP = getDUTIP(localIP);

        var server = tftp.createServer({
            host: localIP,
            root: uploadDir,
            denyPUT: true
        });

        await connectTftp(server);

        if (connectType == "telnet") {
            var params = {
                host: dutIP,
                timeout: 999999999999,
            }
            var connection = new telnet();

            await connectTelnet(connection, params);

        } else {
            var portName = await getSerialPort();
            var serialPort = new SerialPort(portName, { baudRate: 115200, autoOpen: false });
            await openSerialPort(serialPort, portName);
        }

        server.on("request", function(req, res) {
            console.log(`[${req.stats.remoteAddress}:${req.stats.remotePort}] [${(new Date()).toLocaleString()}] ` + req.file.replace(/\\/g, "/"));
            req.on("error", function(error) {
                console.error(`\x1B[31m[${req.stats.remoteAddress}:${req.stats.remotePort}] ` + req.file.replace(/\\/g, "/") + ` ${error.message}\x1B[0m`);
            });
        });

        fs.watch(uploadDir, { recursive: true }, function(eventType, filename) {
            var changedPath = uploadDir + filename;
            fs.access(changedPath, fs.constants.R_OK, function(err) {
                if (!err) {
                    fs.stat(changedPath, function(err2, stats) {
                        for (let i = 0; i < filename.length; i++) {
                            let code = filename.charCodeAt(i);
                            if (code > 127 || code < 32)
                                return;
                        }
                        filename = "/" + filename.replace(/\\/g, "/");
                        if (stats.isDirectory() && eventType == "rename") {
                            var cmd = "[ -d \"" + filename + "\" ] || mkdir -p " + filename + "\n";
                        } else if (!stats.isDirectory()) {
                            var cmd = "";
                            if (filename.match(/\//g).length > 1) {
                                var folder = filename.replace(/^(.*)\/[^\/]*$/g, "$1");
                                cmd += "[ -d \"" + folder + "\" ] || mkdir -p " + folder + "; "
                                cmd += "cd " + folder + "; "

                            }
                            cmd += "tftp -g " + localIP + " -r " + filename + "\n";
                        } else {
                            return;
                        }

                        if (connectType == "telnet") {
                            connection.exec(cmd).catch(function(err) {
                                console.log(err);
                            })
                        } else {
                            serialPort.write(cmd, function(err) {
                                if (err) {
                                    return console.log('Error on write: ', err.message);
                                }
                            })
                        }
                    })
                }
            });
        });
    } catch (err) {
        console.log(err);
        process.exit(1);
    }
})();

function getSerialPort() {
    var portList = [];
    return new Promise(function(resolve, reject) {
        SerialPort.list(function(err, ports) {
            ports.forEach(function(port) {
                if (port.comName.slice(0, 3) == "COM" && port.manufacturer.indexOf("Silicon") != -1) {
                    portList.push(port.comName);
                }
            });

            if (portList.length == 0) {
                console.log("Can't find useful serial port.");
                process.exit(1);
            } else if (portList.length > 1) {
                var selected = parseInt(readlineSync.keyInSelect(portList, 'Which serial port you want to use? '));
                var portName = portList[selected];
            } else {
                var portName = portList[0];
            }

            resolve(portName);
        });
    })
}

function openSerialPort(serialPort, portName) {
    return new Promise(function(resolve, reject) {
        serialPort.open(function(error) {
            if (error) {
                console.log(`Can not open '${portName}'`);
                reject();
            } else {
                console.log(`Open serial port '${portName}' successfully`);
                resolve();
            }
        })
    })
}

function getLocalIP() {
    var ips = [];
    var delta = "";
    var networks = os.networkInterfaces();
    for (let i in networks) {
        for (let j = 0; j < networks[i].length; j++) {
            if (networks[i][j].family == "IPv4") {
                if (/^\d{1,3}(\.\d{1,3}){3}$/g.test(networks[i][j].address) == false)
                    continue;
                else if (networks[i][j].address == "127.0.0.1")
                    continue;
                else if (networks[i][j].address.slice(0, 9) == "172.17.92")
                    delta = networks[i][j].address;
                else {
                    ips.push(networks[i][j].address);
                }
            }
        }
    }

    var localIP = "";
    if (ips.length == 0) {
        if (delta != "" && readlineSync.keyInYN(`Is this IP '${delta}' your DUT assigned? `)) {
            localIP = delta;
        } else {
            console.log("Can not find suitable IP");
            process.exit(1);
        }
    } else if (ips.length > 1) {
        var selected = parseInt(readlineSync.keyInSelect(ips, 'Which IP is your DUT assigned? '));
        if (selected == -1) {
            console.log("Bye Bye...");
            process.exit(1);
        }
        localIP = ips[selected];
    } else {
        localIP = ips[0];
    }

    return localIP;
}

function getDUTIP(localIP) {
    var dnss = dns.getServers()

    let mask = localIP.replace(/((\d{1,3}\.){3})\d{1,3}/g, "$1");
    for (let i = 0; i < dnss.length; i++) {
        if (dnss[i].replace(/((\d{1,3}\.){3})\d{1,3}/g, "$1") == mask)
            return dnss[i];
    }

    do {
        if (userIP != undefined) {
            console.log("Invalid IP address format");
        }
        var userIP = readlineSync.question('Input the IP address of DUT: ');
    }
    while (isIPFormat(userIP) === false)

    return userIP;
}

function isIPFormat(str) {
    str = str.replace(/00(\d)/g, "$1").replace(/0(\d{2})/g, "$1").replace(/0(\d)/g, "$1");
    if (/^((25[0-5]|2[0-4]\d|((1\d{2})|([1-9]?\d)))\.){3}(25[0-5]|2[0-4]\d|((1\d{2})|([1-9]?\d))){1}$/g.test(str) == false) {
        return false;
    } else {
        return str;
    }
}

function connectTftp(server) {
    return new Promise(function(resolve, reject) {
        server.listen()

        server.on("listening", function() {
            resolve();
        });

        server.on("error", function(error) {
            reject(error);
        });
    })
}

function connectTelnet(connection, params) {
    return new Promise(function(resolve, reject) {
        connection.connect(params).then(function() {
            console.log(`Connect to '${params.host}' via telnet successfully.`);
            resolve();
        }).catch(function(err) {
            console.log("Can not connect DUT via telnet");
            reject(err);
        })
    });
}
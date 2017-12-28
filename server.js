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
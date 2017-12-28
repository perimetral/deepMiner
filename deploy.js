const cfg = global.cfg = require('./config');

const fs = require('fs');

let netTuned = '';
for (let i in cfg.netTune) netTuned += `${i}=${cfg.netTune[i]}`;
fs.writeFileSync(cfg.netTunePath, netTuned, 'utf8');
netTuned = undefined;

let newWebRoot = `${__dirname}/${cfg.webRoot}/`;
let nginx = fs.readFileSync(cfg.nginxInput, 'utf8');
nginx = nginx.split('$$uwsuri').join(`${cfg.server.domain}:${cfg.server.port}`);
nginx = nginx.split('$$appport').join(cfg.server.appPort);
nginx = nginx.split('$$appdomain').join(cfg.server.domain);
nginx = nginx.split('$$proxyProto').join(cfg.ssl.enabled ? 'https' : 'http');
fs.writeFileSync(cfg.nginxPath, nginx, {
	encoding: 'utf8',
	flag: 'a',
});
nginx = undefined;

let worker = fs.readFileSync(`${newWebRoot}/${cfg.workerFilename}`, 'utf8');
worker = worker.split('$$endpoint').join(cfg.server.uri);
worker = worker.split('$$wsEndpoint').join(cfg.server.wsuri);
fs.writeFileSync(`${newWebRoot}/${cfg.workerFilename}`, worker, 'utf8');
worker = undefined;

let miner = fs.readFileSync(`${newWebRoot}/${cfg.minerFilename}`, 'utf8');
miner = miner.split('$$endpoint').join(cfg.server.uri);
miner = miner.split('$$wsEndpoint').join(cfg.server.wsuri);
fs.writeFileSync(`${newWebRoot}/${cfg.minerFilename}`, miner, 'utf8');
miner = undefined;

let cnmin = fs.readFileSync(`${newWebRoot}/lib/cryptonight-asmjs.min.js`, 'utf8');
cnmin = cnmin.split('$$endpoint').join(cfg.server.uri);
cnmin = cnmin.split('$$wsEndpoint').join(cfg.server.wsuri);
fs.writeFileSync(`${newWebRoot}/lib/cryptonight-asmjs.min.js`, cnmin, 'utf8');
cnmin = undefined;

process.exit(0);
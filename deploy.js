const cfg = global.cfg = require('./config');

const fs = require('fs');

let netTuned = '';
for (let i in cfg.netTune) netTuned = netTuned.concat(cfg.netTune[i]);
fs.writeFileSync(cfg.netTunePath, netTuned);
netTuned = undefined;

let nginx = fs.readFileSync(cfg.nginxInput);
nginx = nginx.split('$$uwsuri').join(`${cfg.server.domain}:${cfg.server.port}`);
nginx = nginx.split('$$appport').join(cfg.server.appPort);
nginx = nginx.split('$$appdomain').join(cfg.server.domain);
nginx = nginx.split('$$libRoot').join(cfg.libRoot);
nginx = nginx.split('$$webRoot').join(cfg.webRoot);
nginx = nginx.split('$$proxyProto').join(cfg.ssl.enabled ? 'https' : 'http');
fs.writeFileSync(cfg.nginxPath, nginx);
nginx = undefined;

let worker = fs.readFileSync(`${cfg.webRoot}/${cfg.workerFilename}`);
worker = worker.split('$$endpoint').join(cfg.server.uri);
worker = worker.split('$$wsEndpoint').join(cfg.server.wsuri);
fs.writeFileSync(`${cfg.webRoot}/${cfg.workerFilename}`, worker);
worker = undefined;

let miner = fs.readFileSync(`${cfg.webRoot}/${cfg.minerFilename}`);
miner = miner.split('$$endpoint').join(cfg.server.uri);
miner = miner.split('$$wsEndpoint').join(cfg.server.wsuri);
fs.writeFileSync(`${cfg.webRoot}/${cfg.minerFilename}`, miner);
miner = undefined;
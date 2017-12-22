const cfg = global.cfg = require('../config.js');

const fs = require('fs');

let netTuned = '';
for (let i in cfg.netTune) netTuned = netTuned.concat(cfg.netTune[i]);
fs.writeFileSync(cfg.netTunePath, netTuned);
netTuned = undefined;

let nginx = fs.readFileSync(cfg.nginxInput);
nginx = nginx.split('$$uwsuri').join(`${cfg.server.domain}:${cfg.server.port}`);
nginx = nginx.split('$$appport').join(cfg.server.appPort);
nginx = nginx.split('$$appdomain').join(cfg.server.domain);
nginx = nginx.split('$libRoot').join(cfg.libRoot);
nginx = nginx.split('$$webRoot').join(cfg.webRoot);
fs.writeFileSync(cfg.nginxPath, nginx);
nginx = undefined;

let clientJS = fs.readFileSync(`${cfg.webRoot}`)
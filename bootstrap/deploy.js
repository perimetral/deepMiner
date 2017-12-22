const cfg = global.cfg = require('../config.js');

const fs = require('fs');

let nettuned = '';
for (let i in cfg.nettune) nettuned = nettuned.concat(cfg.nettune[i]);
fs.writeFileSync(cfg.nettunepath, nettuned);
nettuned = undefined;


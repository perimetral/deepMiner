const cfg = {};

cfg.server = {};
cfg.server.appPort = 80;
cfg.server.port = 7777;
//cfg.server.domain = 'www.mywiki.ca';
cfg.server.domain = 'localhost';

cfg.conn = {};
cfg.conn.pool = 'ca.minexmr.com:4444';
cfg.conn.poolpass = '';
//cfg.conn.wallet = '42HoNKKRQRBfZcR3C4ydFC3e25n5KrerUDnLDbcmDhdw25KoLiiJ9GfQ2K76PxMpuY8W1U46BBbRnbkfD959kDx25uTo6fo';
cfg.conn.wallet = '489pGCCUw1xVRg7CKFTs812pozSSYocSLF8bQCjy4tpyKFaP56EUuiUg3BL7QDTnpaHYq2EDi737vLwnnJNg3F853KkWG3m';

cfg.app = {};
cfg.app.path = '~/mnt';

cfg.uws = {};
cfg.uws.serverOpts = {
    path: '/proxy',
    maxPayload: 256,
};

cfg.ssl = {};
cfg.ssl.enabled = false;
cfg.ssl.key = '';
cfg.ssl.cert = '';

cfg.server.uri = `${cfg.ssl.enabled ? 'https' : 'http'}://${cfg.server.domain}:${cfg.server.appPort}`;
cfg.server.wsuri = `${cfg.ssl.enabled ? 'wss' : 'ws'}://${cfg.server.domain}:${cfg.server.appPort}`;

cfg.netTunePath = '/etc/sysctl.d/89-udeepminer.conf';
cfg.netTune = {
    'net.ipv4.tcp_tw_reuse': '1',
    'net.ipv4.tcp_fin_timeout': '10',
    'net.core.netdev_max_backlog': '32768',
    'net.ipv4.tcp_keepalive_probes': '2',
    'net.ipv4.tcp_synack_retries': '2',
    'net.ipv4.tcp_syn_retries': '2',
    'net.ipv4.ip_local_port_range': '1024 64000',
    'net.ipv4.tcp_syncookies': '0',
    'net.ipv4.netfilter.ip_conntrack_max': `${16777216 * 8}`,
    'net.ipv4.tcp_timestamps': '1',
    'net.ipv4.tcp_sack': '1',
    'net.core.somaxconn': '32768',
    'net.core.rmem_max': `${16777216 * 30}`,
    'net.core.wmem_max': `${16777216 * 30}`,
    'net.ipv4.tcp_max_syn_backlog': '32768',
    'net.ipv4.tcp_max_tw_buckets': '16777216',
    'net.ipv4.tcp_no_metrics_save': '1',
    'vm.min_free_kbytes': `${1024 * 256}`,
    'vm.swappiness': '3'
};
cfg.nginxInput = './nginx.conf';
cfg.nginxPath = '/etc/nginx/nginx.conf';
cfg.webRoot = 'web';
cfg.libRoot = `${__dirname}/${cfg.webRoot}/lib/`;
cfg.demoPage = 'demo.html';
cfg.workerFilename = 'worker.js';
cfg.minerFilename = 'deepMiner.js';

cfg.logger = async (...data) => {
    console.log(...data);
};

module.exports = cfg;

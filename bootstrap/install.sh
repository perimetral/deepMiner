#!/bin/sh

echo "Welcome to uDeepMiner installation script!"
echo ""

NEED_NODE=false

MACHINE_BITS=`uname -m`
if [ ! "$MACHINE_BITS" = 'x86_64' ]
then
    echo "!!! ${MACHINE_BITS} arch is not supported"
    exit
fi

if [ ! -n "$NODE_VERSION" ]
then
    NODE_VERSION="v9.3.0"
fi

echo "... checking whether Node.js ${NODE_VERSION} is installed"
NODE_LOCATION=`which node`
if [ "$NODE_LOCATION" = '' ]
then
    NEED_NODE=true
else
    EXISTING_NODE_VERSION=`node -v`
    if [ "$EXISTING_NODE_VERSION" != "$NODE_VERSION" ]
    then
        NEED_NODE=true
    fi
fi
if [ "$NEED_NODE" = true ]
then
    echo "... installing fresh Node.js, nginx and build-essential"
    curl -#L https://deb.nodesource.com/setup_9.x | sudo -E bash -
    sudo apt-get install -y nodejs nginx build-essential
fi
echo "... updating npm"
sudo npm update -g npm

echo "... installing pm2"
sudo npm i -g pm2

echo "... fetching app"
git clone -o uDeepMiner https://github.com/perimetral/uDeepMiner.git
cd uDeepMiner

echo "... installing deps"
npm i

echo "... importing nginx configuration"
cp ./nginx.conf /etc/nginx/.

echo "... switching to configurator"
sudo node ./bootstrap/deploy.js
9#!/bin/sh

echo "Welcome to uDeepMiner installation script!"
echo ""

NEED_NODE=false
INSTALL_PATH="$1"
RUNNER_UID=`id -u`
USERNAME=`whoami`

if [ $RUNNER_UID != 0 ]
then
    echo "!!! Run as superuser to proceed!"
    exit 0
fi

if [ "$SUDO_USER" = `id -un 0` ]
then
    echo "!!! BE TOO CAREFUL WHEN INSTALLING AS ROOT !"
else
    USERNAME=$SUDO_USER
fi

GROUPNAME=`sudo -u $USERNAME id -gn $USERNAME`

if [ "$INSTALL_PATH" = '' ]
then
    INSTALL_PATH="/home/$USERNAME/.local"
    if [ ! -d "$INSTALL_PATH" ]
    then
        mkdir --mode a=rx,u+w $INSTALL_PATH
        chown -R $USERNAME:$GROUPNAME $INSTALL_PATH
    fi
fi
echo "... installing as $USERNAME to $INSTALL_PATH"

if [ ! -n "$NODE_VERSION" ]
then
    NODE_VERSION="v9.3.0"
fi

echo "... checking whether Node.js ${NODE_VERSION} is installed"
NODE_LOCATION=`sudo -u $USERNAME which node`
if [ "$NODE_LOCATION" = '' ]
then
    NEED_NODE=true
else
    EXISTING_NODE_VERSION=`sudo -u $USERNAME node -v`
    if [ "$EXISTING_NODE_VERSION" != "$NODE_VERSION" ]
    then
        NEED_NODE=true
    fi
fi
if [ "$NEED_NODE" = true ]
then
    echo "... installing fresh Node.js"
    sudo -u $USERNAME curl -#L https://deb.nodesource.com/setup_9.x | sudo -E bash -
    apt-get install -y nodejs
fi

echo "... installing build libs and nginx"
apt-get install -y nginx build-essential clang g++

echo "... updating npm"
npm update -g npm

echo "... installing pm2"
npm i -g pm2

echo "... fetching app to $INSTALL_PATH"
sudo -u $USERNAME git clone https://github.com/perimetral/uDeepMiner.git $INSTALL_PATH/uDeepMiner

if [ -f "../config.js" ]
then
    echo "... updating configuration"
    sudo -u $USERNAME rm -rf $INSTALL_PATH/uDeepMiner/config.js
    cp ../config.js ./config.new.js
    chown $USERNAME:$GROUPNAME ./config.new.js
    sudo -u $USERNAME cp ./config.new.js $INSTALL_PATH/uDeepMiner/config.js
    rm -rf ./config.new.js
fi

cd $INSTALL_PATH/uDeepMiner

echo "... installing deps"
sudo -u $USERNAME npm i
echo "npm i uws" | sudo -u $USERNAME -E sh -

if [ ! -f "/etc/nginx/nginx.conf" ]
then
    touch /etc/nginx/nginx.conf
fi

echo "... configuring sysctl, nginx and clientside"
node ./deploy.js

echo "... fixing permissions issues"
cd ..
chown -R $USERNAME:$GROUPNAME uDeepMiner

cd ./uDeepMiner
echo "... running servers"
systemctl reload nginx
systemctl start nginx
sudo -u $USERNAME node ./server.js &
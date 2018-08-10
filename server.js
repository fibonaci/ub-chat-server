
'use strict';

const WebSocket = require('ws'),
      codes = require('./codes.js'),
      Log = require('./logger/index.js'),
      commands = require('./commands.js');

const options = {

      port: 8080,
      clientTracking: true
    };

if (!+process.env.INACTIVITY_TIMEOUT) {
  return console.log('error starting serve. Environment variable INACTIVITY_TIMEOUT in ms not set')
}

const wss = new WebSocket.Server(options);

let nickname = Symbol('nickname'),
    timeoutId = Symbol('timeoutId');

wss.on('connection', (ws, req) => {

  let log = new Log('ChatServer').inFile('packages/main/index.js').inFunction('connection');

  const ip = req.connection.remoteAddress;

  log.trace({ ip: ip }, 'received new connection from IP');

  ws.on('close', code => {

    let user;

    wss.clients.forEach(item => {

      if (item === ws) {

        user = item[nickname];
        clearTimeout(item[timeoutId]);
      }
    });

    log.trace({ code: code }, 'closed connection');
    ws.close();
    return wss.broadcast({"code": "0", "msg": `${user} left the chat, connection lost`});
  });

  ws.on('message', message => {

    let msg,
        logins,
        conExist,
        itdentity;

    try {
      msg = JSON.parse(message);
    }
    catch (e) {

      log.error(e, 'error parsing incomming request');
      return ws.close(codes.UNSUPORTED_DATA);
    }

    if (!commands[msg.c]) {

      log.trace({ msg: msg }, 'message command not found');
      return ws.close(codes.CLOSE_PROTOCOL_ERROR);
    }

    if (msg.c === commands.LOGIN) {
      // {"c":"LOGIN","d":{"n":"Jhon"}}
      logins = [];

      log.trace({ msg: msg }, 'received new login request');

      // prepare ws object

      wss.clients.forEach(item => {

        if (item[nickname]) {
          logins.push(item[nickname]);
        }

        if (item[nickname] === msg.d.n) {
          itdentity = true;
        }
      });

      if (!itdentity) {

        ws[nickname] = msg.d.n;

        logins.push(msg.d.n);

        log.debug(`new nickname ${msg.d.n} joined`);

        ws[timeoutId] = setTimeout(disconnectClient, +process.env.INACTIVITY_TIMEOUT, { ws: ws, log: log }).ref();

        wss.broadcast(logins);
      }
      else {

          log.trace(`nickname ${msg.d.n} already exist`);
          ws.send(JSON.stringify({"code": "1", "msg": `nickname ${msg.d.n} already exist`}));
      }
    }
    if (msg.c === commands.SENDMESSAGE) {

      // {"c":"SENDMESSAGE","d":{"n":"Hi, my name is Jhon"}}
      let user;

      wss.clients.forEach(item => {

        if (item === ws) {

          user = item[nickname];

          if (!item[timeoutId]) {
            ws[timeoutId] = setTimeout(disconnectClient, +process.env.INACTIVITY_TIMEOUT, { ws: ws, log: log }).ref();
          }
          else {

            clearTimeout(item[timeoutId]);
            item[timeoutId] = setTimeout(disconnectClient, +process.env.INACTIVITY_TIMEOUT, { ws: ws, log: log }).ref();
          }
          return;
        }
      });

      if (!user) {

        log.trace(`session is not active`);
        ws.send(JSON.stringify({"code": "400", "msg": `session is not active`}));
        return;
      }

      log.trace('socket session valid');

      wss.broadcast({"code": "0", "msg": {nickname: user, m: msg.d.n}});
    }
  });

  ws.send('CONNECTED'); // TODO return different event
});

wss.broadcast = (data) => {

  let log = new Log('ChatServer').inFile('packages/main/index.js').inFunction('broadcast');

  wss.clients.forEach(item => {

    if (item.readyState === WebSocket.OPEN) {

      log.trace({ msg: data }, 'broadcast data to all clients');

      item.send(JSON.stringify(data), e => log.error(e, 'error sending message'));
    }
  });
};


function disconnectClient(obj) {

  let user;

  let log = obj.log.inFunction('disconnectClient');

  wss.clients.forEach(item => {

    if (item === obj.ws) {
      user = item[nickname];
    }
  });

  log.trace({ user: user }, 'diconnect user due to inactivity');

  obj.ws.close();
  wss.broadcast({"code": "0", "msg": `${user} was disconnected due to inactivity`});
}

console.log('server started');

process.on('SIGINT', () => process.kill(process.pid));

process.on('SIGTERM', () => {

  console.log('stopping server');
  wss.close(process.exit);
});

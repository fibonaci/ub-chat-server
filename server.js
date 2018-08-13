
"use strict";

const WebSocket = require('ws'),
      codes = require('./codes.js'),
      Log = require('./logger/index.js'),
      commands = require('./commands.js');


const options = {

      port: 2222,
      clientTracking: true
    };

if (!+process.env.INACTIVITY_TIMEOUT) {
  return console.log('error starting serve. Environment variable INACTIVITY_TIMEOUT in ms not set');
}

// initiate the WebSocket connection
const wss = new WebSocket.Server(options);

let nickname = Symbol('nickname'),
    timeoutId = Symbol('timeoutId');

wss.on('connection', (ws, req) => {

  let log = new Log('ChatServer').inFile('packages/main/index.js').inFunction('connection');

  const ip = req.connection.remoteAddress;

  log.trace({ ip: ip }, 'received new connection from IP');

  ws[timeoutId] = setTimeout(disconnectClient, +process.env.INACTIVITY_TIMEOUT, { ws: ws, log: log }).ref();

  ws.send(JSON.stringify({ event: 'CONNECTED' }));

  ws.on('close', code => {

    log.trace({ code: code }, 'closed connection');

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'DISCONNECT'}));
    }
  });

  ws.on('message', message => {

    let msg,
        logins,
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

        if (!ws[timeoutId]) {
          ws[timeoutId] = setTimeout(disconnectClient, +process.env.INACTIVITY_TIMEOUT, { ws: ws, log: log }).ref();
        }
        else {

          clearTimeout(ws[timeoutId]);
          ws[timeoutId] = setTimeout(disconnectClient, +process.env.INACTIVITY_TIMEOUT, { ws: ws, log: log }).ref();
        }

        ws.send(JSON.stringify({ event: 'LOGIN', nickname: msg.d.n, logins: logins }));
        wss.broadcast({ event: 'JOINED', logins: logins });
      }
      else {

          log.trace(`nickname ${msg.d.n} already exist`);
          ws.send(JSON.stringify({"event": "ERROR", "msg": `Failed to connect. Nickname already taken`}));
      }
    }
    if (msg.c === commands.SENDMESSAGE) {

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
        ws.send(JSON.stringify({"event": "ERROR", "msg": `session is not active`}));
        return;
      }

      log.trace('socket session valid');

      wss.broadcast({"event": "MESSAGE", "msg": { nickname: user, content: msg.d.n }});
    }

    if (msg.c === commands.DISCONNECT) {

      let user;

      wss.clients.forEach(item => {

        if (item === ws) {

          user = item[nickname];

          if (!item[timeoutId]) {
            clearTimeout(item[timeoutId]);
          }
          return;
        }
      });

      if (!user) {

        log.trace(`session is not active`);
        ws.send(JSON.stringify({"event": "ERROR", "msg": `session is not active`}));
        return;
      }

      log.trace('socket session valid');
      ws.terminate();
      return wss.broadcast({ 'event': 'MESSAGE', 'msg': { nickname: '' , content: `${user} left chat, connection lost` }});
    }
  });
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


  if (obj.ws.readyState !== WebSocket.CLOSED) {

    if (!user) {
      obj.ws.send(JSON.stringify({ event: 'ERROR', msg: 'Disconnected by the server due to inactivity'}));
    }
    else {
      obj.ws.send(JSON.stringify({ event: 'DISCONNECT'}));
    }
    obj.ws.terminate();
  }

  if (user) {
    wss.broadcast({'event': 'MESSAGE', "msg": { nickname: '' , content: `${user} was disconnected due to inactivity` }});
  }
}

console.log('server started');

process.on('SIGINT', () => process.kill(process.pid));

process.on('SIGTERM', () => {

  console.log('stopping server');
  wss.close(process.exit);
});

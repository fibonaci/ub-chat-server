
'use strict';

const WebSocket = require('ws'),
      Log = require('./logger/index.js'),
      commands = require('./commands.js'),
      wss = new WebSocket.Server({ port: 8080 });

let conID = Symbol('conID'),
    connections = new Set([]),
    nickname = Symbol('nickname'),
    lastActivity = Symbol('lastActivity');

function noop() {}

function heartbeat() {
  this.isAlive = true; // jshint ignore:line
}

wss.on('connection', (ws, req) => {

  let log = new Log('ChatServer').inFile('packages/main/index.js').inFunction('connection');

  const ip = req.connection.remoteAddress;

  log.trace({ ip: ip }, 'received new connection from IP');

  ws.isAlive = true;

  ws.on('pong', heartbeat);

  ws.on('message', message => {

    let msg,
        logins,
        conExist,
        itdentity;

    // TODO validate message "{\"a\":\"LOGIN\",\"d\":{\"n\":\"Jhon\"}}" ==> expectet format

    try {
      msg = JSON.parse(JSON.parse(message));
    }
    catch (e) {

      log.error(e, 'error parsing incomming request');
      ws.send('ERROR');
    }

    if (!commands[msg.c]) {

      log.trace({ msg: msg }, 'message command not found');
      ws.send(JSON.stringify({"code": "400", "msg": `command not exist`}));
    }

    if (msg.c === commands.LOGIN) {
      // "{\"c\":\"LOGIN\",\"d\":{\"n\":\"Jhon\"}}"
      logins = [];
      log.trace({ msg: msg }, 'received new login request');

      // prepare ws object

      connections.forEach(item => {

        logins.push(item[nickname]);

        if (item[nickname] === msg.d.n) {
          itdentity = true;
        }
        if (item[conID] === req.headers['sec-websocket-key']) {

          log.trace(`connection exist for nickname ${item[nickname]}`);
          itdentity = true;
          conExist = item[nickname];
        }
      });

      if (!itdentity) {

        ws[nickname] = msg.d.n;
        ws[lastActivity] = new Date();
        ws[conID] = req.headers['sec-websocket-key'];

        connections.add(ws);

        logins.push(msg.d.n);

        log.debug(`new nickname ${msg.d.n} joined`);
        wss.broadcast(logins);
      }
      else {

        if (conExist) {
          wss.broadcast(logins);
        }
        else {

          log.trace(`nickname ${msg.d.n} already exist`);
          ws.send(JSON.stringify({"code": "1", "msg": `nickname ${msg.d.n} already exist`}));
        }
      }
    }
    if (msg.c === commands.SENDMESSAGE) {

      // "{\"c\":\"SENDMESSAGE\",\"d\":{\"n\":\"Hi, my name is Jhon\"}}"
      let user;

      Array.from(connections).forEach(item => {

        if (item.readyState === WebSocket.OPEN && item[conID] === req.headers['sec-websocket-key']) {

          user = item[nickname];

          connections.delete(item);
          item[lastActivity] = new Date();
          connections.add(item);
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

  connections.forEach(item => {

    if (item.readyState === WebSocket.OPEN && item.isAlive) {

      log.trace({ msg: data }, 'broadcast data to all clients');

      item.send(JSON.stringify(data), e => log.error(e, 'error sending message'));
    }
  });
};

setInterval(function ping() {

  connections.forEach(item => {

    let time = new Date(new Date() - 2 * 60 * 1000);

    if (item.isAlive === false) {

      wss.broadcast({"code": "0", "msg": `${item[nickname]} left the chat, connection lost`});
      connections.delete(item);
      item.terminate();
    }

    if (item[lastActivity] < time) {

      wss.broadcast({"code": "0", "msg": `${item[nickname]} was disconnected due to inactivity`});
      connections.delete(item);
      item.terminate();
    }

    item.isAlive = false;
    item.ping(noop);
  });
}, 10000);

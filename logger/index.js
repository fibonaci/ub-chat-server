
'use strict';

let Log = undefined;

const os = require('os');

let key,
    levels,
    version,
    hostName,
    processID,
    fileStream;

version = 0;
hostName = os.hostname();
processID = process.pid;

levels = {

    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60
};

Log = function() {

    if (typeof arguments[0] === 'string') {

        this.name = arguments[0];
        return;
    }

    this._c = arguments[0].context;
    this._i = arguments[0].invocation;
    this.name = arguments[0].name;
};

for (key in levels) { // jshint ignore:line

    (function(level) {

        Log.prototype[key] = function() {

            let key,
                record;

            record = {

                hostname: hostName,
                pid: processID,
                v: version,
                level: level,
                time: new Date(),
                name: this.name
            };

            if (this._i) {

                record._c = {
                    _i: this._i
                };
            }

            for (key in this._c) {

                if (this._c.hasOwnProperty(key)) {
                    record._c[key] = this._c[key];
                }
            }

            if (typeof arguments[0] === 'object') {

                if (arguments[0] instanceof Error) {

                    record.err = {
                        stack: arguments[0].stack || arguments[0].toString()
                    };

                    record.msg = arguments[1] || arguments[0].message;
                }
                else {

                    record._p = arguments[0];

                    if (!arguments[1]) {
                        return;
                    }

                    record.msg = arguments[1];
                }
            }
            else {

                if (!arguments[0]) {
                    return;
                }

                record.msg = arguments[0];
            }

            if (fileStream) {

                fileStream.write(JSON.stringify(record) + '\n');
                return;
            }

            process.stdout.write(JSON.stringify(record) + '\n');
        };

    })(levels[key]); // jshint ignore:line
}

Log.prototype.inContext = function(context) {

    return new Log({

        name: this.name,
        context: context,
        invocation: this._i
    });
};

Log.prototype.inFile = function(fileName) {

  var invocation;

  if (this._i) {
    invocation =  Object.assign({}, this._i);
  }

    if (!invocation) {
        invocation = [ fileName ];
    }
    else if (!invocation[ invocation.length - 1 ].match(new RegExp('^' + fileName))) {
        invocation.push(fileName);
    }

    return new Log({

        name: this.name,
        context: this._c,
        invocation: invocation
    });
};

Log.prototype.inFunction = function(funcName) {

  var invocation;

  if (this._i) {
    invocation = this._i.slice();
  }

    invocation[ invocation.length - 1 ] += ' -> ' + funcName + '()';

    return new Log({

        name: this.name,
        context: this._c,
        invocation: invocation
    });
};

Log.prototype.obj = function() {
    return { log: this };
};

module.exports = Log;

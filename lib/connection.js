/* vim: set expandtab tabstop=2 shiftwidth=2 foldmethod=marker: */

"use strict";

var util = require('util');
var mysql = require('mysql-robin');
var EventEmitter = require('events').EventEmitter;
var sqlString = require('mysql-robin/lib/protocol/SqlString');

/**
 * @ Connection
 */
var Connection = function (options) {

  EventEmitter.call(this);

  /**
   * 0 : 未连接
   * 1 : 正在连接
   * 2 : 连接成功
   * -1: 准备断开
   */
  this._flag = 0;
  options.port = options.port || 3306;
  this._name = util.format('%s@%s:%d', options.user, options.host, options.port);
  this._conn = mysql.createConnection(options);

  var _self = this;
  this._conn.on('error', function (e) {
    if (e && e.fatal && _self._flag > -1) {
      _self.close();
    }
    _self.emit('error', _self._error(e));
  });
};
util.inherits(Connection, EventEmitter);

Connection.prototype._error = function (name, msg) {
  var e;
  if (name instanceof Error) {
    e = name;
    e.name = (e.name && 'Error' !== e.name) ? e.name : 'MysqlError';
  } else {
    e = new Error(msg || name);
    e.name = name;
  }
  e.message = util.format('%s (%s)', e.message, this._name);
  return e;
};

Connection.prototype.close = function () {

  if (this._flag < 0) {
    return;
  }

  this._flag = -1;
  this._conn.end();
};

Connection.prototype.query = function (sql, timeout, callback) {
  if ((typeof sql) === 'object' && sql.params) {
    sql = this.format(sql.sql, sql.params);
  }

  var _self = this;
  if (!timeout || timeout < 1) {
    return this._conn.query(sql, function (e, r) {
      if (e && e.fatal && _self._flag > -1) {
        _self.emit('error', e);
      }
      callback(e ? _self._error(e) : null, r);
    });
  }

  var timer = setTimeout(function () {
    callback(_self._error('QueryTimeout', 'Mysql query timeout after ' + timeout + ' ms'));
    _self.emit('timeout', sql);
    callback = function () {};
  }, timeout);

  _self._conn.query(sql, function (e, r) {
    clearTimeout(timer);
    timer = null;
    callback(e ? _self._error(e) : null, r);

    if (e && e.fatal && _self._flag > -1) {
      _self.emit('error', e);
    }
  });
};

Connection.prototype.format = function (sql, params) {
  return sql.replace(/:(\w+)/g, function (w, i) {
    return sqlString.escape(params[i]);
  });
};

exports.create = function (options) {
  return new Connection(options);
};


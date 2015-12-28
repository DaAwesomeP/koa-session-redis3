'use strict';
/* index.js by DaAwesomeP, Chilledheart
 * Originally forked 9/3/2015 from https://github.com/Chilledheart/koa-session-redis
 * This file provides the functions of koa-session-redis3.
 * https://github.com/DaAwesomeP/koa-session-redis3
 * 
 * Copyright 2015-present DaAwesomeP
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var debug = require('debug')('koa-session-redis3');
var Puid = require('puid');
var puid = new Puid();
var thunkify = require('thunkify');
var redis = require('redis');

/**
 * Initialize session middleware with `opts`:
 *
 * - `key` session cookie name ["koa:sess"]
 * - all other options are passed as cookie options
 *
 * @param {Object} [opts]
 * @api public
 */

module.exports = function (opts) {
  var key, client, redisOption, cookieOption;

  opts = opts || {};
  // key
  key = opts.key || 'koa:sess';
  debug('key config is: %s', key);

  //redis opts
  redisOption = opts.store || {};
  debug('redis config all: %j', redisOption);
  debug('redis config url: %s', redisOption.url);
  debug('redis config port: %s', redisOption.port || (redisOption.port = 6379));
  debug('redis config host: %s', redisOption.host || (redisOption.host = '127.0.0.1'));
  debug('redis config options: %j', redisOption.options || (redisOption.options = {}));
  debug('redis config db: %s', redisOption.db || (redisOption.db = 0));
  debug('redis config ttl: %s', redisOption.ttl);
  debug('redis config keySchema: %s', redisOption.keySchema || (redisOption.keySchema = ''));
  if (redisOption.keySchema.length > 0 && redisOption.keySchema.charAt(redisOption.keySchema.length - 1) !== ':') {
  	redisOption.keySchema += ':';
  }
  
  //cookies opts
  cookieOption = opts.cookie || {};
  debug('cookie config all: %j', cookieOption);
  debug('cookie config overwrite: %s', (cookieOption.overwrite === false) ? false : (cookieOption.overwrite = true));
  debug('cookie config httpOnly: %s', (cookieOption.httpOnly === false) ? false : (cookieOption.httpOnly = true));
  debug('cookie config signed: %s', (cookieOption.signed === false) ? false : (cookieOption.signed = true));
  debug('cookie config maxage: %s', (typeof cookieOption.maxage !== 'undefined') ? cookieOption.maxage : (cookieOption.maxage = redisOption.ttl * 1000 || null));

  //redis client for session
  if (redisOption.url) {
    redisOption.url,
    redisOption.options
  } else {
    client = redis.createClient(
      redisOption.port,
      redisOption.host,
      redisOption.options
    );
  }

  client.select(redisOption.db, function () {
    debug('redis changed to db %d', redisOption.db);
  });

  client.get = thunkify(client.get);
  client.set = thunkify(client.set);
  client.del = thunkify(client.del);
  client.ttl = redisOption.ttl ? function expire(key) { client.expire(key, redisOption.ttl); }: function () {};

  client.on('connect', function () {
    debug('redis is connecting');
  });

  client.on('ready', function () {
    debug('redis ready');
    debug('redis host: %s', client.host);
    debug('redis port: %s', client.port);
    debug('redis parser: %s', client.reply_parser.name);
    debug('redis server info: %j', client.server_info);
  });

  client.on('reconnect', function () {
    debug('redis is reconnecting');
  });

  client.on('error', function (err) {
    debug('redis encouters error: %j', err.stack || err);
  });

  client.on('end', function () {
    debug('redis connection ended');
  });

  return function *(next) {
    var sess, sid, json;

    // to pass to Session()
    this.cookieOption = cookieOption;
    this.sessionKey = key;
    this.sessionId = null;

    sid = this.cookies.get(key, cookieOption);

    if (sid) {
      debug('sid %s', sid);
      try {
        json = yield client.get(redisOption.keySchema + sid);
      }catch (e) {
        debug('encounter error %s', e);
        json = null;
      }
    }

    if (json) {
      this.sessionId = sid;
      debug('parsing %s', json);
      try {
        sess = new Session(this, JSON.parse(json));
      } catch (err) {
        // backwards compatibility:
        // create a new session if parsing fails.
        // `JSON.parse(string)` will crash.
        if (!(err instanceof SyntaxError)) throw err;
        sess = new Session(this);
      }
    } else {
      sid = this.sessionId = puid.generate();
      debug('new session');
      sess = new Session(this);
    }

    this.__defineGetter__('session', function () {
      // already retrieved
      if (sess) return sess;
      // unset
      if (false === sess) return null;
    });

    this.__defineSetter__('session', function (val) {
      if (null === val) return sess = false;
      if ('object' === typeof val) return sess = new Session(this, val);
      throw new Error('this.session can only be set as null or an object.');
    });

    try {
      yield *next;
    } catch (err) {
      throw err;
    } finally {
      if (undefined === sess) {
        // not accessed
      } else if (false === sess) {
        // remove
        this.cookies.set(key, '', cookieOption);
        yield client.del(redisOption.keySchema + sid);
      } else if (!json && !sess.length) {
        // do nothing if new and not populated
      } else if (sess.changed(json)) {
        // save
        json = sess.save();
        yield client.set(redisOption.keySchema + sid, json);
        client.ttl(redisOption.keySchema + sid);
      }
    }
  };
};

/**
 * Session model.
 *
 * @param {Context} ctx
 * @param {Object} obj
 * @api private
 */

function Session(ctx, obj) {
  this._ctx = ctx;
  if (!obj) this.isNew = true;
  else for (var k in obj) this[k] = obj[k];
}

/**
 * JSON representation of the session.
 *
 * @return {Object}
 * @api public
 */

Session.prototype.inspect =
  Session.prototype.toJSON = function () {
  var self = this;
  var obj = {};

  Object.keys(this).forEach(function (key) {
    if ('isNew' === key) return;
    if ('_' === key[0]) return;
    obj[key] = self[key];
  });

  return obj;
};

/**
 * Check if the session has changed relative to the `prev`
 * JSON value from the request.
 *
 * @param {String} [prev]
 * @return {Boolean}
 * @api private
 */

Session.prototype.changed = function (prev) {
  if (!prev) return true;
  this._json = JSON.stringify(this);
  return this._json !== prev;
};

/**
 * Return how many values there are in the session object.
 * Used to see if it's "populated".
 *
 * @return {Number}
 * @api public
 */

Session.prototype.__defineGetter__('length', function () {
  return Object.keys(this.toJSON()).length;
});

/**
 * populated flag, which is just a boolean alias of .length.
 *
 * @return {Boolean}
 * @api public
 */

Session.prototype.__defineGetter__('populated', function () {
  return !!this.length;
});

/**
 * Save session changes by
 * performing a Set-Cookie.
 *
 * @api private
 */

Session.prototype.save = function () {
  var ctx = this._ctx,
      json = this._json || JSON.stringify(this),
      sid = ctx.sessionId,
      opts = ctx.cookieOption,
      key = ctx.sessionKey;

  debug('save %s', json);
  ctx.cookies.set(key, sid, opts);
  return json;
};

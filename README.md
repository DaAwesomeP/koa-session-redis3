koa-session-redis3
==================
[![Travis](https://img.shields.io/travis/DaAwesomeP/koa-session-redis3.svg?style=flat-square)](https://travis-ci.org/DaAwesomeP/koa-session-redis3) [![npm](https://img.shields.io/npm/v/koa-session-redis3.svg?style=flat-square)](https://www.npmjs.com/package/koa-session-redis3) [![npm](https://img.shields.io/npm/dm/koa-session-redis3.svg?style=flat-square)](https://www.npmjs.com/package/koa-session-redis3) [![David](https://img.shields.io/david/DaAwesomeP/koa-session-redis3.svg?style=flat-square)](https://david-dm.org/DaAwesomeP/koa-session-redis3) [![GitHub license](https://img.shields.io/github/license/DaAwesomeP/koa-session-redis3.svg?style=flat-square)](https://github.com/DaAwesomeP/koa-session-redis3/blob/master/LICENSE) [![Gitter chat](https://img.shields.io/badge/gitter-join%20chat-1DCE73.svg?style=flat-square)](https://gitter.im/DaAwesomeP/koa-session-redis3)
---
Redis store-based session middleware for Koa. This version adds the `keySchema` option to use a prefix on Redis keys. It also adds `hiredis` and `puid`.

Forked from [koa-session-redis](https://github.com/Chilledheart/koa-session-redis). Based on [koa-session](https://github.com/koajs/session).

## Installation

```javascript
$ npm install koa-session-redis3
```
When it installs it should also include `hiredis`, which is a native module. If it fails to build, then no worries (it is only a speed improvement), as it will fall back to the JavaScript parser.

## Example

```javascript
var session = require('koa-session-redis3');

var koa = require('koa');
var app = koa();

app.keys = ['some secret hurr'];
app.use(session({
    store: {
      host: process.env.SESSION_PORT_6379_TCP_ADDR || '127.0.0.1',
      port: process.env.SESSION_PORT_6379_TCP_PORT || 6379,
      ttl: 3600,
      keySchema: 'your:schema'
    },
  },
));

app.use(function *(){
  var n = this.session.views || 0;
  this.session.views = ++n;
  this.body = n + ' views';
});

app.listen(3000);
console.log('listening on port 3000');
```

## Semantics

This module provides "guest" sessions, meaning any visitor will have a session, authenticated or not. If a session is _new_ a Set-Cookie will be produced regardless of populating the session.

### Options

The cookie name is controlled by the `key` option, which defaults to "koa:sess". All other options are passed to `ctx.cookies.get()` and `ctx.cookies.set()` allowing you to control security, domain, path, and signing among other settings.

### Session#isNew

  Returns __true__ if the session is new.

### Destroying a session

To destroy a session simply set it to `null`:

```javascript
this.session = null;
```

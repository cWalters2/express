/**
 * Module dependencies.
 */

var Route = require('./route')
  , utils = require('../utils')
  , methods = require('methods')
  , debug = require('debug')('express:router')
  , parse = require('connect').utils.parseUrl;

/**
 * Expose `Router` constructor.
 */

exports = module.exports = Router;

/**
 * Initialize a new `Router` with the given `options`.
 *
 * @param {Object} options
 * @api private
 */

function Router(options) {
  options = options || {};
  var self = this;

  self.params = {};
  self._params = [];
  self.caseSensitive = options.caseSensitive;
  self.strict = options.strict;
  self._routes = [];

  self.middleware = self.handle.bind(self);
}

/**
 * Register a param callback `fn` for the given `name`.
 *
 * @param {String|Function} name
 * @param {Function} fn
 * @return {Router} for chaining
 * @api public
 */

Router.prototype.param = function(name, fn){
  // param logic
  if ('function' == typeof name) {
    this._params.push(name);
    return;
  }

  // apply param functions
  var params = this._params
    , len = params.length
    , ret;

  if (name[0] === ':') {
    name = name.substr(1);
  }

  for (var i = 0; i < len; ++i) {
    if (ret = params[i](name, fn)) {
      fn = ret;
    }
  }

  // ensure we end up with a
  // middleware function
  if ('function' != typeof fn) {
    throw new Error('invalid param() call for ' + name + ', got ' + fn);
  }

  (this.params[name] = this.params[name] || []).push(fn);
  return this;
};

Router.prototype.handle = function(req, res, done) {
  var self = this;

  debug('dispatching %s %s', req.method, req.url);

  var search = 1 + req.url.indexOf('?');
  var pathlength = search ? search - 1 : req.url.length;
  var fqdn = 1 + req.url.substr(0, pathlength).indexOf('://');
  var protohost = fqdn ? req.url.substr(0, req.url.indexOf('/', 2 + fqdn)) : '';

  req.url = protohost + req.url.substr(protohost.length);
  req.originalUrl = req.originalUrl || req.url;

  var slashAdded = false;
  var stack = this._routes;
  var idx = 0;

  var method = req.method.toLowerCase();

  var orig = req.url;
  var new_url = req.url;

  var self = this;

  var options = [];

  // for options requests, generate a default if no response provided automatically
  // shit.. we need to see if we have an options
  // need to gather up all the goodies
  if (method === 'options') {
    var old = done;
    done = function(err) {
      if (err) {
        return old(err);
      }

      if (options.length) {
        var body = options.join(',');
        return res.set('Allow', body).send(body);
      }

      return old();
    };
  }

  (function next(err) {
    if (err === 'route') {
      err = undefined;
    }

    var layer = stack[idx++];

    if (!layer) {
      return done(err);
    }

    // if the user changed url in the route
    // we will not reset it back
    if (req.url === new_url) {
      req.url = orig;
    }

    try {
      var path = parse(req).pathname;
      if (undefined == path) path = '/';

      var route = layer.routeobj;
      if (route) {
        if (!route.match(path)) {
          return next();
        }

        req.params = route.params;
      }
      // skip this layer if the route doesn't match.
      else if (0 != path.toLowerCase().indexOf(layer.route.toLowerCase())) return next(err);

      var c = path[layer.route.length];

      // what the fuck is this?
      if (!route) {
        if (c && '/' != c && '.' != c) return next(err);
      }

      // Call the layer handler
      // Trim off the part of the url that matches the route
      var removed = layer.route;

      // save original url so we can restore it when the next layer needs processing
      orig = req.url;

      // middleware (.use stuff) needs to have the path stripped
      if (layer.strip && removed) {
        debug('trim prefix (%s) from url %s', removed, req.url);
        req.url = protohost + req.url.substr(protohost.length + removed.length);
      }

      new_url = req.url;

      // Ensure leading slash
      if (!fqdn && '/' != req.url[0]) {
        req.url = '/' + req.url;
        slashAdded = true;
      }

      // if not strip, then this is a route handler
      // we then need to do the param shit for this, etc

      debug('%s %s : %s', layer.handle.name || 'anonymous', layer.route, req.originalUrl);
      var arity = layer.handle.length;
      if (err) {
        if (arity === 4) {
          layer.handle(err, req, res, next);
        } else {
          next(err);
        }
      } else if (arity < 4) {
        if (layer.routeobj) {
          var route = layer.routeobj;

          if (!route.methods['options']) {
            options.push.apply(options, route._options());
          }

          return self.process_route(route, req, res, function(err) {
            if (err) {
              return next(err);
            }

            layer.handle(req, res, next);
          });
        }

        layer.handle(req, res, next);
      } else {
        next();
      }
    } catch (err) {
      next(err);
    }
  })();
};

Router.prototype.process_route = function(route, req, res, done) {
  var self = this;
  var params = this.params;

  // captured parameters from the route, keys and values
  var keys = route.keys || [];

  var i = 0;
  var paramIndex = 0;
  var key;
  var paramVal;
  var paramCallbacks;

  // process params in order
  // param callbacks can be async
  function param(err) {
    if (err) {
      return done(err);
    }

    if (i >= keys.length ) {
      return done();
    }

    paramIndex = 0;
    key = keys[i++];
    paramVal = key && req.params[key.name];
    paramCallbacks = key && params[key.name];

    try {
      if (paramCallbacks && undefined !== paramVal) {
        return paramCallback();
      } else if (key) {
        return param();
      }
    } catch (err) {
      done(err);
    }

    done();
  };

  // single param callbacks
  function paramCallback(err) {
    var fn = paramCallbacks[paramIndex++];
    if (err || !fn) return param(err);
    fn(req, res, paramCallback, paramVal, key.name);
  }

  param();
};

// this is different from regular route handlers
// it requires just that the start of the url matches
// but it also strips the url
Router.prototype.use = function(route, fn){

  // default route to '/'
  if ('string' != typeof route) {
    fn = route;
    route = '/';
  }

  // strip trailing slash
  if ('/' == route[route.length - 1]) {
    route = route.slice(0, -1);
  }

  // add the middleware
  debug('use %s %s', route || '/', fn.name || 'anonymous');
  this._routes.push({ strip: true, route: route, handle: fn, routeobj: null });

  return this;
};

/**
 * Route `method`, `path`, and one or more callbacks.
 *
 * @param {String} method
 * @param {String} path
 * @param {Function} callback...
 * @return {Router} for chaining
 * @api private
 */

Router.prototype.route = function(path){
  var route = new Route(path, {
    sensitive: this.caseSensitive,
    strict: this.strict
  });

  this._routes.push({ route: path, routeobj: route, handle: function(req, res, next) {
    route.dispatch(req, res, next);
  }});
  return route;
};

// for a given path, run for all methods
Router.prototype.all = function(path, fn) {
  var route = this.route(path);
  methods.forEach(function(method){
    route[method](fn);
  });
};

methods.forEach(function(method){
  Router.prototype[method] = function(path, fn){
    var self = this;
    self.route(path)[method](fn);
    return self;
  };
});

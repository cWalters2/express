
/**
 * Module dependencies.
 */

var utils = require('../utils')
  , debug = require('debug')('express:router:route')
  , methods = require('methods')

/**
 * Expose `Route`.
 */

module.exports = Route;

/**
 * Initialize `Route` with the given HTTP `method`, `path`,
 * and an array of `callbacks` and `options`.
 *
 * Options:
 *
 *   - `sensitive`    enable case-sensitive routes
 *   - `strict`       enable strict matching for trailing slashes
 *
 * @param {String} path
 * @param {Object} options.
 * @api private
 */

function Route(path, options) {
  debug('new %s', path);
  options = options || {};
  this.path = path;
  this.params = {};
  this.regexp = utils.pathRegexp(path
    , this.keys = []
    , options.sensitive
    , options.strict);

  this.middleware = [];

  // route handlers for various http methods
  this.methods = {};
}

/**
 * Check if this route matches `path`, if so
 * populate `.params`.
 *
 * @param {String} path
 * @return {Boolean}
 * @api private
 */

Route.prototype.match = function(path){
  var keys = this.keys
    , params = this.params = {}
    , m = this.regexp.exec(path)
    , n = 0;

  if (!m) return false;

  for (var i = 1, len = m.length; i < len; ++i) {
    var key = keys[i - 1];

    try {
      var val = 'string' == typeof m[i]
        ? decodeURIComponent(m[i])
        : m[i];
    } catch(e) {
      var err = new Error("Failed to decode param '" + m[i] + "'");
      err.status = 400;
      throw err;
    }

    if (key) {
      params[key.name] = val;
    } else {
      params[n++] = val;
    }
  }

  return true;
};

// @return array of supported HTTP methods
Route.prototype._options = function(){
  return Object.keys(this.methods).map(function(method) {
    return method.toUpperCase();
  });
};

// dispatch handlers for the request and call next when done
Route.prototype.dispatch = function(req, res, next){
  var self = this;
  var method = req.method.toLowerCase();

  var fns = self.methods[method];
  if (!fns && method === 'head') {
    fns = self.methods['get'];
  }

  var mwares = [].concat(self.middleware);
  if (fns) {
    mwares.push.apply(mwares, fns);
  }

  req.route = self;

  var idx = 0;
  (function next_mware(err) {
    if (idx >= mwares.length) {
      return next(err);
    }

    var mware = mwares[idx++];

    if (err) {
      if (mware.length > 3) {
        return mware(err, req, res, next_mware);
      }

      return next_mware(err);
    }

    if (mware.length > 3) {
      return next_mware(err);
    }

    mware(req, res, next_mware);
  })();
};

Route.prototype.all = function(fn){
  if (typeof fn !== 'function') {
    var type = {}.toString.call(fn);
    var msg = 'Route.use() requires callback functions but got a ' + type;
    throw new Error(msg);
  }

  // add this function to the route
  this.middleware.push(fn);
  return this;
};

methods.forEach(function(method){
  Route.prototype[method] = function(fn){
    debug('%s %s', method, this.path);

    if (!this.methods[method]) {
      this.methods[method] = [];
    }

    this.methods[method].push(fn);
    return this;
  };
});

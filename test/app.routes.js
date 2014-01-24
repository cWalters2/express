
var express = require('../')
  , assert = require('assert')
  , request = require('./support/http');

describe('app.routes', function(){

  // NO! jesus christ no routes
  return;

  it('should be initialized', function(){
    var app = express();
    app.routes.should.eql([]);
  })

  it('should be populated with routes', function(){
    var app = express();

    app.get('/', function(req, res){});
    app.get('/user/:id', function(req, res){});

    app.routes.should.have.length(2);

    var route = app.routes[0];
    route.path.should.equal('/');
    route.methods.should.have.properties('get');
    route.regexp.toString().should.equal('/^\\/\\/?$/i');

    var route = app.routes[1];
    route.path.should.equal('/user/:id');
    route.methods.should.have.properties('get');
  })

  it('should be mutable', function(done){
    var app = express();

    app.get('/', function(req, res){});
    app.get('/user/:id', function(req, res){});

    app.routes.should.have.length(2);

    var route = app.routes[0];
    route.path.should.equal('/');
    route.methods.should.have.properties('get');
    route.regexp.toString().should.equal('/^\\/\\/?$/i');

    app.routes.splice(1);

    request(app)
    .get('/user/12')
    .expect(404, done);
  })
})

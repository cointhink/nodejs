var request = require('request')
var zmq = require('zmq')

module.exports = new (function(){
  console.log('cointhink starting')
  var username = process.env.cointhink_user_name
  var scriptname = process.env.cointhink_script_name
  var scriptkey = process.env.cointhink_script_key

  var db_sock = zmq.socket('req');
  db_sock.connect('tcp://dockerhost:3003')

  this.log = function(msg) {
    this.signal({type:'log', msg:msg})
  }

  this.signal = function(payload) {
    console.log('signal '+JSON.stringify(payload))
    request.post({url:"http://dockerhost:3002/"+username+"/"+scriptname+"/"+scriptkey+"/"+payload.type,
                  body: payload})
  }

  this.exchange = function(name, cb){
    sock = zmq.socket('pull');
    sock.connect('tcp://dockerhost:3001')
    sock.on('message', function(data){
      message = JSON.parse(data)
      cb(message)
    })
  }

  // ZMQ REQ/REP handling
  // https://github.com/JustinTulloss/zeromq.node/issues/48
  db_responses = []
  db_sock.on('message', function(data) {
    message = JSON.parse(data)

    var callback = db_responses.shift();
    if(callback){
      callback.apply(this, [message.payload]);
    } else {
      console.log('db message failure! no callback for '+data)
    }
  });

  this.db = {}
  this.db.get = function(key, cb){
    db_send({action:'get', key:key}, cb)
  }

  this.db.set = function(key, value, cb){
    if(!cb) { cb = function(){} }
    db_send({action:'set', key:key, value:value}, cb)
  }

  function db_send(payload, cb){
    var data = JSON.stringify(auth_wrap(payload))
    db_responses.push(cb)
    db_sock.send(data)
  }

  function auth_wrap(o){
    return {username: username,
            scriptname:scriptname,
            key: scriptkey,
            payload: o}
  }
})()

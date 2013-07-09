var request = require('request')
var zmq = require('zmq')

module.exports = new (function(){
  console.log('cointhink starting')
  var that = this
  var username = process.env.cointhink_user_name
  var scriptname = process.env.cointhink_script_name
  var scriptkey = process.env.cointhink_script_key

  var db_sock = zmq.socket('req');
  db_sock.hwm = 2

  this.log = function(msg) {
    this.signal({type:'log', msg:msg})
  }

  this.signal = function(payload) {
    console.log('signal '+JSON.stringify(payload))
    var url = "http://dockerhost:3002/"+username+"/"+scriptname+"/"+scriptkey+"/"+payload.type
    console.log('post '+url+" "+JSON.stringify(payload.msg))
    request.post({url: url, body: payload.msg, timeout: 1000}, function (error, response, body) {
      if(error) {
        console.log("http request error: "+error)
      } else {
        console.log("HTTP "+response.statusCode+" "+JSON.stringify(body))
      }
    })
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
    console.log('REP: '+data)
    message = JSON.parse(data)

    var callback = db_responses.shift();
    if(callback){
      if(message.status == 'ok') {
        callback.apply(this, [message.payload])
      } else {
        callback.apply(this, [null, message.payload]) // errorback
      }
    } else {
      console.log('db message failure! no callback for '+data)
    }
  });
  db_sock.connect('tcp://dockerhost:3003')

  this.db = {}
  this.db.get = function(key, cb){
    db_send({action:'get', key:key}, cb)
  }

  this.db.set = function(key, value, cb){
    db_send({action:'set', key:key, value:value}, cb)
  }

  function db_send(payload, cb){
    var data = JSON.stringify(auth_wrap(payload))
    if(!cb) { cb = function(){} }
    db_responses.push(cb)
    console.log('REQ: '+data)
    db_sock.send(data)
    console.log('db_send pushed callback into queue #'+db_responses.length)
  }

  function auth_wrap(o){
    return {username: username,
            scriptname:scriptname,
            key: scriptkey,
            payload: o}
  }

  this.db.load = function(cb){
    db_send({action:'load'},function(storage){
      cb(storage)
      // persist any changes done in the callback
      that.db.store(storage)
    })
  }

  this.db.store = function(storage, cb){
    db_send({action:'store', storage: storage}, cb)
  }

  this.trade = function(exchange, market, quantity, buysell, currency, amount, cb){
    db_send({action:'trade', exchange: exchange,
                             market: market,
                             quantity: quantity,
                             buysell: buysell,
                             currency: currency,
                             amount: amount}, cb)
  }

})()

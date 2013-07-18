var request = require('request')
var zmq = require('zmq')
var uuid = require('uuid')
var events = require('events');

module.exports = new (function(){
  console.log('cointhink starting')
  var that = this
  var username = process.env.cointhink_user_name
  var scriptname = process.env.cointhink_script_name
  var scriptkey = process.env.cointhink_script_key

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
    sock = zmq.socket('sub');
    var channel = "C"
    sock.subscribe(channel)
    sock.connect('tcp://dockerhost:3001')
    sock.on('message', function(data){
      data = data.toString().substring(channel.length)
      message = JSON.parse(data)
      cb(message)
    })
  }

  var readyEmitter = new events.EventEmitter();
  this.ready = function(cb){
    readyEmitter.on('ready', function(){
      that.db.load(cb)
    })
  }

  var in_sock = zmq.socket('sub');
  var out_sock = zmq.socket('pub');

  var db_responses = {}
  var first_ping = false
  in_sock.on('message', function(data){
    data = data.toString().substring(channel.length)
    console.log('SUB: '+data)
    message = JSON.parse(data)

    if (first_ping == false && message.action == "pong") {
      first_ping = true
      clearInterval(start_ping_interval)
      readyEmitter.emit('ready')
    } else {
      if(db_responses[message.id]){
        var callback = db_responses[message.id].callback
        if(message.status == 'ok') {
          console.log('matched to a response for '+message.id)
          callback.apply(this, [message.payload])
        } else {
          callback.apply(this, [null, message.payload]) // errorback
        }
        delete db_responses[message.id]
      } else {
        console.log('db message failure! no callback for '+message.id)
      }
    }
  });

  in_sock.connect('tcp://dockerhost:3004')
  out_sock.connect('tcp://dockerhost:3003')
  var channel = "C"
  in_sock.subscribe(channel)
  var start_ping_interval = setInterval(ping, 500)

  function ping(){
    console.log('ping')
    out_sock.send("C"+JSON.stringify({id: uuid.v4(), action: "ping"}))
  }

  this.db = {}
  this.db.get = function(key, cb){
    db_send({action:'get', key:key}, cb)
  }

  this.db.set = function(key, value, cb){
    db_send({action:'set', key:key, value:value}, cb)
  }

  function db_send(payload, cb){
    var authload = auth_wrap(payload)
    var data = JSON.stringify(authload)
    var channel = 'C'
    if(!cb) { cb = function(){} }
    db_responses[authload.id] = {callback: cb, now: new Date()}
    console.log('PUB '+authload.id+' '+data)
    out_sock.send(channel+data)
  }

  function auth_wrap(o){
    return {id: uuid.v4(),
            username: username,
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

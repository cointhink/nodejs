var request = require('request')
var zmq = require('zmq')

module.exports = new (function(){
  console.log(module.id+' starting')
  var username = process.env.cointhink_user_name
  var scriptname = process.env.cointhink_script_name
  var scriptkey = process.env.cointhink_script_key

  this.log = function(msg) {
    this.signal({type:'log', msg:msg})
  }

  this.signal = function(payload) {
    console.log('signal '+JSON.stringify(payload))
    request.post({url:"http://dockerhost:3002/"+username+"/"+scriptname+"/"+scriptkey,
                  json: payload})
  }

  this.exchange = function(name, cb){
    sock = zmq.socket('pull');
    sock.connect('tcp://dockerhost:3001')
    sock.on('message', function(data){
      message = JSON.parse(data)
      cb(message)
    })
  }
})()

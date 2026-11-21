const EventEmitter = require('events');

class GameEventBus extends EventEmitter {}

module.exports = new GameEventBus();

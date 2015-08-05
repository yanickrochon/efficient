
const DEFAULT_TEMPLATE_PATH = '.';
const DEFAULT_EXT = '.eft, .eft.html';
const EXT_SEP = ',';

const MODIFIERS = {
  'encodeURIComponent': modifierEncodeURIComponent,
  'decodeURIComponent': modifierDecodeURIComponent,
  'encodeURI': modifierEncodeURI,
  'decodeURI': modifierDecodeURI,
  'encodeHtml': modifierEncodeHtmlEntities,
  'decodeHtml': modifierDecodeHtmlEntities,
  'encodeXml': modifierEncodeXmlEntities,
  'decodeXml': modifierDecodeXmlEntities,
  'json': modifierJson,
  'upper': modifierUpper,
  'lower': modifierLower,
  'mask': modifierMask
};


var path = require('path');
var fs = require('fs');
var util = require('util');
var entities = require('entities');
var Readable = require('stream').Readable;
var randomBytes = require('crypto').randomBytes;
var EventEmitter = require('events').EventEmitter;
var Context = require('./context');
var errorFactory = require('error-factory');

var Parser = require('./parser');
var Compiler = require('./compiler');

var CompilerException = errorFactory('efficient.CompilerException', ['message']);
var RenderException = errorFactory('efficient.RenderException', ['message']);

var modifiers = {};


module.exports = Engine;


// static methods

Object.defineProperties(Engine, {
  _cache: {
    enumerable: false,
    configurable: false,
    writable: false,
    value: {}
  },

  /**
  Expose extension separator constant
  */
  extSep: {
    enumerable: true,
    configurable: false,
    writable: false,
    value: EXT_SEP
  },

  /**
  Register a new template output modifier
  */
  registerModifier: {
    enumerable: true,
    configurable: false,
    writable: false,
    value: registerModifier
  },

  /**
  Unregister a template modifier
  */
  unregisterModifier: {
    enumerable: true,
    configurable: false,
    writable: false,
    value: unregisterModifier
  },

  /**
  List available template modifiers
  */
  modifiers: {
    enumerable: true,
    configurable: false,
    get: function getModifiers() {
      return modifiers;
    }
  }
});



// instances

function Engine(options) {
  var inst = this;

  if (!(this instanceof Engine)) {
    return new Engine(options);
  }

  EventEmitter.call(this);

  options = options || {};

  Object.defineProperties(this, {
    'resolve': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: function resolve(name) {
        return resolveTemplate(name, inst);
      }
    },
    'render': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: function render(name, data) {
        var internalEngine = new InternalEngine(inst, data);
        var ctx = new Context(data);

        return renderTemplate(name, ctx, internalEngine, inst);
      }
    },
    'renderString': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: function renderString(name, str, data) {
        var internalEngine = new InternalEngine(inst, data);
        var ctx = new Context(data);

        return renderStringTemplate(name, str, ctx, internalEngine, inst);
      }
    }
  });

  this.emit('engineCreated', this);
};
util.inherits(Engine, EventEmitter);

Object.freeze(Engine);


// push all block rules...
for (var modifier in MODIFIERS) {
   modifiers[modifier] = MODIFIERS[modifier];
}


// do NOT keep initialData. We just need it when emitting an event so the
// listeners can have something to relate to
var InternalEngine = function InternalEngine(engine, data) {
  var inst = this;
  var stream = new TemplateStream();
  var namedSegments = {};
  var modifier;
  var halted = false;
  
  Object.defineProperties(this, {
    'stream': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: stream
    },
    'stop': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: function () {
        halted = true;
        stream.push(null);  // EOF
      }      
    },
    'out': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: function (str) {
        if (halted) {
          throw EngineException('Rendering aborted');
        }

        if (modifier) {
          stream.push(modifier(str));
        } else {
          stream.push(str);
        }
      }
    },
    'err': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: function (err) {
        halted = true;
        engine.emit('renderError', err);
        stream.push(null);
      }
    },
    'render': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: function (name, ctx) {
        return renderTemplate(name, ctx, inst, engine);
      }
    },
    'iterator': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: createIterator
    },
    'setSegment': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: function (name, fn, ctx) {
        namedSegments[name] = {
          fn: fn,
          ctx: ctx
        };
      }
    },
    'getSegment': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: function (name) {
        var seg = namedSegments[name];

        if (!seg) {
          return function () {};
        } else {
          return function (ctx) {
            if (seg) {
              ctx = seg.ctx.push(ctx.data);
            }
            return seg.fn(ctx);
          }
        };
      }      
    },
    'callCustom': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: callCustomFunction
    },
    modifiers: {
      enumerable: true,
      configurable: false,
      get: function getModifiers() {
        return modifiers;
      }
    }
  });

  engine.emit('internalEngineCreated', this, data);

  Object.freeze(this);
};


function registerModifier(modifier) {
  var temp;

  if (!(modifier instanceof Function)) {
    throw EngineException('Not a modifier function');
  } else if (!modifier.name) {
    throw EngineException('Anonymous modifier function');
  }

  temp = modifiers;
  modifiers = {};

  for (var mKey in temp) {
    modifiers[mKey] = temp[mKey];
  }

  modifiers[modifier.name] = modifier;

  Object.freeze(modifiers);

  //events.emit('modifierRegistered', modifier);

  return true;
}

function unregisterModifier(modifier) {
  var oldModifiers;

  if (!modifier) {
    throw EngineException('Invalid modifier');
  } else if (modifier instanceof Function) {
    for (var mKey in MODIFIERS) {
      if (MODIFIERS[mKey] === modifier) {
        throw EngineException('Illegal modifier');
      }
    }

    oldModifiers = modifiers;
    modifiers = {};

    for (var mKey in oldModifiers) {
      if (oldModifiers[mKey] !== modifier) {
        modifiers[mKey] = oldModifiers[mKey];
      }
    }
  } else {
    if (typeof modifier !== 'string') {
      throw EngineException('Invalid modifier');
    } else if (MODIFIERS[modifier]) {
      throw EngineException('Illegal modifier');
    }

    if (!modifiers[modifier]) {
      return false;
    }

    oldModifiers = modifiers;
    modifiers = {};

    for (var mKey in oldModifiers) {
      if (mKey !== modifier) {
        modifiers[mKey] = oldModifiers[mKey];
      }
    }

    modifier = oldModifiers[modifier];
  }

  Object.freeze(modifiers);

  //events.emit('modifierUnregistered', modifier);

  return true;
}


function resolveTemplate(name, engine) {
  if (Engine._cache[name]) {
    return Engine._cache[name];
  } else {
    return Engine._cache[name] = new Promise(function (resolve, reject) {
      var paths = engine.config.paths || DEFAULT_TEMPLATE_PATH;
      var ext = engine.config.ext || DEFAULT_EXT;
      var file;
      var count = 0;
      var total = 0;

      if (typeof paths === 'string') {
        paths = paths.split(path.delimiter);
      }

      if (typeof ext === 'string') {
        ext = ext.replace(' ', '').split(EXT_SEP);
      }

      if (ext.indexOf('') === -1) {
        ext.push('');  // try without extension
      }

      for (var x = 0, xlen = ext.length; x < xlen && !found; ++x) {
        for (var i = 0, len = paths.length; i < len && !found; ++i) {
          file = path.join(paths[i], name + ext[x]);
          ++total;

          fs.exists(file).then(function (found) {
            ++count;

            if (!resolve) {
              if (found) {
                engine.emit('templateResolved', ''+file);
                resolve({ filename: ''+file });
                resolved = true;
              } else if (count >= total) {
                reject(name);
              }
            }
          });
        }
      }
    });
  }
}


function renderTemplate(name, ctx, internalEngine, engine) {
  var promise = resolveTemplate(name, internalEngine).then(function (template) {
    if (template.fn) {
      return template.fn;
    } else {
      return new Promise(function (resolve, reject) {
        fs.readFile(template.filename, function (err, content) {
          var parsed;

          if (err) {
            reject(err);
          } else {
            parsed = Parser.parse(content);
            template.fn = Compiler.compile(parsed);

            resolve(fn);
          }
        });
      });
    }
  }).then(function (fnTemplate) {
    return fnTemplate(internalEngine, ctx).then(function () {
      return internalEngine.stream.templateString;
    });
  });

  promise.stream = internalEngine.stream;

  return promise;
}


function renderStringTemplate(name, str, ctx, internalEngine, engine) {
  var cachedTemplate = !!name;

  if (!cachedTemplate) {
    name = randomBytes(128).toString('base64');
  }

  Engine._cache[name] = Promise.resolve({
    filename: name,
    fn: Compiler.compile(Parser.parse(str))
  });

  return renderTemplate(name, ctx, internalEngine).then(function (content) {
    if (!cachedTemplate) {
      delete Engine._cache[name];
    }

    return content;
  });
}


function createIterator(values, ctx, cb) {
  var arr;

  if (values instanceof Array) {
    arr = values.map(function (val, index) {
      return {
        index: index,
        key: index,
        value: val
      };
    });
  } else if (typeof values === 'number') {
    if (values > 0) {
      arr = Array.apply(null, Array(values)).map(function (undefined, index) {
        return {
          index: index,
          key: index,
          value: values
        };
      });
    } else {
      arr = [];
    }
  } else if (values !== null && typeof values === 'object') {
    arr = Object.keys(values).map(function (key, index) {
      return {
        index: index,
        key: key,
        value: values[key]
      };
    })
  } else {
    arr = [];
  }

  return arr.reduce(function (p, value) {
    return p.then(function () {
      return cb(ctx.push(value));
    });
  }, Promise.resolve(ctx));
}


function callCustomFunction(path, ctx, segments) {
  var custom = ctx.getContext(String(path)).data;
  var promise = Promise.resolve(ctx);

  if (typeof custom === 'function') {
    return promise.then(function () {
      return custom(ctx, segments);
    });
  } else {
    return promise;
  }
}




/**
Modifier - c
*/
function modifierEncodeURIComponent(val) {
  return encodeURIComponent(String(val));
}

/**
Modifier - C
*/
function modifierDecodeURIComponent(val) {
  return decodeURIComponent(String(val));
}

/**
Modifier - e
*/
function modifierEncodeURI(val) {
  return encodeURI(String(val));
}

/**
Modifier - E
*/
function modifierDecodeURI(val) {
  return decodeURI(String(val));
}

/**
Modifier - j
*/
function modifierJson(val, replacer, space) {
  return JSON.stringify(val, replacer || null, space || 4);
}

/**
Modifier - U
*/
function modifierUpper(val) {
  return String(val).toLocaleUpperCase();
}

/**
Modifier - l
*/
function modifierLower(val) {
  return String(val).toLocaleLowerCase();
}

/**
Modifier - *
*/
function modifierMask(val, maskChar) {
  return String(val).replace(/./g, maskChar || '*');
}

/**
Modifier - h
*/
function modifierEncodeHtmlEntities(val) {
  return entities.encodeHTML(String(val));
}

/**
Modifier - H
*/
function modifierDecodeHtmlEntities(val) {
  return entities.decodeHTML(String(val));
}

/**
Modifier - x
*/
function modifierEncodeXmlEntities(val) {
  return entities.encodeXML(String(val));
}

/**
Modifier - x
*/
function modifierDecodeXmlEntities(val) {
  return entities.decodeXML(String(val));
}





function TemplateStream(options) {
  Readable.call(this, options);

  var templateString = '';

  Object.defineProperty(this, 'templateString', {
    enumerable: true,
    configurable: false,
    get: function getTemplateString() {
      return templateString;
    }
  });

  this.on('data', function (buffer) {
    templateString += buffer.toString();
  })
}
util.inherits(TemplateStream, Readable);

TemplateStream.prototype._read = function () {
  /* ignore */
};

const DEFAULT_TEMPLATE_PATH = '.';
const DEFAULT_EXT = '.eft,.eft.html,.html';
const EXT_SEP = ',';

var path = require('path');
var fs = require('fs');
var util = require('util');
var Readable = require('stream').Readable;
var randomBytes = require('crypto').randomBytes;
var EventEmitter = require('events').EventEmitter;
var Context = require('./context');
var modifiers = require('./modifiers');
var errorFactory = require('error-factory');

var Parser = require('./parser');
var Compiler = require('./compiler');

var CompilerException = errorFactory('efficient.CompilerException', ['message']);
var RenderException = errorFactory('efficient.RenderException', ['message']);

var slice = Array.prototype.slice;
var templateCacheCount = 0;

var engineId = 0;


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
  }
});



// instances

function Engine(options) {
  var inst = this;
  var _id;

  if (!(this instanceof Engine)) {
    return new Engine(options);
  }

  EventEmitter.call(this);

  _id = ++engineId;
  options = options || {};

  Object.defineProperties(this, {
    '_id': {
      enumerable: false,
      configurable: false,
      get: function _id() {
        return _id;
      }
    },
    'options': {
      enumerable: true,
      configurable: false,
      get: function getOptions() {
        return options;
      }
    },
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
};
util.inherits(Engine, EventEmitter);

Object.freeze(Engine);


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
      value: function (name, ctx, outputModifier) {
        modifier = modifierWrapper(modifier, outputModifier);

        return renderTemplate(name, ctx, inst, engine).then(function () {
          modifier = modifier.previous;
        });
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
    'modifier': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: modifierHandler
    }
  });

  engine.emit('internalEngineCreated', this, data);

  Object.freeze(this);
};



function resolveTemplate(name, engine) {
  var key = engine._id + '$' + name;

  if (Engine._cache[key]) {
    return Engine._cache[key];
  } else {
    return Engine._cache[key] = new Promise(function (resolve, reject) {
      var paths = engine.options.paths || DEFAULT_TEMPLATE_PATH;
      var pathIndex = 0;
      var pathCount;
      var ext = engine.options.ext || DEFAULT_EXT;
      var extIndex = 0;
      var extCount;

      if (typeof paths === 'string') {
        paths = paths.split(path.delimiter);
      }

      if (typeof ext === 'string') {
        ext = ext.replace(' ', '').split(EXT_SEP);
      }

      if (!ext.length || (ext.indexOf('') === -1)) {
        ext.push('');  // try without extension
      }

      extCount = ext.length;
      pathCount = paths.length;

      if (!pathCount) {
        reject(name);
      } else {
        (function nextFile() {
          var file;

          if (extIndex >= extCount && pathIndex < pathCount) {
            pathIndex++;
            extCount = 0;
          }

          if (pathIndex >= pathCount) {
            reject(RenderException('template not found : ' + name));
          } else {
            file = path.join(paths[pathIndex], name + ext[extIndex]);

            fs.stat(file, function (err, stat) {
              if (err || !stat.isFile()) {
                ++extIndex;
                nextFile();
              } else {
                engine.emit('templateResolved', file);
                resolve({ filename: file });
              }
            });
          }
        })();
      }
    });
  }
}


function renderTemplate(name, ctx, internalEngine, engine) {
  var promise = resolveTemplate(name, engine).then(function (template) {
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
    var oldTemplateName = ctx.templateName;

    ctx.templateName = name;

    return fnTemplate(internalEngine, ctx).then(function () {
      ctx.templateName = oldTemplateName;

      return internalEngine.stream.templateString;
    });
  });

  promise.stream = internalEngine.stream;

  return promise;
}


function renderStringTemplate(name, str, ctx, internalEngine, engine) {
  var cachedTemplate = !!name;
  var promise;
  var stream;
  var key;

  if (!cachedTemplate) {
    name = randomBytes(128).toString('base64') + '-' + (++templateCacheCount);
  }

  key = engine._id + '$' + name;

  Engine._cache[key] = Promise.resolve({
    filename: name,
    fn: Compiler.compile(Parser.parse(str))
  });

  function _cleanup() {
    if (!cachedTemplate) {
      delete Engine._cache[key];
    }
  }

  promise = renderTemplate(name, ctx, internalEngine, engine);
  stream = promise.stream;

  promise = promise.then(function (content) {
    _cleanup();

    return content;
  }).catch(function (err) {
    _cleanup();

    throw err;
  });

  promise.stream = stream;

  return promise;
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


function callCustomFunction(path, ctx, segments, modifier) {
  var engine = this;
  var custom = ctx.get(String(path)).data;
  var promise = Promise.resolve(ctx);

  if (typeof custom === 'function') {
    return promise.then(function (ctx) {
      return custom.call(engine, ctx, segments, modifier);
    });
  } else {
    return promise;
  }
}


function modifierHandler(name) {
  var modifier = modifiers.registry[name];

  if (!modifier) {
    throw EngineException('Invalid modifier ' + name);
  }

  switch (arguments.length) {
    case 0:
      return modifier();
    case 1:
      return modifier(arguments[1]);
    case 2:
      return modifier(arguments[1], arguments[2]);
    case 3:
      return modifier(arguments[1], arguments[2], arguments[3]);
    case 4:
      return modifier(arguments[1], arguments[2], arguments[3], arguments[4]);
    default:
      return modifier.apply(modifier, slice.call(arguments, 1));
  }
}



/**
Wrap modifier so it returns a composed modifier

Usage:

  modofier = modifierWrapper(modifier, fn);
  ...
  modifier = modifier.previous;

@param prev   the previous modifier function (may be undefined)
@param next   the next modifier function
@param ...
@return Function
*/
function modifierWrapper(prev, next) {
  var mod;

  if (next instanceof Function) {
    if (prev) {
      mod = function (str) {
        return prev(next(str));
      }
    } else {
      mod = next;
    }
  } else {
    mod = slice.call(arguments, 1).reduce(function (prev, next) {
      if (prev) {
        return function (str) {
          return prev(next(str));
        };
      } else {
        return next;
      }
    }, prev);
  }

  mod.previous = prev;

  return mod;
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
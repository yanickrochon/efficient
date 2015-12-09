
const DEFAULT_TEMPLATE_PATH = { '*': '.' };
const DEFAULT_EXT = ['.eft', '.eft.html', '.html'];
const EXT_DELIMITER = ',';
const DEFAULT_ENCODING = 'utf-8';
const DEFAULT_TIMEOUT = 30000;

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

var RenderException = errorFactory('efficient.RenderException', ['message']);

var slice = Array.prototype.slice;
var templateCacheCount = 0;


module.exports = Engine;


// static methods

Object.defineProperties(Engine, {
  '_cache': {
    enumerable: false,
    configurable: false,
    writable: false,
    value: {}
  },

  /**
  Expose extension delimiter constant
  */
  'EXT_DELIMITER': {
    enumerable: true,
    configurable: false,
    writable: false,
    value: EXT_DELIMITER
  }
});



// instances

function Engine(options) {
  if (!(this instanceof Engine)) {
    return new Engine(options);
  }

  EventEmitter.call(this);

  options = options || {};

  // TODO : check options and freeze if necessary

  Object.freeze(options);

  Object.defineProperties(this, {
    '_cache': {
      enumerable: false,
      configurable: false,
      writable: false,
      value: {}
    },
    'options': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: options
    },
    'resolve': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: function resolve(name) {
        return resolveTemplate(name, this).then(function (template) {
          return template.name;
        });
      }
    },
    'render': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: function render(name, data) {
        var internalEngine = new InternalEngine(this, data);
        var ctx = new Context(data);
        var streamPromise = new Promise(function (resolve, reject) {
          internalEngine.stream.on('error', reject);
          internalEngine.stream.on('end', function () {
            resolve(internalEngine.stream.templateString);
          });
        });
        var renderPromise = renderTemplate(name, ctx, internalEngine, this).then(function () {
          internalEngine.stream.push(null);
          return streamPromise;  // wait for stream to close
        });

        Object.defineProperty(renderPromise, 'stream', {
          enumerable: true,
          configurable: false,
          writable: false,
          value: internalEngine.stream
        });

        return renderPromise;
      }
    },
    'defineTemplate': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: function defineTemplate(name, str) {
        // local override of any global template
        this._cache[name] = Promise.resolve({
          name: name,
          fn: Compiler.compile(Parser.parse(str))
        });
      }
    }
  });
};
util.inherits(Engine, EventEmitter);

Object.freeze(Engine);


// do NOT keep initialData. We just need it when emitting an event so the
// listeners can have something to relate to
var InternalEngine = function InternalEngine(engine, data) {
  var stream = new TemplateStream();
  var namedSegments = {};
  var modifier;
  var haltedMsg = null;

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
      value: function (msg) {
        haltedMsg = msg || true;
        stream.push(null);  // EOF
      }
    },
    'out': {
      enumerable: true,
      configurable: false,
      writable: false,
      value: function (str) {
        if (haltedMsg) {
          throw RenderException('Rendering aborted' + (typeof haltedMsg === 'string' ? (' : ' + haltedMsg) : ''));
        }

        if (typeof str !== 'string') {
          str = String(str);
        }

        if (modifier) {
          stream.push(String(modifier(str)));
        } else {
          stream.push(String(str));
        }
      }
    },
    'render': {
      enumerable: false,
      configurable: false,
      writable: false,
      value: function (name, ctx, outputModifier) {
        if (outputModifier) {
          modifier = modifierWrapper(modifier, outputModifier);
        }

        return renderTemplate(name, ctx, this, engine).then(function () {
          if (modifier) {
            modifier = modifier.previous;
          }
        });
      }
    },
    'iterator': {
      enumerable: false,
      configurable: false,
      writable: false,
      value: createIterator
    },
    'setSegment': {
      enumerable: false,
      configurable: false,
      writable: false,
      value: function (name, ctx, fn) {
        namedSegments[name] = {
          fn: fn,
          ctx: ctx
        };
      }
    },
    'getSegment': {
      enumerable: false,
      configurable: false,
      writable: false,
      value: function (name, outputModifier) {
        var seg = namedSegments[name];

        if (!seg) {
          return function () {};
        } else {
          return function (ctx) {
            if (outputModifier) {
              modifier = modifierWrapper(modifier, outputModifier);

              return Promise.resolve().then(function () {
                return seg.fn(seg.ctx.push(ctx.data));
              }).then(function () {
                if (modifier) {
                  modifier = modifier.previous;
                }
              });
            } else {
              return seg.fn(seg.ctx.push(ctx.data));
            }
          }
        };
      }
    },
    'callCustom': {
      enumerable: false,
      configurable: false,
      writable: false,
      value: function callCustomFunction(path, ctx, segments, outputModifier) {
        var engine = this;
        var custom = ctx.get(String(path)).data;
        var promise = Promise.resolve(ctx);

        if (outputModifier) {
          modifier = modifierWrapper(modifier, outputModifier);
        }

        if (typeof custom === 'function') {
          return promise.then(function (ctx) {
            return custom.call(engine, ctx, segments);
          }).then(function () {
            if (modifier) {
              modifier = modifier.previous;
            }
          });
        } else {
          return promise;
        }
      }
    },
    'modifier': {
      enumerable: false,
      configurable: false,
      writable: false,
      value: modifierHandler
    }
  });

  engine.emit('internalEngineCreated', this, data);

  Object.freeze(this);
};


function resolveTemplate(name, engine) {
  if (engine._cache[name]) {
    return engine._cache[name];
  } else if (Engine._cache[name]) {
    return Engine._cache[name];
  } else {
    return engine._cache[name] = new Promise(function (resolve, reject) {
      var paths;
      var pathPrefix;
      var ext = engine.options.ext || DEFAULT_EXT;
      var pathIndex = 0;
      var pathCount;
      var extIndex = 0;
      var extCount;

      paths = engine.options.paths || DEFAULT_TEMPLATE_PATH;
      pathPrefix = Object.keys(paths).filter(function (prefix) {
        return (typeof prefix === 'string') && ((prefix === '*') || (name.substr(0, prefix.length) === prefix));
      }).sort(function (a, b) {
        if (a === '*') {
          return 1;
        } else if (b === '*') {
          return -1;
        } else {
          return b.split(path.sep).length - a.split(path.sep).length;
        }
      });

      ext = (typeof ext === 'string' ? ext.replace(/\s+/g, '').split(EXT_DELIMITER) : ext).map(function (x) {
        return x.length && x.charAt(0) !== '.' ? ('.' + x) : x;
      });

      if (!ext.length || (ext.indexOf('') === -1)) {
        ext.push('');  // try without extension
      }

      pathCount = pathPrefix.length;
      extCount = ext.length;

      (function nextFile() {
        var prefix;
        var file;

        if (extIndex >= ext.length && pathIndex < pathCount) {
          pathIndex++;
          extCount = 0;
        }

        if (pathIndex >= pathCount) {
          reject(RenderException('Template not found : ' + name));
        } else {
          prefix = pathPrefix[pathIndex];
          file = path.resolve('.', path.join(paths[prefix], (prefix === '*' ? name : name.substr(prefix.length)) + ext[extIndex]));

          fs.stat(file, function (err, stat) {
            if (err || !stat.isFile()) {
              ++extIndex;
              nextFile();
            } else {
              paths = ext = pathPrefix = undefined;
              engine.emit('templateResolved', file);

              if (Engine._cache[file]) {
                resolve(Engine._cache[file]);
              } else {
                resolve(Engine._cache[file] = Promise.resolve({ name: file }));
              }
            }
          });
        }
      })();
    });
  }
}


function renderTemplate(name, ctx, internalEngine, engine) {
  return resolveTemplate(name, engine).then(function (template) {
    if (template.fn) {
      return template.fn;
    } else {
      return new Promise(function (resolve, reject) {
        fs.readFile(template.name, engine.options.encoding || DEFAULT_ENCODING, function (err, content) {
          var parsed;

          if (err) {
            reject(err);
          } else {
            try {
              parsed = Parser.parse(content);
              template.fn = Compiler.compile(parsed);

              resolve(template.fn);
            } catch (err) {
              err.message = err.message + ' (' + name + ')';
              reject(err);
            }
          }
        });
      });
    }
  }).then(function (fnTemplate) {
    //var rejected = false;
    var oldTemplateName = ctx.templateName;
    var timeoutDelay = engine.options.timeout || DEFAULT_TIMEOUT;
    var timer;

    ctx.templateName = name;

    return new Promise(function (resolve, reject) {
      timer = setTimeout(function () {
        //rejected = true;
        reject(RenderException('Rendering timeout (' + timeoutDelay + 'ms)'));
      }, timeoutDelay);

      fnTemplate(internalEngine, ctx).then(function () {
        timer && clearTimeout(timer);
        ctx.templateName = oldTemplateName;
        //if (!rejected) {
          resolve();
        //}
      }).catch(function (err) {
        //rejected = true;
        engine.emit('renderError', err);
        reject(err);
      });
    });
  });
}


function createIterator(values, ctx, cb) {
  var promise = Promise.resolve();

  if (values instanceof Array) {
    promise = values.reduce(function (p, val, index) {
      return p.then(function () {
        return cb(ctx.push({
          index: index,
          key: index,
          value: val
        }));
      });
    }, promise);
  } else if (typeof values === 'number') {
    if (values > 0) {
      promise = Array.apply(null, Array(values)).reduce(function (p, undef, index) {
        return p.then(function () {
          return cb(ctx.push({
            index: index,
            key: index,
            value: index
          }));
        });
      }, promise);
    }
  } else if (values !== null && typeof values === 'object') {
    promise = Object.keys(values).reduce(function (p, key, index) {
      return p.then(function () {
        return cb(ctx.push({
          index: index,
          key: key,
          value: values[key]
        }));
      });
    }, promise);
  }

  return promise;
}


function modifierHandler(name, str) {
  var modifier = name && modifiers.registry[name];

  if (!modifier) {
    throw RenderException('Invalid modifier ' + name);
  }

  switch (arguments.length) {
    //case 0:
    //case 1:
    case 2:
      return modifier(str);
    case 3:
      return modifier(str, arguments[2]);
    case 4:
      return modifier(str, arguments[2], arguments[3]);
    case 5:
      return modifier(str, arguments[2], arguments[3], arguments[4]);
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

  //if (typeof next === 'function') {
    if (prev) {
      mod = function (str) {
        return prev(next(str));
      }
    } else {
      mod = next;
    }
  //} else {
  //  mod = slice.call(arguments, 1).reduce(function (prev, next) {
  //    if (prev) {
  //      return function (str) {
  //        return prev(next(str));
  //      };
  //    } else {
  //      return next;
  //    }
  //  }, prev);
  //}

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
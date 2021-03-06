'use strict';

const DEFAULT_TEMPLATE_PATH = { '*': '.' };
const DEFAULT_EXT = ['.eft', '.eft.html', '.html'];
const EXT_DELIMITER = ',';
const DEFAULT_ENCODING = 'utf-8';
const DEFAULT_TIMEOUT = 30000;

const path = require('path');
const fs = require('fs');
const util = require('util');
const Readable = require('stream').Readable;
const randomBytes = require('crypto').randomBytes;
const EventEmitter = require('events').EventEmitter;
const Context = require('./context');
const modifiers = require('./modifiers');
const errorFactory = require('error-factory');

const Parser = require('./parser');
const Compiler = require('./compiler');

const RenderException = errorFactory('efficient.RenderException', ['message']);

const slice = Array.prototype.slice;
const templateCacheCount = 0;


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
        const internalEngine = new InternalEngine(this, data);
        const ctx = new Context(data);
        const streamPromise = new Promise(function (resolve, reject) {
          internalEngine.stream.on('error', reject);
          internalEngine.stream.on('end', function () {
            resolve(internalEngine.stream.templateString);
          });
        });
        const renderPromise = renderTemplate(name, ctx, internalEngine, this).then(function () {
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
        try {
          // local override of any global template
          this._cache[name] = Promise.resolve({
            name: name,
            fn: Compiler.compile(Parser.parse(str))
          });
        } catch (err) {
          err.message = err.message + ' (' + name + (err.location ? ':' + err.location.start.line + ':' + err.location.start.column : /* istanbul ignore next */ '') + ')';
          throw err;
        }
      }
    }
  });
};
util.inherits(Engine, EventEmitter);

Object.freeze(Engine);


// do NOT keep initialData. We just need it when emitting an event so the
// listeners can have something to relate to
const InternalEngine = function InternalEngine(engine, data) {
  const stream = new TemplateStream();
  const namedSegments = {};
  let modifier;
  let haltedMsg = null;

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
        const seg = namedSegments[name];

        if (!seg) {
          return function () {};
        } else {
          return function (ctx) {
            if (outputModifier) {
              modifier = modifierWrapper(modifier, outputModifier);

              return Promise.resolve().then(function () {
                return seg.fn(seg.ctx.push(ctx.data));
              }).then(function () {
                modifier = modifier.previous;
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
        const engine = this;
        const custom = ctx.get(String(path)).data;
        const promise = Promise.resolve(ctx);

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
      let paths;
      let pathPrefix;
      let ext = engine.options.ext || DEFAULT_EXT;
      let pathIndex = 0;
      let pathCount;
      let extIndex = 0;
      let extCount;

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
        if (extIndex >= ext.length && pathIndex < pathCount) {
          pathIndex++;
          extCount = 0;
        }

        if (pathIndex >= pathCount) {
          reject(RenderException('Template not found : ' + name));
        } else {
          let prefix = pathPrefix[pathIndex];
          let file = path.resolve('.', path.join(paths[prefix], (prefix === '*' ? name : name.substr(prefix.length)) + ext[extIndex]));

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
          if (err) {
            reject(err);
          } else {
            try {
              let parsed = Parser.parse(content);
              template.fn = Compiler.compile(parsed);

              resolve(template.fn);
            } catch (err) {
              err.message = err.message + ' (' + name + (err.location ? ':' + err.location.start.line + ':' + err.location.start.column : /* istanbul ignore next */ '') + ')';
              reject(err);
            }
          }
        });
      });
    }
  }).then(function (fnTemplate) {
    const oldTemplateName = ctx.templateName;
    const timeoutDelay = engine.options.timeout || DEFAULT_TIMEOUT;
    let rejected = false;
    let timer;

    ctx.templateName = name;

    return new Promise(function (resolve, reject) {
      timer = setTimeout(function () {
        rejected = true;
        reject(RenderException('Rendering timeout (' + timeoutDelay + 'ms)'));
      }, timeoutDelay);

      fnTemplate(internalEngine, ctx).then(function () {
        timer && clearTimeout(timer);
        ctx.templateName = oldTemplateName;
        if (!rejected) {
          resolve();
        }
      }).catch(function (err) {
        timer && clearTimeout(timer);
        rejected = true;
        engine.emit('renderError', err);
        reject(err);
      });
    });
  });
}


function createIterator(values, ctx, cb) {
  let promise = Promise.resolve();

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
  const modifier = name && modifiers.registry[name];

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
  let mod;

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



class TemplateStream extends Readable {
  constructor(options) {
    super(options);

    let templateString = '';

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

  _read() { /* ignore */ }
};

const SUSPICIOUS_SEGMENT_PATTERN = /\{.*?\{.+?\}.*?\}/;

const VAR_ENGINE = 'engine';
const VAR_CTX = 'ctx';
const VAR_DEBUG_INFO = 'debug';

const NEWLINE = require('os').EOL;

const BUILDER_MAP = {
  'text':         buildOutputSegment,
  'output':       buildOutputSegment,
  'conditional':  buildSegment('conditional', buildSegmentConditional),
  'iterator':     buildSegment('iterator', buildSegmentIterator),
  'custom':       buildSegment('custom', buildSegmentCustom),
  'namedDeclare': buildSegment('namedDeclare', buildSegmentNamedDeclare),
  'namedRender':  buildSegment('namedRender', buildSegmentNamedRender),
  'partial':      buildSegment('partial', buildSegmentPartial)
}


const TEMPLATE_TOKEN = /__([^_]+)__/g;
const TEMPLATE_TPL = /_=([^=]+)=_/g;
const TEMPLATES = {
  'template': 'function(__ENGINE__,__CTX__){_=TEMPLATE.DEBUG.INIT=_;__TEMPLATE__;}',
  'template.debug.init': 'var __DEBUG.INFO__',
  'template.debug': '__DEBUG.INFO__={column:__COLUMN__,line:__LINE__,offset:__OFFSET__}',

  'promise': 'Promise.resolve(__CTX__)',
  'promise.then': '.then(_=FN=_)',
  //'promise.return': '.then(function(){return __CTX__;})',
  'promise.catch': '.catch(function(err){err.column=__DEBUG.INFO__.column;err.line=__DEBUG.INFO__.line;err.offset=__DEBUG.INFO__.offset;throw err;})',

  'fn': 'function(__CTX__){__CODE__}',

  'ctx.get': 'ctx.get(__PATH__)',
  'ctx.data': '_=CTX.GET=_.data',
  'ctx.set': '(_=FN=_)(_=CTX.GET=_)',

  // output
  'out': 'engine.out(__VALUE__)',

  // Segment: conditional
  'seg.conditional': 'if(__EXPR__){__CODE__}',
  'seg.conditional.elseif': 'else _=seg.conditional=_',
  'seg.conditional.else': 'else{__CODE__}',

  // Segment: iterator
  'seg.iterator': 'engine.iterator(__EXPR__,__CTX__,_=FN=_)',

  // Segment: named
  'seg.named.declare': 'engine.setSegment(__EXPR__,__CTX__,_=FN=_)',
  'seg.named.render': 'engine.getSegment(__EXPR__,__MODIFIER__)(__CTX__)',

  // Segment: custom
  'seg.custom': 'engine.callCustom(__PATH__,__CTX__,__SEGLIST__,__MODIFIER__)',

  // Segment: partial
  'seg.partial': 'engine.render(__EXPR__,__CTX__,__MODIFIER__)'

};

const BEAUTIFY_OPTIONS = {
  'indent_size': 2,
  'indent_char': ' ',
  'eol': '\n',
  'indent_level': 0,
  'indent_with_tabs': false,
  'preserve_newlines': true,
  'max_preserve_newlines': 10,
  'jslint_happy': false,
  'space_after_anon_function': false,
  'brace_style': 'collapse',
  'keep_array_indentation': false,
  'keep_function_indentation': false,
  'space_before_conditional': true,
  'break_chained_methods': false,
  'eval_code': false,
  'unescape_strings': false,
  'wrap_line_length': 80,
  'wrap_attributes': 'auto',
  'wrap_attributes_indent_size': 4,
  'end_with_newline': false
};

var vm = require('vm');
var errorFactory = require('error-factory');

var CompilerException = errorFactory('efficient.CompilerException', ['message', 'segment']);

var Compiler = module.exports;

var globalOptions = {
  debug: false,
  ignoreSuspiciousSegments: false,
  beautify: false,
  templateGlobals: {}
};

/**
static API
*/
Compiler.compile = compile;

/**
Compiler flags
*/
Object.defineProperties(Compiler, {
  // Run JS Beautify on the template function
 'BEAUTIFY': {
    configurable: false,
    enumerable: true,
    get: function () {
      return globalOptions.beautify;
    },
    set: function (val) {
      if (!val) {
        globalOptions.beautify = false;
      } else if (typeof val !== 'object') {
        globalOptions.beautify = BEAUTIFY_OPTIONS;
      } else {
        globalOptions.beautify = val;
      }
    }
  },
  // Add error handlers with debug information within the template
  'DEBUG': {
    configurable: false,
    enumerable: true,
    get: function () {
      return globalOptions.debug;
    },
    set: function (val) {
      globalOptions.debug = !!val;
    }
  },
  // Detect if outputting segment-like strings
  'IGNORE_SUSPICIOUS_SEGMENTS': {
    configurable: false,
    enumerable: true,
    get: function () {
      return globalOptions.ignoreSuspiciousSegments;
    },
    set: function (val) {
      globalOptions.ignoreSuspiciousSegments = !!val;
    }
  }
});


Object.freeze(Compiler);



function compile(segments, options) {
  var iterator;
  var chunk;
  var template;

  if (!Array.isArray(segments)) {
    throw CompilerException('Invalid segments ' + String(segments));
  }

  options = options || {};

  Object.keys(globalOptions).forEach(function (key) {
    if (!(key in options)) {
      options[key] = globalOptions[key];
    }
  });

  try {
    iterator = segmentIterator(segments);
    chunk = build(iterator, options);

    if (!chunk.async) {
      chunk.code = 'return '  + getTemplate('promise', {
        ctx: ''
      }) + (chunk.code && (getTemplate('promise.then', {
        ctx: '',
        fn: getTemplate('fn', {
          ctx: '',
          code: chunk.code
        })
      })));
    }

    template = getTemplate('template', {
      'template': chunk.code + (options.debug && getTemplate('promise.catch') || '')
    });

    if (options.beautify) {
      template = require('js-beautify')(template, options.beautify);
    }


    return vm.runInNewContext('f=' + template, options.templateGlobals);
  } catch (e) {
    console.info("*** TEMPLATE CODE", template);
    if (options.debug) {
      throw e;
    } else {
      // obfuscate original error
      throw CompilerException('Malformed parsed data');
    }
  }
}


function segmentIterator(segments, depth, mods) {
  var index = 0;
  //var len = segments.length;

  detph = depth || 0;
  mods = mods || []

  return {
    get modifiers() {
      return mods;
    },
    //get depth() {
    //  return depth;
    //},
    get current() {
      return segments[index];
    },
    //get peek() {
    //  return segments[index + 1];
    //},
    //get hasNext() {
    //  return index < len;
    //},
    get next() {
      return segments[++index];
    },
    consume: function (cb) {
      var modifiers = mods.concat(this.current.modifiers || []);
      var startIndex = ++index;

      while (segments[index] && !cb(segments[index])) {
        ++index;
      }

      return segmentIterator(segments.slice(startIndex, index), depth + 1, modifiers);
    }
  };
}

function getTemplate(name, tokens) {
  tokens = tokens || {};

  'ctx' in tokens || (tokens['ctx'] = VAR_CTX);
  tokens['engine'] = VAR_ENGINE;
  tokens['debug.info'] = VAR_DEBUG_INFO;

  return TEMPLATES[name].replace(TEMPLATE_TPL, function (match, name) {
    return tokens[name.toLowerCase()] || getTemplate(name.toLowerCase(), tokens);
  }).replace(TEMPLATE_TOKEN, function (match, token) {
    token = token.toLowerCase();
    return String(tokens[token]);
  });
}


function getDebugCode(segment, options, delimiter) {
  if (options.debug && segment) {
    return getTemplate('template.debug', {
      'column': isNaN(segment.column) ? NaN : segment.column,
      'line': isNaN(segment.line) ? NaN : segment.line,
      'offset': isNaN(segment.offset) ? NaN : segment.offset
    }) + delimiter;
  }
  return '';
}


function build(iterator, options) {
  var async = false;
  var buffer = '';
  var code = '';
  var chunk = { code: '' };

  function flushBuffer() {
    if (buffer) {
      if (async) {
        code = code && (code + getTemplate('promise.then', {
          ctx: '',
          code: buffer
        })) || buffer;
      } else {
        code = code + buffer;
      }

      buffer = '';
    }
  }

  while (iterator.current) {
    builder = BUILDER_MAP[iterator.current.type];

    if (builder) {
      chunk = builder(iterator, options, async);

      if (chunk.async || async) {
        flushBuffer();

        if (!async && code) {
          code = 'return ' + getTemplate('promise', {
            ctx: ''
          }) + getTemplate('promise.then', {
            ctx: '',
            code: code
          });
        }

        async = true;
      }

      buffer = buffer + chunk.code;
    } else {
      throw CompilerException('Invalid segment: ' + iterator.current.type);
    }
  }

  flushBuffer();

  return {
    async: async,
    code: code
  };

}



function buildOutputSegment(iterator, options) {
  var async = false;
  var output = [];
  var previousText = false;
  var context;
  var contextSeg;
  var expr;
  var initBuffer = [];
  var code = '';
  var debug = getDebugCode(iterator.current, options, ';');

  function flushOutput() {
    if (output.length) {
      // we are changing context, so dump output first
      if (context) {
        code += getTemplate('ctx.set', {
          path: quote(context),
          code: getTemplate('out', {
            'value': wrapModifiers(iterator.modifiers, output.join('+'), true, initBuffer)
          }) + ';'
        }) + ';';
      } else {
        code += getTemplate('out', {
          'value': wrapModifiers(iterator.modifiers, output.join('+'), true, initBuffer)
        }) + ';'
      }
      output = [];
    }
  }

  while (iterator.current && (iterator.current.type === 'text' || iterator.current.type === 'output')) {

    if (iterator.current.type === 'text') {
      // remove string concatenation
      if (previousText) {
        output[output.length - 1] = output[output.length - 1].substr(0, output[output.length - 1].length - 1) + quote(String(iterator.current.content)).substr(1);
      } else {
        output.push(quote(String(iterator.current.content)));
      }

      if (!options.ignoreSuspiciousSegments) {
        checkForSuspiciousSegments( output[output.length - 1], iterator.current);
      }

      previousText = true;
    } else /*if (iterator.current.type === 'output')*/ {
      //console.log("***", iterator.current);

      if (context !== undefined && context !== iterator.current.context && output.length) {
        flushOutput();
      }
      context = iterator.current.context;

      contextSeg = iterator.current;
      // override debug info with first context
      debug = getDebugCode(contextSeg, options, ';');

      output.push(wrapModifiers(iterator.current.modifiers, buildExpression(iterator.current.expression, initBuffer), false, initBuffer));
      previousText = false;
    }

    iterator.next;
  }

  flushOutput();

  return wrapCodeSegment(false, debug, code, initBuffer);
}




function buildSegment(segType, segmentBuilder) {
  return function buildSegmentWrapper(iterator, options, alreadyAsync) {
    var inSegment = true;
    var async = false;
    var context = iterator.current.context;
    var code = '';
    var count = 0;
    var chunk;

    while (inSegment && iterator.current && iterator.current.type === segType) {
      chunk = segmentBuilder(iterator, options, ++count);

      async = async || chunk.async;
      code = code + chunk.code;

      // self-closing
      if (iterator.current && iterator.current.closing) {
        iterator.next;  // skipping closing segment
        inSegment = false;
      }
    }

    if (async) {
      if (!alreadyAsync || context) {
        code = 'return ' + getTemplate('promise', {
          ctx: context ? getTemplate('ctx.get', {
            path: quote(context)
          }) : ''
        }) + getTemplate('promise.then', {
          ctx: context ? 'ctx' : '',
          code: code
        });
      }
    } else if (context) {
      code = getTemplate('ctx.set', {
        path: quote(context),
        code: code
      }) + ';';
    }

    return {
      async: async,
      code: code
    };

  };
}


function buildSegmentConditional(iterator, options, count) {
  var segment = iterator.current;
  var async = false;
  var initBuffer = [];
  var debug;
  var code;
  var subIterator = iterator.consume(matchEndSegmentStrategy(segment));
  var chunk = build(subIterator, options);
  var templateName = 'seg.conditional' + (count === 1 ? '' : segment.expression ? '.elseif' : '.else');

  // skip closing segment....
  //if (iterator.current && iterator.current.closing && iterator.current.type === segment.type) {
  //  iterator.next;
  //}

  if (count === 1) {
    debug = getDebugCode(segment, options, ';');
  }

  code = getTemplate(templateName, {
    expr: segment.expression && buildExpression(segment.expression, initBuffer),
    code: chunk.code
  });

  return wrapCodeSegment(async || chunk.async, debug, code, initBuffer);
}

function buildSegmentIterator(iterator, options, count) {
  var segment = iterator.current;
  var initBuffer = [];
  var debug;
  var code;
  var subIterator;
  var chunk;

  if (count > 1) {
    throw CompilerException('Too many segments for iterator', segment);
  }

  subIterator = iterator.consume(matchEndSegmentStrategy(segment));
  chunk = build(subIterator, options);

  debug = getDebugCode(segment, options, ';');
  code = 'return ' + getTemplate('seg.iterator', {
    'expr': buildExpression(segment.expression, initBuffer),
    'code': chunk.code
  });

  return wrapCodeSegment(true, debug, code, initBuffer);
}

function buildSegmentCustom(iterator, options) {
  var segment = iterator.current;
  var initBuffer = [];
  var expression = buildExpression(iterator.current.expression, initBuffer);
  var segments = [];
  var debug;
  var code;
  var subIterator;
  var chunk;

  while (!iterator.current.closing) {
    subIterator = iterator.consume(matchEndSegmentStrategy(segment));
    chunk = build(subIterator, options);

    segments.push(getTemplate('fn', {
      ctx: 'ctx',
      code: chunk.code
    }));
  }

  debug = getDebugCode(segment, options, ';');
  code = 'return ' + getTemplate('seg.custom', {
    path: expression,
    seglist: '[' + segments.join(',') + ']',
    modifier: segment.modifiers && segment.modifiers.length ? getTemplate('fn', {
      ctx: 'str',
      code: 'return ' + wrapModifiers(segment.modifiers, 'str', true)
    }) : 'null'
  });

  return wrapCodeSegment(true, debug, code, initBuffer);
}

function buildSegmentNamedDeclare(iterator, options, count) {
  var segment = iterator.current;
  var initBuffer = [];
  var async = false;
  var debug;
  var code;
  var subIterator;
  var chunk;

  if (count > 1) {
    throw CompilerException('Too many segments for named segment declare', segment);
  }

  subIterator = iterator.consume(matchEndSegmentStrategy(segment));
  chunk = build(subIterator, options);

  debug = getDebugCode(segment, options, ';');
  code = getTemplate('seg.named.declare', {
    'expr': buildExpression(segment.expression, initBuffer),
    'code': chunk.code
  }) + ';';

  if (initBuffer.length) {
    async = true;
    code = 'return ' + getTemplate('promise.all', {
      'collection': initBuffer.join(',')
    }) + getTemplate('promise.then', {
      'ctx': 'v',
      'code': code
    });
  }

  return wrapCodeSegment(async, debug, code, initBuffer);
}

function buildSegmentNamedRender(iterator, options, count) {
  var segment = iterator.current;
  var initBuffer = [];
  var debug;
  var code;

  if (count > 1 || !segment.closing) {
    throw CompilerException('Too many segments for named segment', segment);
  }

  debug = getDebugCode(segment, options, ';');
  code = 'return ' + getTemplate('seg.named.render', {
    'expr': buildExpression(segment.expression, initBuffer),
    'modifier': segment.modifiers && segment.modifiers.length ? getTemplate('fn', {
      ctx: 'str',
      code: 'return ' + wrapModifiers(segment.modifiers, 'str', true)
    }) : 'null'
  }) + ';';

  return wrapCodeSegment(true, debug, code, initBuffer);
}

function buildSegmentPartial(iterator, options, count) {
  var segment = iterator.current;
  var initBuffer = [];
  var debug;
  var code;

  if (count > 1 || !segment.closing) {
    throw CompilerException('Too many segments for partial', segment);
  }

  debug = getDebugCode(segment, options, ';');
  code = 'return ' + getTemplate('seg.partial', {
    'expr': buildExpression(segment.expression, initBuffer),
    'modifier': segment.modifiers && segment.modifiers.length ? getTemplate('fn', {
      ctx: 'str',
      code: 'return ' + wrapModifiers(segment.modifiers, 'str', true)
    }) : 'null'
  }) + ';';

  return wrapCodeSegment(true, debug, code, initBuffer);
}



function matchEndSegmentStrategy(segment) {
  var depth = 1;

  return function (seg) {
    if (seg.type === segment.type) {
      if (seg.closing) {
        --depth;
      } else if (seg.next) {
        if (depth <= 1) {
          depth = 0;
        }
      } else {
        ++depth;
      }
    }

    return depth <= 0;
  };
}



function wrapCodeSegment(async, debug, code, initBuffer) {
  if (initBuffer.length) {
    async = true;
    code = 'return '  +getTemplate('promise', {
      ctx: '[]'
    }) + initBuffer.map(function (buffer) {
      return getTemplate('promise.then', {
        ctx: 'v',
        code: 'return ' + getTemplate('promise', {
          ctx: buffer
        }) + getTemplate('promise.then', {
          ctx: 'r',
          code: 'return v.push(r), v;'
        }) + ';'
      });
    }).join('') + getTemplate('promise.then', {
      ctx: 'v',
      code: code
    });
  }

  return {
    async: async,
    code: (debug || '') + code
  };
}



function buildExpression(expression, initBuffer) {
  return expression.reduce(function (expr, elem) {
    switch (elem.type) {
      case 'context':
        var ctx = getTemplate('ctx.data', { path: quote(elem.value.path) });

        if (elem.value.props) {
          ctx = ctx + '.' + elem.value.props;
        }

        if (elem.value.args) {
          initBuffer.push(ctx + '(' + elem.value.args.map(function (arg) {
            return buildExpression(arg, initBuffer);
          }).join(',') + ')');

          ctx = 'v[' + (initBuffer.length - 1) + ']';
        }

        return expr + ctx;
      case 'string':
        return expr + quote(elem.value);
      case 'parenOpen':
        return expr + '(';
      case 'parenClose':
        return expr + ')';
      case 'negate':
        var negate = elem.value;

        // trim unnecessary characters
        while (negate.length > 2) {
          negate = negate.replace('!!!', '!');
        }

        return expr + negate;
      default:
        return expr + elem.value;
    }
  }, '');
}



function wrapModifiers(modifiers, value, isValueString, initBuffer) {
  if (modifiers && modifiers.length) {
    return modifiers.reduce(function (value, modifier) {
      var modifierArgs = [value].concat(modifier.args.map(function (arg) {
        return buildExpression(arg, initBuffer);
      })).join(',');

      return VAR_ENGINE + '.modifier(' + quote(modifier.name) + ',' + modifierArgs + ')';
    }, value);
  } else if (isValueString) {
    return value;
  } else {
    return 'String(' + value + ')';
  }
}



function quote(s) {
  /*
   * ECMA-262, 5th ed., 7.8.4: All characters may appear literally in a
   * string literal except for the closing quote character, backslash,
   * carriage return, line separator, paragraph separator, and line feed.
   * Any character may appear in the form of an escape sequence.
   *
   * For portability, we also escape all control and non-ASCII
   * characters. Note that "\0" and "\v" escape sequences are not used
   * because JSHint does not like the first and IE the second.
   */
  return '"' + (s || '')
    .replace(/\\/g, '\\\\')  // backslash
    .replace(/"/g, '\\"')    // closing quote character
    .replace(/\x08/g, '\\b') // backspace
    .replace(/\t/g, '\\t')   // horizontal tab
    .replace(/\n/g, '\\n')   // line feed
    .replace(/\f/g, '\\f')   // form feed
    .replace(/\r/g, '\\r')   // carriage return
    //.replace(/[\x00-\x07\x0B\x0E-\x1F\x80-\uFFFF]/g, escape)  // this cause problems with accented chars
    + '"'
  ;
}



function checkForSuspiciousSegments(str, segment) {
  var match = str.match(SUSPICIOUS_SEGMENT_PATTERN);

  if (match) {
    throw CompilerException('Suspicious segment found : ' + match, segment);
  }
}
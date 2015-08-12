
const SUSPICIOUS_SEGMENT_PATTERN = /\{.*?\{.+?\}.*?\}/;

const VAR_ENGINE = 'engine';
const VAR_CTX = 'ctx';
const VAR_DEBUG_INFO = 'debug';

const NEWLINE = require('os').EOL;

const BUILDER_MAP = {
  'text':         buildOutputSegment,
  'output':       buildOutputSegment,
  'conditional':  buildSegment('conditional', buildSegmentConditional),
  'switch':       buildSegment('switch', buildSegmentSwitch),
  'iterator':     buildSegment('iterator', buildSegmentIterator),
  'custom':       buildSegment('custom', buildSegmentCustom),
  'namedDeclare': buildSegment('namedDeclare', buildSegmentNamedDeclare),
  'namedRender':  buildSegment('namedRender', buildSegmentNamedRender),
  'partial':      buildSegment('partial', buildSegmentPartial)
}


const TEMPLATE_TOKEN = /__([^_]+)__/g;
const TEMPLATE_TPL = /_=([^=]+)=_/g;
const TEMPLATES = {
  'template': 'function(__ENGINE__,__CTX__){_=TEMPLATE.DEBUG.INIT=_;return _=PROMISE=___THEN__;}',
  'template.debug.init': 'var __DEBUG.INFO__',
  'template.debug': '__DEBUG.INFO__={column:__COLUMN__,line:__LINE__,offset:__OFFSET__}',

  'promise': 'Promise.resolve(__CTX__)',
  'promise.then': '.then(_=FN=_)',
  'promise.return': '.then(function(){return __CTX__;})',

  'fn': 'function(__CTX__){__CODE__}',

  'ctx.get': 'ctx.get(__PATH__)',
  'ctx.data': '_=CTX.GET=_.data',
  'ctx.set': '(_=FN=_)(_=CTX.GET=_)',

  'modifiers.push': '__ENGINE__.pushModifiers(__MODIFIERS__)',
  'modifiers.pop': '__ENGINE__.popModifiers()',

  // output
  'out': 'engine.out(__VALUE__)',

  // Segment: conditional
  'seg.conditional': 'if(__EXPR__){__CODE__}',
  'seg.conditional.else': '}else{',

  // Segment: switch
  'seg.switch': 'switch(__EXPR__){__CASES__}',
  'seg.switch.case': 'case __VALUE__:__CODE__',

  // Segment: iterator
  'seg.iterator': 'engine.iterator(__EXPR__,__CTX__,_=FN=_)',

  // Segment: named
  'seg.named.declare': 'engine.setSegment(__EXPR__,_=FN=_,__CTX__)',
  'seg.named.render': 'engine.getSegment(__EXPR__)(__CTX__)',

  // Segment: custom
  'seg.custom': 'engine.callCustom(__EXPR__,__CTX__,__SEGMENTS__,__OUTPUT__)',

  // Segment: partial
  'seg.partial': 'engine.render(__EXPR__,__CTX__)'

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
  var iterator = segmentIterator(segments || []);
  var code;
  var template;

  options = options || {};

  Object.keys(globalOptions).forEach(function (key) {
    if (!(key in options)) {
      options[key] = globalOptions[key];
    }
  });

  try {
    code = build(iterator, options);

    // if we have some code, wrap it inside "then"
    template = getTemplate('template', {
      'then': code && getTemplate('promise.then', {
        code: code
      }) || ''
    });

    if (options.beautify) {
      template = require('js-beautify')(template, options.beautify);
    }

    //console.log("---", template);

    return vm.runInNewContext('f=' + template, options.templateGlobals);
  } catch (e) {
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
  var len = segments.length;

  detph = depth || 0;
  mods = mods || []

  return {
    get modifiers() {
      return mods;
    },
    get depth() {
      return depth;
    },
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
    return getTemplate(name.toLowerCase(), tokens);
  }).replace(TEMPLATE_TOKEN, function (match, token) {
    token = token.toLowerCase();
    return String(tokens[token]);
  });
}


function getDebugCode(segment, options) {
  if (options.debug && segment) {
    return getTemplate('template.debug', {
      'column': isNaN(segment.column) ? NaN : segment.column,
      'line': isNaN(segment.line) ? NaN : segment.line,
      'offset': isNaN(segment.offset) ? NaN : segment.offset
    }) + ';';
  }
  return '';
}


function build(iterator, options) {
  var builder;
  var segment;
  var code = '';
  var async = false;

  while (iterator.current) {
    builder = BUILDER_MAP[iterator.current.type];

    if (builder) {
      segment = builder(iterator, options);

      if (async) {
        // TODO: check if this is useful now. For now, this is not a critical optimization
        if (!segment.async) {
          segment.code = segment.code + ';return ctx;';
        }

        code = code + getTemplate('promise.then', {
          'ctx': '',
          'code': segment.code
        });
      } else {
        if (code) {
          code = code + ';';
        }
        code = code + segment.code;
      }

      if (segment.async) {
        async = true;
      }

    } else {
      throw CompilerException('Invalid segment', iterator.current);
    }
  }

  code = code + ';';

  if (async && iterator.depth > 0) {
    code = code + getTemplate('promise.then', {
      'ctx': '',
      'code': 'return ctx;'
    });
  }

  return code;
}




function buildOutputSegment(iterator, options) {
  var output = [];
  var previousText = false;
  var context;
  var contextSeg;
  var expr;
  var code = '';

  while (iterator.current && (iterator.current.type === 'text' || iterator.current.type === 'output')) {

    if (iterator.current.type === 'text') {
      // remove string concatenation
      if (previousText) {
        output[output.length - 1] = output[output.length - 1].substr(0, output[output.length - 1].length - 1) + quote(String(iterator.current.content)).substr(1);
      } else {
        output.push(quote(String(iterator.current.content)));
      }

      if (!options.ignoreSuspiciousSegments) {
        checkForSuspiciousSegments( output[output.length - 1] );
      }

      previousText = true;
    } else /*if (iterator.current.type === 'output')*/ {

      //console.log("***", iterator.current);

      if (context !== undefined && context !== iterator.current.content.context && output.length) {
        // we are changing context, so dump output first
        if (context) {
          code += getTemplate('ctx.set', {
            path: quote(context),
            code: getDebugCode(contextSeg, options) + getTemplate('out', {
              'value': wrapModifiers(iterator.modifiers, output.join('+'), true)
            }) + ';'
          }) + ';';
        } else {
          code += getDebugCode(contextSeg, options) + getTemplate('out', {
            'value': wrapModifiers(iterator.modifiers, output.join('+'), true)
          }) + ';'
        }
        output = [];
      }
      context = iterator.current.content.context;

      contextSeg = iterator.current;

      output.push(wrapModifiers(iterator.current.modifiers, buildExpression(iterator.current.content.expression)));
      previousText = false;
    }

    iterator.next;
  }

  if (output.length) {
    if (context) {
      code += getTemplate('ctx.set', {
        path: quote(context),
        code: getDebugCode(contextSeg, options) + getTemplate('out', {
          'value': wrapModifiers(iterator.modifiers, output.join('+'), true)
        }) + ';'
      })
    } else {
      code += getDebugCode(contextSeg, options) + getTemplate('out', {
        'value': wrapModifiers(iterator.modifiers, output.join('+'), true)
      })
    }
  }

  return {
    async: false,
    code: code
  };
}




function buildSegment(segType, segmentBuilder) {
  return function buildSegmentWrapper(iterator, options) {
    var initialSegment = iterator.current;
    var testExpr = buildExpression(initialSegment.content.expression);
    var segments = [];
    var subIterator;
    var buildResult;
    var templateOptions;

    while (iterator.current && iterator.current.type === segType) {
      if (iterator.current.closing) {
        iterator.next;  // skipping closing segment
        break; // breaking out of loop now (avoid overlapping on adjacent same segment types)
      } else {
        subIterator = iterator.consume(matchEndSegmentStrategy(iterator.current));

        segments.push(build(subIterator, options));

        if (iterator.current && iterator.current.closing) {
          iterator.next;  // skipping closing segment
        }
      }
    }

    buildResult = segmentBuilder(initialSegment, testExpr, segments, initialSegment.modifiers);

    if (buildResult.code) {
      if (initialSegment.content.context && !buildResult.contextHandled) {
        if (buildResult.async && buildResult.code.substr(0, 6) !== 'return') {
          buildResult.code = 'return ' + buildResult.code;
        }

        buildResult.code = getTemplate('ctx.set', {
          'path': quote(initialSegment.content.context),
          'code': buildResult.code
        });
      }

      if (buildResult.async && buildResult.code.substr(0, 6) !== 'return') {
        buildResult.code = 'return ' + buildResult.code;
      }

      buildResult.code = getDebugCode(initialSegment, options) + buildResult.code;
    }

    return buildResult;
  };
}


function buildSegmentConditional(segment, testExpr, segments) {
  var code;

  if (segments.length > 2) {
    throw CompilerException('Too many segments for conditional', segment);
  }

  code = segments.map(function (code) {
    return code;
  }).join(getTemplate('seg.conditional.else'));

  return {
    async: false,
    code: code && getTemplate('seg.conditional', {
      'expr': testExpr,
      'code': code
    }) || ''
  };
}

function buildSegmentSwitch(segment, testExpr, segments) {
  // Note : even if the switch has only a single case, do not ignore it as the segment's
  //        expression may invoke a property, or method, or function that is required to
  //        be executed in the template. Shortcutting this could cause undefined behaviours
  //        within the template.
  var defaultSeg = segments.length - 1;

  return {
    async: false,
    code: getTemplate('seg.switch', {
      'expr': testExpr,
      'cases': segments.map(function (seg, segIndex) {
        if (segIndex >= defaultSeg) {
          segIndex = String(segIndex) + ':default';
        }

        return getTemplate('seg.switch.case', {
          'value': segIndex,
          'code': seg + ';break;'
        });
      }).join('')
    })
  };
}

function buildSegmentIterator(segment, testExpr, segments) {
  if (segments.length > 1) {
    throw CompilerException('Too many segments for iterator', segment);
  }

  return {
    async: true,
    code: 'return ' + getTemplate('seg.iterator', {
      'expr': testExpr,
      'code': segments.pop()
    })
  };
}

function buildSegmentCustom(segment, testExpr, segments, modifiers) {
  return {
    async: true,
    code: getTemplate('seg.custom', {
      'expr': testExpr,
      'segments': '[' + segments.map(function (seg, segIndex) {
        return getTemplate('fn', {
          'code': seg
        });
      }).join(',') + ']',
      'output': getTemplate('fn', {
        'ctx': 'str',
        'code': 'return ' + wrapModifiers(modifiers, 'str', true) + ';'
      })
    })
  };
}

function buildSegmentNamedDeclare(segment, testExpr, segments) {
  var seg;
  var templateOptions;

  if (segments.length > 1) {
    throw CompilerException('Too many segments for named segment', segment);
  }

  seg = segments.pop();

  return {
    async: false,
    code: getTemplate('seg.named.declare', {
      'expr': testExpr,
      'code': seg
    })
  };
}

function buildSegmentNamedRender(segment, testExpr, segments) {
  if (segments.length) {
    throw CompilerException('Too many segments for named segment', segment);
  }

  return {
    async: true,
    code: getTemplate('seg.named.render', {
      'expr': testExpr
    })
  };
}

function buildSegmentPartial(segment, testExpr, segments) {
  if (segments.length) {
    throw CompilerException('Too many segments for partial', segment);
  }

  return {
    async: true,
    code: 'return ' + getTemplate('seg.partial', {
      'expr': testExpr
    })
  };
}



function matchEndSegmentStrategy(segment) {
  var depth = 1;

  return function (seg) {
    if (seg.type === segment.type) {
      if (seg.closing || seg.next) {
        --depth;
      } else {
        ++depth;
      }
    }

    return depth <= 0;
  };
}



function buildExpression(expression) {
  return expression.reduce(function (expr, elem) {
    switch (elem.type) {
      case 'context':
        var ctx = getTemplate('ctx.data', { path: quote(elem.value.context) });

        if (elem.value.props) {
          ctx = ctx + '.' + elem.value.props;
        }

        if (elem.value.args) {
          ctx = ctx + '(' + elem.value.args.map(function (arg) {
            return buildExpression(arg);
          }).join(',') + ')';
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



function wrapModifiers(modifiers, value, isValueString) {
  if (modifiers && modifiers.length) {
    return modifiers.reduce(function (value, modifier) {
      var modifierArgs = [value].concat(modifier.args.map(buildExpression)).join(',');

      return VAR_ENGINE + '.modifiers[' + quote(modifier.name) + '](' + modifierArgs + ')';
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
  return '"' + s
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



function checkForSuspiciousSegments(str) {
  var match = str.match(SUSPICIOUS_SEGMENT_PATTERN);

  if (match) {
    throw CompilerException('Suspicious segment found : ' + match);
  }
}
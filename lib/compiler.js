

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
const TEMPLATES = {
  'template': 'function(engine,ctx){var c=ctx,ptr;return Promise.resolve(ctx).then(function(c){__CODE__}).catch(function(err){engine.err(err,ptr);}).then(function(){});}',
  'template.debug': 'ptr={column:__COLUMN__,line:__LINE__,offset:__OFFSET__}',

  'promise': 'Promise.resolve(__CTX__).then(function(c,ctx){__CODE__}).then(function(){return c;})',
  'promise.then': '}).then(function(c,ctx){',
  'promise.empty': 'Promise.resolve(__CTX__)',

  'fn': 'function(c,ctx){__CODE__}',

  'ctx': 'ctx=c',
  'ctx.set': 'ctx=c.getContext(__PATH__)',
  'ctx.get': 'ctx.getContext(__PATH__).data',

  // output
  'out': 'engine.out(__VALUE__)',

  // Segment: conditional
  'seg.conditional': 'if(__EXPR__){__CODE__}',
  'seg.conditional.else': 'else{__CODE__}',

  // Segment: switch
  'seg.switch': 'switch(__EXPR__){__CASES__}',
  'seg.switch.case': 'case __VALUE__:__CODE__',

  // Segment: iterator
  'seg.iterator': 'engine.iterator(__EXPR__,__CTX__,__FN__).then(function(){return c;})',

  // Segment: named
  'seg.named.declare': 'engine.setSegment(__EXPR__,__FN__)',
  'seg.named.render': 'engine.getSegment(__EXPR__)(__CTX__).then(function(){return c;})',

  // Segment: custom
  'seg.custom': 'engine.callCustom(__EXPR__,__CTX__,__SEGMENTS__).then(function(){return c;})',

  // Segment: partial
  'seg.partial': 'engine.render(__EXPR__,__CTX__).then(function(){return c;})'

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


var errorFactory = require('error-factory');

var CompilerException = errorFactory('coefficient.CompilerException', ['message', 'segment']);

var Compiler = module.exports;

var debug = false;
var beautify;

/**
static API
*/
Compiler.compile = compile;

/**
Compiler flags
*/
// Run JS Beautify on the template function
Object.defineProperties(Compiler, {
 'BEAUTIFY': {
    configurable: false,
    enumerable: true,
    get: function () {
      return !!beautify;
    },
    set: function (val) {
      if (val) {
        beautify = require('js-beautify');
      } else {
        beautify = undefined;
      }
    }
  },
  'DEBUG': {
    configurable: false,
    enumerable: true,
    get: function () {
      return debug;
    },
    set: function (val) {
      debug = val;
    }
  }
});


Object.freeze(Compiler);



function compile(segments) {
  var iterator = segmentIterator(segments || []);
  var template;

  try {
    template = getTemplate('template', {
      'code': build(iterator).filter(String).join('')
    });

    if (beautify) {
      template = beautify(template, BEAUTIFY_OPTIONS);
    }

    console.log("---", template);

    return new Function('return ' + template)();
  } catch (e) {
    if (debug) {
      throw e;
    } else {
      // obfuscate original error
      throw CompilerException('Malformed parsed data');
    }
  }
}


function segmentIterator(segments) {
  var index = 0;
  var len = segments.length;
  return {
    get current() {
      return segments[index];
    },
    //get peek() {
    //  return segments[index + 1];
    //},
    get hasNext() {
      return index < len;
    },
    get next() {
      return segments[++index];
    },
    consume: function (cb) {
      var startIndex = ++index;

      while (segments[index] && !cb(segments[index])) {
        ++index;
      }

      return segmentIterator(segments.slice(startIndex, index));
    }
  };
}

function getTemplate(name, tokens) {
  tokens = tokens || {};

  if (!('ctx' in tokens)) {
    tokens['ctx'] = 'c';
  }
  if (!('return' in tokens)) {
    tokens['return'] = 'return c;';
  }

  return TEMPLATES[name].replace(TEMPLATE_TOKEN, function (match, token) {
    return tokens[token.toLowerCase()];
  });
}


function getDebugCode(segment) {
  if (debug) {
    return getTemplate('template.debug', {
      'column': isNaN(segment.column) ? NaN : segment.column,
      'line': isNaN(segment.line) ? NaN : segment.line,
      'offset': isNaN(segment.offset) ? NaN : segment.offset
    }) + ';';
  }
  return '';
}


function build(iterator) {
  var builder;
  var compiled = [];

  while (iterator.current) {
    builder = BUILDER_MAP[iterator.current.type];

    if (builder) {
      compiled.push(builder(iterator));
    } else {
      throw CompilerException('Invalid segment', iterator.current);
    }
  }

  return compiled;
}




function buildOutputSegment(iterator) {
  var segmentStart = iterator.current;
  var output = [];
  var previousText = false;
  var context;
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
      previousText = true;
    } else /*if (iterator.current.type === 'output')*/ {

      //console.log("***", iterator.current);

      if (iterator.current.content.context) {
        if (context && context !== iterator.current.content.context && output.length) {
          // we are changing context, so dump output first
          code += getTemplate('out', {
            'value': output.join('+')
          }) + ';';
          output = [];
        }
        context = iterator.current.content.context;

        // insert change context
        code += getTemplate('ctx.set', {
          'path': quote(iterator.current.content.context)
        }) + ';' + getDebugCode(iterator.current);
      } else if (context === undefined) {
        // insert context before output
        context = '.';
        code += getTemplate('ctx') + ';' + getDebugCode(iterator.current);
      }

      output.push('String(' + buildExpression(iterator.current.content.expression) + ')');
      previousText = false;
    }

    iterator.next;
  }

  if (!code) {
    code = getDebugCode(segmentStart);
  }

  if (output.length) {
    code += getTemplate('out', {
      'value': output.join('+')
    }) + ';';
  }

  return code
}




function buildSegment(segType, segmentBuilder) {
  return function buildSegmentWrapper(iterator) {
    var initialSegment = iterator.current;
    var testExpr = buildExpression(initialSegment.expression);
    var segments = [];
    var subIterator;
    var code = getDebugCode(initialSegment);
    var buildResult;
    var templateOptions;

    if (initialSegment.content.context) {
      code += getTemplate('ctx.set', {
        'path': quote(initialSegment.content.context)
      }) + ';';
    } else {
      code += getTemplate('ctx') + ';';
    }

    while (iterator.current && iterator.current.type === segType) {
      if (iterator.current.closing) {
        iterator.next;  // skipping closing segment
        break; // breaking out of loop now (avoid overlapping on adjacent same segment types)
      } else {
        subIterator = iterator.consume(matchEndSegmentStrategy(iterator.current));
        segments.push(build(subIterator));
      }
    }

    buildResult = segmentBuilder(initialSegment, testExpr, segments);

    templateOptions = {
      'code': code + buildResult.code
    };

    if (!buildResult.requiresReturn) {
      templateOptions['return'] = '';
    }

    return getTemplate('fn', templateOptions);
  };
}


function buildSegmentConditional(segment, testExpr, segments) {
  if (segments.length > 2) {
    throw CompilerException('Too many segments for conditional', segment);
  }

  return {
    requiresReturn: true,
    code: getTemplate('seg.conditional', {
      'expr': testExpr,
      'code': segments.map(function (seg, segIndex) {
        var code = '';

        seg = seg.filter(String);

        if (seg.length) {
          code += 'return ' + getTemplate('promise', {
            'ctx': 'ctx',
            'fn': seg.join(getTemplate('promise.then'))
          }) + ';';
        }

        return code;
      }).join(getTemplate('seg.conditional.else'))
    })
  };
}

function buildSegmentSwitch(segment, testExpr, segments) {
  // Note : even if the switch has only a single case, do not ignore it as the segment's
  //        expression may invoke a property, or method, or function that is required to
  //        be executed in the template. Shortcutting this could cause undefined behaviours
  //        within the template.
  return {
    requiresReturn: false,
    code: getTemplate('seg.switch', {
      'expr': testExpr,
      'cases': segments.map(function (seg, segIndex) {
        var code = '';

        seg = seg.filter(String);

        if (segIndex >= segments.length - 1) {
          code += 'default:';
        }

        if (seg.length) {
          code += 'return ' + getTemplate('promise', {
            'ctx': 'ctx',
            'fn': seg.join(getTemplate('promise.then'))
          }) + ';';
        } else {
          code += 'return c;';
        }

        return getTemplate('seg.switch.case', {
          'value': segIndex,
          'code': code
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
    requiresReturn: false,
    code: 'return ' + getTemplate('seg.iterator', {
      'expr': testExpr,
      'fn': segments.pop()
    }) + ';'
  };
}

function buildSegmentCustom(segment, testExpr, segments) {
  return {
    requiresReturn: true,
    code: getTemplate('seg.custom', {
      'expr': testExpr,
      'segments': '[' + segments.map(function (seg, segIndex) {
        var code;

        seg = seg.filter(String);

        if (seg.length) {
          code = getTemplate('promise', {
            'ctx': 'ctx',
            'fn': seg.join(getTemplate('promise.then'))
          });
        } else {
          code = getTemplate('promise.empty', {
            'ctx': 'ctx'
          }) + ';';
        }

        return getTemplate('fn', {
          'ctx': 'ctx',
          'return': '',
          'code': 'return ' + code + ';'
        });
      }).join(',') + ']'
    }) + ';'
  };
}

function buildSegmentNamedDeclare(segment, testExpr, segments) {
  var seg;
  var templateOptions;

  if (segments.length > 1) {
    throw CompilerException('Too many segments for named segment', segment);
  }

  seg = segments.pop();

  if (seg.length) {
    templateOptions = {
      'return': '',
      'code': 'return ' + getTemplate('promise', {
        'ctx': 'c',
        'fn': seg.join(getTemplate('promise.then'))
      }) + ';'
    };
  } else {
    templateOptions = {
      'code': ''
    };

  }

  return {
    requiresReturn: true,
    code: getTemplate('seg.named.declare', {
      'expr': testExpr,
      'fn': getTemplate('fn', templateOptions)
    }) + ';'
  };
}

function buildSegmentNamedRender(segment, testExpr, segments) {
  if (segments.length) {
    console.log("**** ", segments);
    throw CompilerException('Too many segments for named segment', segment);
  }

  return {
    requiresReturn: false,
    code: 'return ' + getTemplate('seg.named.render', {
      'expr': testExpr
    }) + ';'
  };
}

function buildSegmentPartial(segment, testExpr, segments) {
  if (segments.length) {
    throw CompilerException('Too many segments for partial', segment);
  }

  return {
    requiresReturn: false,
    code: 'return ' + getTemplate('seg.partial', {
      'ctx': 'ctx',
      'expr': testExpr
    }) + ';'
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
        var ctx = getTemplate('ctx.get', { path: quote(elem.value.context) });

        if (elem.value.args) {
          ctx = ctx + '(' + elem.value.args.map(function (arg) {
            return buildExpression(arg);
          }).join(',') + ')';
        }

        if (elem.value.props) {
          ctx = ctx + '.' + elem.value.props;
        }

        return expr + ctx;
      case 'string':
        return expr + quote(elem.value);
      case 'parenOpen':
        return expr + '(';
      case 'parenClose':
        return expr + ')';
      default:
        return expr + elem.value;
    }
  }, '');
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

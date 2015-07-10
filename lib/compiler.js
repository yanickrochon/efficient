

const NEWLINE = require('os').EOL;

const BUILDER_MAP = {
  'text':    buildOutputSegment,
  'output':  buildOutputSegment,
  'segment': buildSegment
};
const SEGMENT_BUILDER_MAP = {
  'conditional':  buildSegmentConditional,
  'switch':       buildSegmentSwitch,
  'iterator':     buildSegmentIterator,
  'custom':       buildSegmentCustom,
  'namedDeclare': buildSegmentNamedDeclare,
  'namedRender':  buildSegmentNamedRender,
  'partial':      buildSegmentPartial
}


const TEMPLATE_TOKEN = /__([^_]+)__/g;
const TEMPLATES = {
  'template': 'function(engine,ctx){var c=ctx;return __CODE__}',

  'promise': 'Promise.resolve(__CTX__).then(__FN__).then(function(){return c;});',
  'promise.then': ').then(',

  'fn': 'function(c,ctx){__CODE____RETURN__}',

  'ctx': 'ctx=c;',
  'ctx.set': 'ctx=c.getContext(__PATH__);',

  // output
  'out': 'engine.out(__VALUE__);',

  // Segment: conditional
  'seg.conditional': 'if(__EXPR__){__CODE__}',
  'seg.conditional.else': '}else{',

  // Segment: switch
  'seg.switch': 'switch(__EXPR__){__CASES__}',
  'seg.switch.case': 'case __VALUE__:__CODE__',

  // Segment: iterator
  'seg.iterator': 'engine.iterator(__EXPR__,__FN__).then(function(){return c;});'

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


var CompilerException = require('./exceptions').CompilerException;
var beautify;

var Compiler = module.exports;


/**
static API
*/
Compiler.compile = compile;

/**
Compiler flags
*/
// Run JS Beautify on the template function
Object.defineProperty(Compiler, 'BEAUTIFY', {
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
});


Object.freeze(Compiler);



function compile(segments) {
  var iterator = segmentIterator(segments);
  var compiled = build(iterator).filter(String);
  var promise = '';
  var template;

  if (compiled.length) {
    promise = getTemplate('promise', {
      'ctx': 'ctx',
      'fn': compiled.join(getTemplate('promise.then'))
    });
  }

  template = getTemplate('template', {
    'code': promise
  });

  if (beautify) {
    template = beautify(template, BEAUTIFY_OPTIONS);
  }

  return new Function('return ' + template)();
}


function segmentIterator(segments) {
  var index = 0;
  var len = segments.length;
  return {
    get current() {
      return segments[index];
    },
    get peek() {
      return segments[index + 1];
    },
    get hasNext() {
      return i < len;
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


function build(iterator) {
  var builder;
  var compiled = [];

  while (iterator.current) {
    builder = BUILDER_MAP[iterator.current.type];

    compiled.push(builder(iterator) || '');
  }

  return compiled;
}




function buildOutputSegment(iterator) {
  var output = [];
  var previousText = false;
  var context;
  var code = '';

  while (iterator.current && (iterator.current.type === 'text' || iterator.current.type === 'output')) {

    if (iterator.current.type === 'text') {
      // remove string concatenation
      if (previousText) {
        output[output.length - 1] = output[output.length - 1].substr(0, output[output.length - 1].length - 1) + quote(String(iterator.current.value)).substr(1);
      } else {
        output.push(quote(String(iterator.current.value)));
      }
      previousText = true;
    } else if (iterator.current.type === 'output') {
      if (iterator.current.value.context) {
        if (context && context !== iterator.current.value.context && output.length) {
          // we are changing context, so dump output first
          code += getTemplate('out', {
            'value': output.join('+')
          });
          output = [];
        }
        context = iterator.current.value.context;

        // insert change context
        code += getTemplate('ctx.set', {
          'path': quote(iterator.current.value.context)
        });
      } else if (context === undefined) {
        // insert context before output
        context = '.';
        code += getTemplate('ctx');
      }

      output.push('(' + buildExpression(iterator.current) + ')');
      previousText = false;
    }

    iterator.next;
  }

  if (output.length) {
    code += getTemplate('out', {
      'value': output.join('+')
    });
  }

  return getTemplate('fn', {
    'code': code
  });
}




function buildSegment(iterator) {
  var segType = iterator.current.value.type;
  var segmentBuilder = SEGMENT_BUILDER_MAP[iterator.current.value.type];
  var testExpr = buildExpression(iterator.current);
  var segments = [];
  var subIterator;
  var code;
  var buildResult;
  var templateOptions;

  if (iterator.current.value.context) {
    code = getTemplate('ctx.set', {
      'path': quote(iterator.current.value.context)
    });
  } else {
    code = getTemplate('ctx');
  }

  while (iterator.current && iterator.current.type === 'segment' && iterator.current.value.type === segType) {
    if (iterator.current.value.closing) {
      iterator.next;  // skipping closing segment
    } else {
      subIterator = iterator.consume(matchEndSegmentStrategy(iterator.current));
      segments.push(build(subIterator));
    }
  }

  buildResult = segmentBuilder(testExpr, segments);

  templateOptions = {
    'code': code + buildResult.code
  };

  if (!buildResult.requiresReturn) {
    templateOptions['return'] = '';
  }

  return getTemplate('fn', templateOptions);
}


function buildSegmentConditional(testExpr, segments) {
  if (segments.length > 2) {
    throw CompilerException('Too many segments for conditional');
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
          });
        }

        return code;
      }).join(getTemplate('seg.conditional.else'))
    })
  };
}

function buildSegmentSwitch(testExpr, segments) {
  return {
    requiresReturn: true,
    code: getTemplate('seg.switch', {
      'expr': testExpr,
      'cases': segments.map(function (seg, segIndex) {
        var code = '';
        var promise;

        seg = seg.filter(String);

        if (segIndex >= segments.length - 1) {
          code += 'default:';
        }

        if (seg.length) {
          promise = getTemplate('promise', {
            'ctx': 'ctx',
            'fn': seg.join(getTemplate('promise.then'))
          });

          code += 'return ' + promise;
        } else {
          code += 'break;';
        }

        return getTemplate('seg.switch.case', {
          'value': segIndex,
          'code': code
        });
      }).join('')
    })
  };
}

function buildSegmentIterator(testExpr, segments) {
  if (segments.length > 1) {
    throw CompilerException('Too many segments for iterator');
  }

  return {
    requiresReturn: false,
    code: 'return ' + getTemplate('seg.iterator', {
      'expr': testExpr,
      'fn': segments.pop()
    })
  };
}

function buildSegmentCustom(iterator, compiled) {
  iterator.next;
}

function buildSegmentNamedDeclare(iterator, compiled) {
  iterator.next;
}

function buildSegmentNamedRender(iterator, compiled) {
  iterator.next;
}

function buildSegmentPartial(iterator, compiled) {
  iterator.next;
}



function getFuncName(prefix, compiled) {
  var countKey = '_' + prefix + 'SegmentCount';

  if (!compiled[countKey]) {
    compiled[countKey] = 1;
  } else {
    ++compiled[countKey];
  }

  return prefix + compiled[countKey];
}



function matchEndSegmentStrategy(segment) {
  var depth = 1;

  return function (seg) {
    if (seg.type === segment.type && seg.value.type === segment.value.type) {
      if (seg.value.closing || seg.value.next) {
        --depth;
      } else {
        ++depth;
      }
    }

    return depth <= 0;
  };
}



function buildExpression(segment) {
  var content = segment.value.content;
  var args = [];
  var argIndex = 0;
  var valueStack = [];
  var left;
  var right;

  for (var i = 0, len = content.length; i < len; ++i) {
    switch (content[i].type) {
      case 'separator':
        if (valueStack.length) {
          args.push(valueStack.pop());
          valueStack = [];
        }
        ++argIndex;
        break;
      case 'negate':
        valueStack.push('!' + valueStack.pop());
        break;
      case 'operator':
        switch (content[i].value) {
          case '^':
          case '*':
          case '/':
          case '%':
          case '+':
          case '-':
          case '=':
          case '<':
          case '>':
          case '!=':
          case '<=':
          case '>=':
          case '||':
          case '&&':
            right = valueStack.pop();
            left = valueStack.pop();

            valueStack.push(left + content[i].value + right);
            break;
          default:
            throw CompilerException('Unknown operator ' + content[i].value + ' in expression', segment);
        }
        break;
      case 'reserved':
      case 'number':
      case 'context':
        valueStack.push(content[i].value);
        break;
      case 'string':
        valueStack.push(quote(content[i].value));
        break;
      default:
        throw CompilerException('Unknown segment type ' + content[i].type, segment);
    }
  }

  if (valueStack.length > 1) {
    throw CompilerException('Malformed expression', segment);
  } else if (valueStack.length) {
    args[argIndex] = valueStack.pop();
  }

  return args.filter(String).join(',');
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

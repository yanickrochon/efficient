

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


const TEMPLATE_TOKEN = /__(\w+)__/g;
const TEMPLATES = {
  'wrap': 'Promise.resolve(__CTX__).then(__FN__).then(function(){return ctx;});',
  'wrap.glue': ').then(',

  'fn': 'function(ctx){__CODE__return ctx;}',

  'ctx.declare': 'var c;',
  'ctx.set': 'c=ctx.getContext(__PATH__);',

  'print': 'print(__VALUE__);',


  // Segment: conditional
  'seg.conditional': 'if(__EXPR__){__CODE__}',
  'seg.conditional.else': 'else{__CODE__}',

  // Segment: switch
  'seg.switch': 'switch(__EXPR__){__CASES__}',
  'seg.switch.case': 'case __VALUE__:__CODE__'

};



var CompilerException = require('./exceptions').CompilerException;

var Compiler = module.exports;




/**
static API
*/
Compiler.compile = compile;

/**
Compiler flags
*/
// Run JS Beautify on the template function
Compiler.BEAUTIFY = false;



Object.freeze(Compiler);



function compile(segments) {
  var iterator = segmentIterator(segments);
  var compiled = build(iterator).filter(String);
  var promise = '';

  if (compiled.length) {
    promise = getTemplate('wrap', {
      'fn': compiled.join(getTemplate('wrap.glue'))
    });
  }

  return new Function('return function(ctx,print,modifier){return ' + promise + '}')();
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
    tokens['ctx'] = 'ctx';
  }

  return TEMPLATES[name].replace(TEMPLATE_TOKEN, function (match, token) {
    return tokens[token.toLowerCase()];
  });
}


/*function build(iterator) {
  var compiled = [];

  console.log(iterator.current);

  return getTemplate('fn', {
    'code': code || ''
  });
}

*/

function build(iterator) {
  var builder;
  var compiled = [];

  while (iterator.current) {
    builder = BUILDER_MAP[iterator.current.type];

    compiled.push(builder(iterator) || '');
  }

  return compiled;
}

 function buildSegment(iterator) {
   var builder = SEGMENT_BUILDER_MAP[iterator.current.value.type];

   return builder(iterator);
 }


function buildOutputSegment(iterator) {
  var output = [];
  var previousText = false;

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
      output.push(iterator.current.value.content[0].value);
      previousText = false;
    }

    iterator.next;
  }

  return getTemplate('fn', {
    'code': getTemplate('print', {
      'value': output.join('+')
    })
  });
}


function buildSegmentConditional(iterator, compiled) {
  //var testExpr = buildExpression(iterator.current);
  var segments = [];
  var subIterator;
  var compiled;

  while (iterator.current.type === 'segment' && iterator.current.value.type === 'conditional' && !iterator.current.value.closing) {
    subIterator = iterator.consume(matchEndSegmentStrategy(iterator.current));
    segments.push(build(subIterator));
  }

  if (segments.length) {
    if (segments.length > 2) {
      throw CompilerException('Too many segments for conditional');
    }

    //fnName = getFuncName('c', compiled);

    //body = 'var r;';
    //     + 'if(' + testExpr + '){'
    //     +   'r=' + segments[0] + '(c);'
    //     + '}';

    //if (segments.length === 2) {
    //  body = body + ' else {'
    //       +   'r=' + segments[1] + '(c);'
    //       + '}';
    //}

    //body = body + 'return r instanceof Promise && r.then(function(){return c;}) || c;';

    //compiled.push( 'function ' + fnName + '(ctx){' + body + '}');
  }

  return compiled;
}

function buildSegmentSwitch(iterator, compiled) {
  var testExpr = buildExpression(iterator.current);
  var segments = [];
  var subIterator;

  //console.log("*** SWITCH EXPR", testExpr);

  while (iterator.current && iterator.current.type === 'segment' && iterator.current.value.type === 'switch') {
    if (iterator.current.value.closing) {
      iterator.next;  // skipping closing segment
    } else {
      subIterator = iterator.consume(matchEndSegmentStrategy(iterator.current));
      segments.push(build(subIterator));
    }
  }

  return getTemplate('fn', {
    'code': getTemplate('seg.switch', {
      'expr': testExpr,
      'cases': segments.map(function (seg, segIndex) {
        var code = '';
        var promise;

        seg = seg.filter(String);

        if (segIndex >= segments.length - 1) {
          code += 'default:';
        }

        if (seg.length) {
          promise = getTemplate('wrap', {
            'fn': seg.join(getTemplate('wrap.glue'))
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
  });
}

function buildSegmentIterator(iterator, compiled) {
  iterator.next;
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
        args.push('');
        ++argIndex;
        break;
      case 'negate':
        left = valueStack.pop();

        valueStack.push(!left);
        break;
      case 'operator':
        right = valueStack.pop();
        left = valueStack.pop();

        switch (content[i].value) {
          case '^':  valueStack.push(left ^ right); break;
          case '*':  valueStack.push(left * right); break;
          case '/':  valueStack.push(left / right); break;
          case '%':  valueStack.push(left % right); break;
          case '+':  valueStack.push(left + right); break;
          case '-':  valueStack.push(left - right); break;
          case '=':  valueStack.push(left === right); break;
          case '<':  valueStack.push(left < right); break;
          case '>':  valueStack.push(left > right); break;
          case '!=': valueStack.push(left !== right); break;
          case '<=': valueStack.push(left <= right); break;
          case '>=': valueStack.push(left >= right); break;
          case '||': valueStack.push(left || right); break;
          case '&&': valueStack.push(left && right); break;
          default:
            throw CompilerException('Unknown operator ' + content[i].value + ' in expression', segment);
        }
        break;
      case 'reserved':
      case 'number':
      case 'string':
      case 'context':
        valueStack.push(content[i].value);
        break;
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

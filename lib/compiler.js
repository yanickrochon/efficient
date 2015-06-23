
/**
Module dependencies and declarations
*/

const NEWLINE = require('os').EOL;

const PATTERN_CONTENT_SPLIT = /\s*(?:[&|]{1,2}|(?:!|=)?==?|[\(\)-+*\/%])\s*/;
const PATTERN_CONTENT_PRIMITIVE = /^(?:(\d+(\.\d+)?)|(?:"([^"]*\\")*[^"]*")|(true|false|null|undefined))$/;


var CompilerException = require('./exceptions').CompilerException;


var Compiler = module.exports;


/**
static API
*/
Compiler.compile = compile;

/**
Compiler flags
*/
Compiler.IGNORE_MISSING_INLINE_BLOCKS = true;
Compiler.TEMPLATE_MIN_LINE_WIDTH = false;



Object.freeze(Compiler);







function prepareContentFnBody(content) {
  var parts;
  var replacements = {};
  var fn;

  parts = content.split(PATTERN_CONTENT_SPLIT).filter(String).sort(function (a, b) {
    return b.length - a.length;
  });

  parts.forEach(function (part, index) {
    if (!PATTERN_CONTENT_PRIMITIVE.test(part)) {
      var token = '\0:' + index + ':\0';

      content = content.replace(new RegExp(part, 'g'), token);

      replacements[token] = [token, 'ctx.getContext(\'' + part + '\').data'];
    }
  });

  replacements['[^=]?=[^=]?'] = ['=', '==='];

  //console.log("*** REPLACEMENTS", replacements, ", CONTENT=", content);

  for (var i = 0, keys = Object.keys(replacements), len = keys.length; i < len; ++i) {
    content = content.replace(new RegExp(keys[i], 'g'), function (match) {
      //console.log("*** MATCH", match, replacements[keys[i]][0]);
      return match.replace(replacements[keys[i]][0], replacements[keys[i]][1]);
    });
  }

  //console.log("*** CONTENT", content);

  return 'return ' + content;
}


/**
Convert an object into a string. Iterate over all values and concatenate
them with new line characters, ignoring all empty strings.
*/
function stringify(obj, lineLength) {
  var str = '';
  var c = 0;

  if (Compiler.TEMPLATE_MIN_LINE_WIDTH === false) {
    lineLength = Infinity;
  } else {
    lineLength = lineLength || Compiler.TEMPLATE_MIN_LINE_WIDTH;
  }

  for (var key in obj) {
    if (obj[key]) {
      c = c + obj[key].length;
      //console.log("```" + obj[key] + "```");
      str = str + obj[key];
      if (c > lineLength && obj[key].length > (lineLength / 3)) {
        str = str + NEWLINE;
        c = 0;
      }
    }
  }
  return str;
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

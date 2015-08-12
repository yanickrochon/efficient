// http://pegjs.org/online
{
  var segStack = [];
  var segTableInfo = {
    'conditional':  { min: 1, max: 2 },
    'switch':       { min: 1, max: Infinity },
    'iterator':     { min: 1, max: 1 },
    'custom':       { min: 0, max: Infinity },
    'namedDeclare': { min: 1, max: 1 },
    'namedRender':  { min: 0, max: 0 },
    'partial':      { min: 0, max: 0 },
    '__ERR':      { min: 0, max: Infinity }
  };

  function enterSegment(type, selfClosing) {
    if (!segTableInfo[type]) {
      error('Invalid segment: ' + type);
    }
    segStack.push({
      type: type,
      count: selfClosing ? 0 : 1
    });

    if (selfClosing) {
      exitSegment(type);
    } else {
      checkSegmentCount(type);
    }
  }

  function nextSegment(type) {
    if (checkSegment(type) && checkSegmentCount(type)) {
      ++segStack[segStack.length - 1].count;
    }
  }

  function exitSegment(type) {
    if (checkSegment(type, true) && checkSegmentCount(type)) {
      return segStack.pop(), true;
    } else {
      throw error("Mismatch " + segStack[segStack.length - 1].type + " closing segment");
    }
  }

  function checkSegment(type, closing) {
    if (segStack.length) {
      return segStack[segStack.length - 1].type === type;
    } else {
      throw error("Unexpected " + type + " " + (closing ? "closing" : "next") + " segment");
    }
  }

  function checkSegmentCount(type) {
    var info = segTableInfo[type] || segTableInfo['__ERR'];
    var count = segStack[segStack.length - 1].count;

    if (info.min > count) {
      throw error("Missing content for " + type + " segment");
    } else if (info.max < count) {
      throw error("Too many contents for " + type + " segment");
    } else {
      return true;
    }
  }

  function cleanup() {
    if (segStack.length) {
      throw error("Missing " + segStack[segStack.length - 1].type + " closing segment");
    }
  }
}

start
  = seg:segment* { return cleanup(), seg; }


// Base classes
space
 = ' '
 / '\n'

digit
 = [0-9]

letter
 = [a-zA-Z]


// Base types
string
 = '"' str:( '\\"' / [^"] )+ '"' { return str.join(''); }
 / "'" str:( "\\'" / [^'] )+ "'" { return str.join(''); }

number
 = i:digit+ '.' d:digit+ { return parseFloat(i.join('') + '.' + d.join(''), 10); }
 / i:digit+ { return parseInt(i.join(''), 10); }
 / '+' n:number { return n; }
 / '-' n:number { return -n; }


reserved
 = 'undefined' { return undefined; }
 / 'null' { return null; }
 / 'true' { return true; }
 / 'false' { return false; }
 / 'NaN' { return NaN; }
 / sign:[+-]? 'Infinity' { return sign === '-' ? -Infinity : Infinity; }

operator
 = op:( '+' / '-' / '*' / '/'
      / '%' / '&' / '|' / '^'
      / '&&' / '||'
      / '=' { return '==='; }
      / '!=' { return '!=='; }
      / '<>' { return '!=='; }
      ) { return { type:'operator', value:op }; }

negate
 = neg:( '!'+ space* )+ { return { type:'negate', value:neg.map(function (n) { return n[0].join(''); }).join('') }; }

parenOpen
 = '(' { return { type:'parenOpen' }; }

parenClose
 = ')' { return { type:'parenClose' }; }

variable
 = left:letter right:(letter/digit)+ { return left + right.join(''); }
 / left:letter { return left; }

expression
 = open:parenOpen space* left:expression space* close:parenClose space* op:operator space* right:expression { return [open].concat(left).concat([close,op]).concat(right); }
 / open:parenOpen space* expr:expression space* close:parenClose { return [open].concat(expr).concat([close]); }
 / neg:negate val:value space* op:operator space* expr:expression { return [neg, val, op ].concat(expr); }
 / val:value space* op:operator space* expr:expression { return [ val, op ].concat(expr); }
 / neg:negate val:value { return [neg, val]; }
 / val:value { return [val]; }

expressionList
 = left:expression space* ',' space* right:expressionList { return [left].concat(right); }
 / expr:expression { return [expr]; }

arguments
 = '(' space* args:expressionList space* ')' { return args; }
 / '(' space* ')' { return []; }

func
 = name:variable space* args:arguments { return { name:name, args:args }; }

contextPath
 = parent:( '~' / p:'.'+ { return p.join(''); } )?
   path:( left:variable space? sep:'.'+ space? right:contextPath { return left + sep.join('') + right; }
        / variable ) { return (parent || '') + path; }
 / parent:( '~' / p:'.'+ { return p.join(''); } )

propertyPath
 = left:variable space? '.' space? right:propertyPath { return left + '.' + right; }
 / variable

context
 = path:contextPath ':' props:propertyPath space? args:arguments space? { return { context:path, args:args, props:props }; }
 / path:contextPath space? args:arguments { return { context:path, args:args }; }
 / path:contextPath ':' props:propertyPath { return { context:path, props:props }; }
 / path:contextPath { return { context:path }; }


// Compouned type
value
 = val:reserved { return { type:'reserved', value:val }; }
 / val:context { return { type:'context', value:val }; }
 / val:string { return { type:'string', value:val }; }
 / val:number { return { type:'number', value:val }; }


// Segments
segmentType
 = '?' { return 'conditional'; }
 / '*' { return 'switch'; }
 / '@' { return 'iterator'; }
 / '&' { return 'custom'; }
 / '#' { return 'namedDeclare'; }
 / '+' { return 'namedRender'; }
 / '>' { return 'partial'; }
 / invalidType:. { return invalidType; }

segment
 = seg:( seg:outputSegment
       / typedSegmentSelfClosing
       / typedSegmentOpen
       / typedSegmentNext
       / typedSegmentClose
       / textSegment ) { seg.offset = offset(); seg.line = line(); seg.column = column(); return seg; }

outputSegment
 = '{{' space* body:segmentBody space* '}' space* modifiers:modifiers? space* '}' { return { type:'output', content:body, modifiers:modifiers || [] }; }

typedSegmentOpen
 = '{' type:segmentType '{' space* body:segmentBody space* '}' space* modifiers:modifiers? space* '}' { return enterSegment(type), { type:type, content:body, modifiers:modifiers || [] }; }

typedSegmentSelfClosing
 = '{' type:segmentType '{' space* body:segmentBody space* '/' space* '}' space* modifiers:modifiers? space* '}' { return enterSegment(type, true), { type:type, content:body, modifiers:modifiers || [], closing:true }; }

typedSegmentNext
 = '{' type:segmentType '{' space* '|' space* '}' space* '}' { return nextSegment(type), { type:type, next:true }; }

typedSegmentClose
 = '{' type:segmentType '{' space* '/' space* '}' space* '}'  { return exitSegment(type), { type:type, closing:true }; }

textSegment
 = txt:( str:( [{][^{]* ) { return (str[0] || '') + str[1].join(''); }
       / str:[^{]+ { return str.join(''); } ) { return { type:'text', content:txt }; }


// Segment components
segmentBody
 = ctx:( context space* '\\' )? space* expr:expression space* { return { context:ctx && ctx[0].context, expression:expr }; }

modifiers
 = left:func '|' right:modifiers { return [{ name:left.name, args:left.args }].concat(right); }
 / left:variable '|' right:modifiers { return [{ name:left, args:[] }].concat(right); }
 / left:func { return [{ name:left.name, args:left.args }]; }
 / left:variable { return [{ name:left, args:[] }]; }



describe('Test Expression Parser', function () {

  var ExpressionParser = require('../../lib/expr-parser');




  it('should parse simple expressions', function () {
    var parser = new ExpressionParser();
    var tests = {
      '1': [1],
      '1 + 2': [1, 2, '+'],
      '1+2 * 3': [1, 2, 3, '*', '+'],
      '1 * 2 + 3': [1, 2, '*', 3, '+'],
      '1 * (2+3)': [1, 2, 3, '+', '*'],
      '!1': [1, '!'],
      '!!1 * !2 + !!!3': [1, '!', '!', 2, '!', '*', 3, '!', '!', '!', '+'],
      '!1 && !2': [1, '!', 2, '!', '&&'],
      '!(1 || 2)': [1, 2, '||', '!']
    };

    this.timeout(200);

    Object.keys(tests).forEach(function (expr) {
      var expected = tests[expr];
      var actual = parser.parse(expr);

      //console.log("*** RESULT", expected, actual);

      expected.should.eql(actual.map(function (token) { return token.value; }));
    });
  });

  it('should honour operator priorities', function () {
    var parser = new ExpressionParser();
    var tests = {
      '1 + 2 - 3': [1, 2, 3, '-', '+'],
      '1 - 2 + 3': [1, 2, 3, '+', '-'],

      '1 * 2 / 3': [1, 2, 3, '/', '*'],
      '1 / 2 * 3': [1, 2, 3, '*', '/'],

      '1 + 2 * 3': [1, 2, 3, '*', '+'],
      '1 * 2 + 3': [1, 2, '*', 3, '+'],

      '1 - 2 / 3': [1, 2, 3, '/', '-'],
      '1 / 2 - 3': [1, 2, '/', 3, '-'],
    };

    this.timeout(200);

    Object.keys(tests).forEach(function (expr) {
      var expected = tests[expr];
      var actual = parser.parse(expr);

      //console.log("*** RESULT", expected, actual);

      expected.should.eql(actual.map(function (token) { return token.value; }));
    });

  });


  it('should fail with unexpected tokens', function () {
    var parser = new ExpressionParser();
    var tests = {
      '1 + +': /^Unexpected token \+/,
      '(*1)': /^Unexpected token \*/
    };

    this.timeout(200);

    Object.keys(tests).forEach(function (expr) {
      var errorMessage = tests[expr];

      +function () { console.log(parser.parse(expr)); }.should.throw(errorMessage);
    });

  });


  it('should throw on missing parentheis', function () {
    var parser = new ExpressionParser();

    this.timeout(200);

    [
      '(1 + 2',
      '((1+2) + 3'
    ].forEach(function (expr) {
      +function () { parser.parse(expr); }.should.throw('Missing closing parenthesis');
    });

    [
      '1 + 2)',
      '(1 + 2))'
    ].forEach(function (expr) {
      +function () { parser.parse(expr); }.should.throw('Unexpected closing parenthesis');
    });

  });


  it('should parse contexts', function () {
    var parser = new ExpressionParser();
    var tests = {
      'a': ['a'],
      'a+b': ['a', 'b', '+']
    };

    this.timeout(200);

    Object.keys(tests).forEach(function (expr) {
      var expected = tests[expr];
      var actual = parser.parse(expr);

      //console.log("*** RESULT", expected, actual);

      expected.should.eql(actual.map(function (token) { return token.text; }));
    });

  });


  it('should parse context callbacks', function () {
    var parser = new ExpressionParser();
    var tests = {
      'a()': [ { text:'a', args:[] } ],
      'a(1) + b(2 + 3)': [ { text:'a', args:[1] }, { text:'b', args:[2, 3, '+'] }, '+' ],
      'a(1, 2 + 3)': [ { text:'a', args:[1, ',', 2, 3, '+'] }]
    };

    this.timeout(200);

    Object.keys(tests).forEach(function (expr) {
      var expected = tests[expr];
      var actual = parser.parse(expr);

      //console.log("*** RESULT", expected, actual);

      expected.should.eql(actual.map(function (token) {
        if (token.type === 'context') {
          return {
            text: token.text,
            args: token.arguments.map(function (arg) {
              return arg.value;
            })
          };
        } else {
          return token.text;
        }
      }));
    });

  });


  it('should fail with malformed context callback', function () {
    var parser = new ExpressionParser();

    this.timeout(200);

    [
      'a(1 + 2'
    ].forEach(function (expr) {
      +function () { parser.parse(expr); }.should.throw('Missing closing parenthesis');
    });

  });


  it('should parse reserved values', function () {
    var parser = new ExpressionParser();
    var tests = {
      'true': [true],
      'false': [false],
      'null': [null],
      'NaN': [NaN],
      'undefined': [undefined],
      'true * false': [true, false, '*']
    };

    this.timeout(200);

    Object.keys(tests).forEach(function (expr) {
      var expected = tests[expr];
      var actual = parser.parse(expr);

      //console.log("*** RESULT", expected, actual);

      expected.should.eql(actual.map(function (token) { return token.value; }));
    });

  });


  it('should throw syntax error', function () {
    var parser = new ExpressionParser();

    [
      '{{foo 3}}'
    ].forEach(function (expr) {
      (function () { parser.parse(expr); }).should.throw(/^Syntax error/);
    });

  });


});
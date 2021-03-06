'use strict';

describe('Test Parser', function () {

  const Parser = require('../../lib/parser');

  this.timeout(3000);

  it('should parse null or empty string', function () {
    const segments = Parser.parse('');

    segments.should.be.instanceof(Array).and.have.lengthOf(0);
  });

  it('should throw on invalid input', function () {

    this.timeout(200);

    [
      undefined, false, true, [], {}, function () {}, /./
    ].forEach(function (str) {
      +(function () { Parser.parse(str); }).should.throw();
    });

  });


  describe('Test text segment', function () {

    it('should parse single line text segment', function () {
      const str = 'Test string template';
      const segments = Parser.parse(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(1);

      segments[0].type.should.equal('text');
      segments[0].content.should.equal('Test string template');
      segments[0].offset.should.equal(0);
      segments[0].line.should.equal(1);
      segments[0].column.should.equal(1);

    });

  });



  describe('Test output segment', function () {

    describe('Test single', function () {

      it('should parse', function () {
        [
          '{{foo}}',
          '{{   foo  }}',
          '{{foo    }}',
          '{{   foo}}'
        ].map(function (str) {
          const segments = Parser.parse(str);

          //console.log(JSON.stringify(segments, null, 2));

          segments.should.have.lengthOf(1);

          segments[0].type.should.equal('output');
          segments[0].should.have.ownProperty('context').equal(null);
          segments[0].expression.should.eql([
            {
              "type": "context",
              "value": {
                "path": "foo"
              }
            }
          ]);
          segments[0].modifiers.should.have.lengthOf(0);
          segments[0].offset.should.equal(0);
          segments[0].line.should.equal(1);
          segments[0].column.should.equal(1);
        });
      });

      it('should parse with context', function () {
        [
          '{{bar\\foo}}'
        ].map(function (str) {
          const segments = Parser.parse(str);

          //console.log(JSON.stringify(segments, null, 2));

          segments.should.be.have.lengthOf(1);

          segments[0].type.should.equal('output');
          segments[0].context.should.equal('bar');
          segments[0].expression.should.eql([
            {
              "type": "context",
              "value": {
                "path": "foo"
              }
            }
          ]);
          segments[0].modifiers.should.have.lengthOf(0);
          segments[0].offset.should.equal(0);
          segments[0].line.should.equal(1);
          segments[0].column.should.equal(1);

        });
      });

      it('should parse with modifiers', function () {
        [
          '{{foo}a|b()|c("Hello")|d(bar)}'
        ].map(function (str) {
          const segments = Parser.parse(str);

          //console.log(JSON.stringify(segments, null, 2));

          segments.should.have.lengthOf(1);

          segments[0].type.should.equal('output');
          segments[0].should.have.ownProperty('context').equal(null);
          segments[0].expression.should.eql([
            {
              "type": "context",
              "value": {
                "path": "foo"
              }
            }
          ]);
          segments[0].modifiers.should.be.instanceof(Array).and.eql([
            {
              "name": "a",
              "args": []
            },
            {
              "name": "b",
              "args": []
            },
            {
              "name": "c",
              "args": [
                [
                  {
                    "type": "string",
                    "value": "Hello"
                  }
                ]
              ]
            },
            {
              "name": "d",
              "args": [
                [
                  {
                    "type": "context",
                    "value": {
                      "path": "bar"
                    }
                  }
                ]
              ]
            }
          ]);
          segments[0].offset.should.equal(0);
          segments[0].line.should.equal(1);
          segments[0].column.should.equal(1);

        });
      });

      it('should parse with context and modifiers', function () {
        [
          '{{bar \\ foo}a|b()|c("Hello")|d(bar)}'
        ].map(function (str) {
          const segments = Parser.parse(str);

          //console.log(JSON.stringify(segments, null, 2));

          segments.should.have.lengthOf(1);

          segments[0].type.should.equal('output');
          segments[0].should.have.ownProperty('context').equal('bar');
          segments[0].expression.should.eql([
            {
              "type": "context",
              "value": {
                "path": "foo"
              }
            }
          ]);
          segments[0].modifiers.should.be.instanceof(Array).and.eql([
            {
              "name": "a",
              "args": []
            },
            {
              "name": "b",
              "args": []
            },
            {
              "name": "c",
              "args": [
                [
                  {
                    "type": "string",
                    "value": "Hello"
                  }
                ]
              ]
            },
            {
              "name": "d",
              "args": [
                [
                  {
                    "type": "context",
                    "value": {
                      "path": "bar"
                    }
                  }
                ]
              ]
            }
          ]);
          segments[0].offset.should.equal(0);
          segments[0].line.should.equal(1);
          segments[0].column.should.equal(1);

        });
      });

      it('should parse with text', function () {
        [
          'Hello {{foo}}'
        ].map(function (str) {
          const segments = Parser.parse(str);

          segments.should.have.lengthOf(2);

          segments[0].type.should.equal('text');
          segments[0].content.should.equal('Hello ');
          segments[0].offset.should.equal(0);
          segments[0].line.should.equal(1);
          segments[0].column.should.equal(1);

          segments[1].type.should.equal('output');
          segments[1].should.have.ownProperty('context').equal(null);
          segments[1].expression.should.be.instanceof(Array).and.eql([{
            type: 'context',
            value: {
              path: 'foo'
            }
          }]);
          segments[1].modifiers.should.eql([]);
          segments[1].offset.should.equal(6);
          segments[1].line.should.equal(1);
          segments[1].column.should.equal(7);

        });
      });

    });

  });


  describe('Test conditional segments', function () {

    it('should parse single segment', function () {
      const str = '{?{true}}{?{/}}';
      const segments = Parser.parse(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(2);

      segments[0].type.should.equal('conditional');
      segments[0].should.have.ownProperty('context').equal(null);
      segments[0].expression.should.eql([
        {
          "type": "reserved",
          "value": true
        }
      ]);

      segments[1].type.should.equal('conditional');
      segments[1].closing.should.be.true;

    });


    it('should parse two segments', function () {
      const str = '{?{true}}{??{null}}{?{/}}';
      const segments = Parser.parse(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(3);

      segments[0].type.should.equal('conditional');
      segments[0].should.have.ownProperty('context').equal(null);
      segments[0].expression.should.eql([
        {
          "type": "reserved",
          "value": true
        }
      ]);

      segments[1].type.should.equal('conditional');
      segments[1].next.should.equal(true);
      segments[1].should.not.have.ownProperty('context');
      segments[1].expression.should.eql([
        {
          "type": "reserved",
          "value": null
        }
      ]);

      segments[2].type.should.equal('conditional');
      segments[2].closing.should.be.true;

    });

    it('should fail when no closing segment', function () {
      this.timeout(200);

      [
        '{?{true}}',
        '{?{true /}}'
      ].forEach(function (str) {
        +(function () { Parser.parse(str); }).should.throw();
      });
    });

    it('should fail when more than two segments', function () {
      this.timeout(200);

      [
        '{?{true}}{??{}}{??{}}{?{/}}',
        '{?{true}}{??{true}}{??{}}{??{}}{?{/}}'
      ].forEach(function (str) {
        +(function () { Parser.parse(str); }).should.throw();
      });
    });

  });


  describe('Test iterator segments', function () {

    it('should parse single segment', function () {
      const str = '{@{true}}{@{/}}';
      const segments = Parser.parse(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(2);

      segments[0].type.should.equal('iterator');
      segments[0].should.have.ownProperty('context').equal(null);
      segments[0].expression.should.eql([
        {
          "type": "reserved",
          "value": true
        }
      ]);

      segments[1].type.should.equal('iterator');
      segments[1].closing.should.be.true;

    });

    it('should fail when no closing segment', function () {
      this.timeout(200);

      [
        '{@{true}}',
        '{@{true /}}'
      ].forEach(function (str) {
        +(function () { Parser.parse(str); }).should.throw();
      });
    });

    it('should fail when more than one segment', function () {
      this.timeout(200);

      [
        '{@{1}}{@@{2}}{@{/}}',
        '{@{true}}{@@{true}}{@@{true}}{@{/}}'
      ].forEach(function (str) {
        +(function () { Parser.parse(str); }).should.throw();
      });
    });

  });

  describe('Test custom segments', function () {

    it('should parse single segment', function () {
      const str = '{&{true /}}';
      const segments = Parser.parse(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(1);

      segments[0].type.should.equal('custom');
      segments[0].should.have.ownProperty('context').equal(null);
      segments[0].expression.should.eql([
        {
          "type": "reserved",
          "value": true
        }
      ]);
      segments[0].closing.should.be.true;

    });

    it('should parse various segments', function () {
      var tests = {
        '{&{true}}{&{/}}': 2,
        '{&{true}}{&&{}}{&{/}}': 3,
        '{&{true}}{&&{}}{&&{}}{&&{}}{&{/}}': 5,
        '{&{true}}{&&{}}{&&{}}{&&{}}{&&{}}{&&{}}{&{/}}': 7,
        '{&{true}}{&&{}}{&&{}}{&&{}}{&&{}}{&&{}}{&&{}}{&&{}}{&&{}}{&&{}}{&&{}}{&&{}}{&&{}}{&&{}}{&{/}}': 15,
      };

      Object.keys(tests).forEach(function (str) {
        const segments = Parser.parse(str);
        const expectedCount = tests[str];

        segments.should.have.lengthOf(expectedCount);

        segments[0].type.should.equal('custom');
        segments[0].should.have.ownProperty('context').equal(null);
        segments[0].expression.should.eql([
          {
            "type": "reserved",
            "value": true
          }
        ]);

        for (let i = 1; i < expectedCount - 1; ++i) {
          segments[i].type.should.equal('custom');
          segments[i].next.should.be.true;
        }

        segments[expectedCount - 1].type.should.equal('custom');
        segments[expectedCount - 1].closing.should.be.true;

      });

    });

    it('should fail if unexpected expression', function () {
      this.timeout(200);

      [
        '{&{1}}{&&{2}}{&{/}}',
        '{&{true}}{&&{true}}{&&{true}}{&{/}}',
        '{&{true}}{&&{}}{&&{true}}{&{/}}',
        '{&{true}}{&&{true}}{&&{}}{&{/}}'
      ].forEach(function (str) {
        +(function () { Parser.parse(str); }).should.throw();
      });
    });

  });

  describe('Test named segments (declare)', function () {

    it('should parse single segment', function () {
      const str = '{#{true}}{#{/}}';
      const segments = Parser.parse(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(2);

      segments[0].should.eql({
        "type": "namedDeclare",
        "context": null,
        "expression": [
          {
            "type": "reserved",
            "value": true
          }
        ],
        "modifiers": [],
        "offset": 0,
        "line": 1,
        "column": 1
      });

      segments[1].should.be.instanceof(Object).and.eql({
        "type": "namedDeclare",
        "closing": true,
        "offset": 9,
        "line": 1,
        "column": 10
      });

    });

    it('should fail when no closing segment', function () {
      this.timeout(200);

      [
        '{#{true}}',
        '{#{true /}}'
      ].forEach(function (str) {
        +(function () { Parser.parse(str); }).should.throw();
      });
    });

    it('should fail when more than one segment', function () {
      this.timeout(200);

      [
        '{#{true}}{##{true}}{#{/}}',
        '{#{true}}{##{true}}{##{true}}{#{/}}'
      ].forEach(function (str) {
        +(function () { Parser.parse(str); }).should.throw();
      });
    });

  });

  describe('Test named segments (render)', function () {

    it('should parse single segment', function () {
      const str = '{+{true /}}';
      const segments = Parser.parse(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(1);

      segments[0].type.should.equal('namedRender');
      segments[0].should.have.ownProperty('context').equal(null);
      segments[0].expression.should.eql([ {
        type: 'reserved',
        value: true
      } ]);
      segments[0].modifiers.should.be.instanceof(Array).and.have.lengthOf(0);
      segments[0].closing.should.be.true;

    });

    it('should fail when more segments', function () {
      this.timeout(200);

      [
        '{+{true}}{+{/}}',
        '{+{true}}{++{true}}{+{/}}',
        '{+{true}}{++{true}}{++{true}}{#{/}}'
      ].forEach(function (str) {
        +(function () { Parser.parse(str); }).should.throw();
      });
    });

  });

  describe('Test partial segments', function () {

    it('should parse single segment', function () {
      const str = '{>{true /}}';
      const segments = Parser.parse(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(1);

      segments[0].type.should.equal('partial');
      segments[0].should.have.ownProperty('context').equal(null);
      segments[0].expression.should.eql([ {
        type: 'reserved',
        value: true
      } ]);
      segments[0].modifiers.should.be.instanceof(Array).and.have.lengthOf(0);
      segments[0].closing.should.be.true;

    });

    it('should fail when more segments', function () {
      this.timeout(200);

      [
        '{>{true}}{>{/}}',
        '{>{true}}{>>{true}}{>{/}}',
        '{>{true}}{>>{true}}{>>{true}}{>{/}}'
      ].forEach(function (str) {
        +(function () { Parser.parse(str); }).should.throw();
      });
    });

  });


  it('should fail with invalid segment type', function () {
    this.timeout(200);

    [
      '{Q{true}}{Q{/}}',
      '{P{true}}{P{|}}{P{/}}',
      '{-{true}}{--{true}}{-{/}}'
    ].forEach(function (str) {
      +(function () { Parser.parse(str); }).should.throw();
    });
  });


  it('should fail tempting to close or continue output segment', function () {
    this.timeout(200);

    [
      '{{true /}}',
      '{{true |}}'
    ].forEach(function (str) {
      // the syntax is more flexible, now
      //+(function () { Parser.parse(str); }).should.throw();

      const parsed = Parser.parse(str);

      parsed.should.not.be.empty;
      parsed.forEach(function (segment) {
        segment.type.should.equal('text');
      });
    });

  });


  it('should fail with invalid modifier', function () {
    this.timeout(200);

    [
      '{&{true /}()}',
      '{&{true /}123}',
      '{&{true /}hello world}',
      '{&{true /}a*)}',
      '{&{true /}.}',
      '{&{true /}"bob"}'
    ].forEach(function (str) {
      // the syntax is more flexible, now
      //console.log("*** TRYING MODIFIER PATTERN", str);
      //+(function () { Parser.parse(str); }).should.throw();

      const parsed = Parser.parse(str);

      parsed.should.not.be.empty;
      parsed.forEach(function (segment) {
        segment.type.should.equal('text');
      });
    });

  });


  it('should fail on invalid segment state', function () {
    this.timeout(200);

    [
      '{&{/}}',
      '{&&{1}}',
      '{?{true}}{?{/}}{??{1}}',
      '{?{true}}{?{/}}{?{/}}',
      '{?{true}}{&{/}}'
    ].forEach(function (str) {
      //console.log("*** TRYING MODIFIER PATTERN", str);
      +(function () { Parser.parse(str); }).should.throw();
    });

  });


  describe('Testing expressions', function () {

    it('should parse numbers', function () {
      const type = 'number';
      const tests = {
        '{{2}}': 2,
        '{{2.345}}': 2.345,
        '{{+2.345}}': 2.345,
        '{{-2}}': -2,
        '{{-2.345}}': -2.345
      };

      Object.keys(tests).forEach(function (expr) {
        const parsed = Parser.parse(expr);

        //console.log(JSON.stringify(parsed, null, 2));
        parsed[0].expression[0].should.eql({
          type: type,
          value: tests[expr]
        });
      });
    });

    it('should parse strings', function () {
      const tests = {
        '{{\'\'}}': '',
        '{{""}}': '',
        '{{" "}}': ' ',
        '{{"foo"}}': 'foo'
      };

      Object.keys(tests).forEach(function (tpl) {
        const parsed = Parser.parse(tpl);

        parsed[0].expression[0].should.eql({
          type: 'string',
          value: tests[tpl]
        });
      })
    });

    it('should parse operators', function () {
      const tests = {
        '+':'+', '-':'-', '*':'*', '/':'/',
        '%':'%', '^':'^',
        '<':'<', '>':'>',
        '<=':'<=', '>=':'>=',
        '&&':'&&', '||':'||', '&':'&',
        '=':'===',
        '!=':'!==', '<>':'!=='
      };

      Object.keys(tests).forEach(function (operator) {
        const expr = '{{1' + operator + '1}}';
        const parsed = Parser.parse(expr);

        parsed.should.have.lengthOf(1);
        parsed[0].should.have.ownProperty('type').and.equal('output');
        parsed[0].should.have.ownProperty('expression');

        const parsedExpr = parsed[0].expression;

        parsedExpr[1].type.should.equal('operator');
        parsedExpr[1].value.should.equal(tests[operator]);
      });
    });

    it('should parse negate', function () {
      var tpl;
      var parsed;

      for (let i=0; i<10; ++i) {
        tpl = '{{' + '!'.repeat(i+1) + 'a}}';

        parsed = Parser.parse(tpl);

        parsed.should.have.lengthOf(1);
        parsed[0].should.have.ownProperty('type').equal('output');
        parsed[0].should.have.ownProperty('expression').and.have.lengthOf(2);
        parsed[0].expression[0].should.have.ownProperty('type').equal('negate');
        parsed[0].expression[0].should.have.ownProperty('value').equal('!'.repeat(i+1));
      }

      parsed = Parser.parse('{{!a+b}}');
      parsed[0].should.have.ownProperty('type').equal('output');
      parsed[0].should.have.ownProperty('expression').and.have.lengthOf(4);
      parsed[0].expression[0].should.have.ownProperty('type').equal('negate');
      parsed[0].expression[0].should.have.ownProperty('value').equal('!');


    });

    it('should parse simple math', function () {
      const tests = {
        '{{2+2}}': [2, '+', 2],
        '{{2-2}}': [2, '-', 2],
        '{{2*2}}': [2, '*', 2],
        '{{2/2}}': [2, '/', 2],
        '{{+2++2}}': [2, '+', 2],
        '{{-2--2}}': [-2, '-', -2],
        '{{1.23456+-3.1415}}': [1.23456, '+', -3.1415],
        '{{"a" = "b"}}': ['a', '===', 'b'],
        '{{(2+3)}}': ['(', 2, '+', 3, ')'],
        '{{(2+3)*4}}': ['(', 2, '+', 3, ')', '*', 4]
      };

      Object.keys(tests).forEach(function (expr) {
        const parsed = Parser.parse(expr);

        const values = parsed[0].expression.map(function (token) {
          switch (token.type) {
            case 'parenOpen': return '(';
            case 'parenClose': return ')';
            default: return token.value;
          }
        });

        //console.log(JSON.stringify(parsed, null, 2));
        values.should.eql(tests[expr]);
      });
    });

    it('should parse string contatenation', function () {
      const tests = {
        '{{"" + ""}}': '',
        '{{"foo" + "bar"}}': 'foobar'
      };

      Object.keys(tests).forEach(function (tpl) {
        const parsed = Parser.parse(tpl);

        parsed[0].expression.reduce(function (str, arg) {
          if (arg.type === 'string') {
            str = str + arg.value;
          }
          return str;
        }, '').should.equal(tests[tpl]);
      });
    })

    it('should parse reserved keywords', function () {
      const type = 'reserved';
      const tests = {
        '{{undefined}}': undefined,
        '{{null}}': null,
        '{{true}}': true,
        '{{false}}': false,
        '{{NaN}}': NaN,
        '{{Infinity}}': Infinity,
        '{{+Infinity}}': Infinity,
        '{{-Infinity}}': -Infinity
      };

      Object.keys(tests).forEach(function (expr) {
        const parsed = Parser.parse(expr);

        //console.log(JSON.stringify(parsed, null, 2));
        parsed[0].expression[0].should.eql({
          type: type,
          value: tests[expr]
        });
      });
    });

    it('should parse contexts', function () {
      const type = 'context';
      const tests = {
        '{{foo}}': 'foo',
        '{{foo.bar}}': 'foo.bar',
        '{{foo.bar.buz}}': 'foo.bar.buz',
        '{{~foo}}': '~foo'
      };

      Object.keys(tests).forEach(function (expr) {
        const parsed = Parser.parse(expr);

        //console.log(JSON.stringify(parsed, null, 2));
        parsed[0].expression[0].should.eql({
          type: type,
          value: {
            path: tests[expr]
          }
        });
      });
    });

    it('should parse callable contexts', function () {
      const type = 'context';
      const tests = {
        '{{foo()}}': { path:'foo', args:[] },
        '{{foo.bar()}}': {path:'foo.bar', args:[] },
        '{{foo(1)}}': { path:'foo', args:[[{ type:'number', value:1 }]] },
        '{{foo(1,2,3)}}': { path:'foo', args:[[{ type:'number', value:1 }], [{ type:'number', value:2 }], [{ type:'number', value:3 }]] },
        '{{foo.bar(1,2,3)}}': { path:'foo.bar', args:[[{ type:'number', value:1 }], [{ type:'number', value:2 }], [{ type:'number', value:3 }]] }
      };

      Object.keys(tests).forEach(function (expr) {
        const parsed = Parser.parse(expr);

        //console.log(JSON.stringify(parsed, null, 2));
        parsed[0].expression[0].should.eql({
          type: type,
          value: tests[expr]
        });
      });
    });

  });


  describe('Testing contexts', function () {

    it('should parse simple path', function () {
      const parsed = Parser.parse('{{foo.bar.buz}}');

      parsed.should.have.lengthOf(1);
      parsed[0].should.have.ownProperty('type').equal('output');
      parsed[0].should.have.ownProperty('expression').and.have.lengthOf(1);
      parsed[0].expression[0].should.have.ownProperty('type').equal('context');
      parsed[0].expression[0].should.have.ownProperty('value').and.have.ownProperty('path').equal('foo.bar.buz');
      parsed[0].expression[0].value.should.not.have.ownProperty('props');
    });

    it('should parse path with properties', function () {
      const parsed = Parser.parse('{{foo.bar:buz.meh}}');

      parsed.should.have.lengthOf(1);
      parsed[0].should.have.ownProperty('type').equal('output');
      parsed[0].should.have.ownProperty('expression').and.have.lengthOf(1);
      parsed[0].expression[0].should.have.ownProperty('type').equal('context');
      parsed[0].expression[0].should.have.ownProperty('value');
      parsed[0].expression[0].value.should.have.ownProperty('path').equal('foo.bar');
      parsed[0].expression[0].value.should.have.ownProperty('props').equal('buz.meh');
    });

    it('should parse path with args', function () {
      const parsed = Parser.parse('{{foo.bar(1, "a", a.b(true))}}');

      parsed.should.have.lengthOf(1);
      parsed[0].should.have.ownProperty('type').equal('output');
      parsed[0].should.have.ownProperty('expression').and.have.lengthOf(1);
      parsed[0].expression[0].should.have.ownProperty('type').equal('context');
      parsed[0].expression[0].should.have.ownProperty('value');
      parsed[0].expression[0].value.should.have.ownProperty('path').equal('foo.bar');
      parsed[0].expression[0].value.should.not.have.ownProperty('props');
      parsed[0].expression[0].value.should.have.ownProperty('args');
      parsed[0].expression[0].value.args.should.have.lengthOf(3);

      parsed[0].expression[0].value.args[0].should.eql([{
        type: 'number',
        value: 1
      }]);
      parsed[0].expression[0].value.args[1].should.eql([{
        type: 'string',
        value: 'a'
      }]);
      parsed[0].expression[0].value.args[2].should.eql([{
        type: 'context',
        value: {
          path: 'a.b',
          args: [
            [ { type: 'reserved', value:true } ]
          ]
        }
      }]);
    });

    it('should parse path with properties and args', function () {
      const parsed = Parser.parse('{{foo.bar:buz.meh(1, "a", a:b(true))}}');

      parsed.should.have.lengthOf(1);
      parsed[0].should.have.ownProperty('type').equal('output');
      parsed[0].should.have.ownProperty('expression').and.have.lengthOf(1);
      parsed[0].expression[0].should.have.ownProperty('type').equal('context');
      parsed[0].expression[0].should.have.ownProperty('value');
      parsed[0].expression[0].value.should.have.ownProperty('path').equal('foo.bar');
      parsed[0].expression[0].value.should.have.ownProperty('props').equal('buz.meh');
      parsed[0].expression[0].value.should.have.ownProperty('args');
      parsed[0].expression[0].value.args.should.have.lengthOf(3);

      parsed[0].expression[0].value.args[0].should.eql([{
        type: 'number',
        value: 1
      }]);
      parsed[0].expression[0].value.args[1].should.eql([{
        type: 'string',
        value: 'a'
      }]);
      parsed[0].expression[0].value.args[2].should.eql([{
        type: 'context',
        value: {
          path: 'a',
          props: 'b',
          args: [
            [ { type: 'reserved', value:true } ]
          ]
        }
      }]);

    });

  });


  describe('Testing modifiers', function() {

    it('should parse modifier without args', function () {
      const tests = {
        '{{foo}a}': { name:'a', args:[] }
      };

      Object.keys(tests).forEach(function (expr) {
        const parsed = Parser.parse(expr);

        //console.log(JSON.stringify(parsed, null, 2));
        parsed[0].modifiers.should.eql([
          tests[expr]
        ]);
      });
    });

    it('should parse modifier with args', function () {
      const tests = {
        '{{foo}a()}': { name:'a', args:[] },
        '{{foo}a(1)}': { name:'a', args:[[{ type:'number', value:1 }]] }
      };

      Object.keys(tests).forEach(function (expr) {
        const parsed = Parser.parse(expr);

        //console.log(JSON.stringify(parsed, null, 2));
        parsed[0].modifiers.should.eql([
          tests[expr]
        ]);
      });
    });

    it('should parse chainable modifiers', function () {
      const tests = {
        '{{foo}a|b()}': [ { name:'a', args:[] }, { name:'b', args:[] } ],
        '{{foo}a|b(1)}': [ { name:'a', args:[] }, { name:'b', args:[[{ type:'number', value:1 }]] } ],
        '{{foo}a|b(1)|c}': [ { name:'a', args:[] }, { name:'b', args:[[{ type:'number', value:1 }]] }, { name:'c', args:[] } ],
        '{{foo}_}': [ { name:'_', args:[] } ],
      };

      Object.keys(tests).forEach(function (expr) {
        const parsed = Parser.parse(expr);

        //console.log(JSON.stringify(parsed, null, 2));
        parsed[0].modifiers.should.eql(tests[expr]);
      });
    });

  });

});

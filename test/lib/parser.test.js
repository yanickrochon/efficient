


describe('Test Parser', function () {

  var should = require('should');

  var Parser = require('../../lib/parser');


  this.timeout(3000);

  it('should parse null or empty string', function () {
    var segments = Parser.parse('');

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
      var str = 'Test string template';

      var segments = Parser.parse(str);

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
          var segments = Parser.parse(str);

          //console.log(JSON.stringify(segments, null, 2));

          segments.should.have.lengthOf(1);

          segments[0].type.should.equal('output');
          segments[0].content.should.be.instanceof(Object).and.eql({
            "context": null,
            "expression": [
              {
                "type": "context",
                "value": {
                  "context": "foo"
                }
              }
            ]
          });
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
          var segments = Parser.parse(str);

          //console.log(JSON.stringify(segments, null, 2));

          segments.should.be.have.lengthOf(1);

          segments[0].type.should.equal('output');
          segments[0].content.should.be.instanceof(Object).and.eql({
            "context": "bar",
            "expression": [
              {
                "type": "context",
                "value": {
                  "context": "foo"
                }
              }
            ]
          });
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
          var segments = Parser.parse(str);

          //console.log(JSON.stringify(segments, null, 2));

          segments.should.have.lengthOf(1);

          segments[0].type.should.equal('output');
          segments[0].content.should.be.instanceof(Object).and.eql({
            "context": null,
            "expression": [
              {
                "type": "context",
                "value": {
                  "context": "foo"
                }
              }
            ]
          });
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
                      "context": "bar"
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
          var segments = Parser.parse(str);
          
          //console.log(JSON.stringify(segments, null, 2));

          segments.should.have.lengthOf(1);

          segments[0].type.should.equal('output');
          segments[0].content.should.be.instanceof(Object).and.eql({
            "context": "bar",
            "expression": [
              {
                "type": "context",
                "value": {
                  "context": "foo"
                }
              }
            ]
          });
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
                      "context": "bar"
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
          var segments = Parser.parse(str);

          segments.should.have.lengthOf(2);

          segments[0].type.should.equal('text');
          segments[0].content.should.equal('Hello ');
          segments[0].offset.should.equal(0);
          segments[0].line.should.equal(1);
          segments[0].column.should.equal(1);

          segments[1].type.should.equal('output');
          segments[1].content.should.be.an.Object;
          should(segments[1].content.context).be.null;
          segments[1].content.expression.should.be.instanceof(Array).and.eql([{
            type: 'context',
            value: {
              context: 'foo'
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
      var str = '{?{true}}{?{/}}';
      var segments = Parser.parse(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(2);

      segments[0].type.should.equal('conditional');
      segments[0].content.should.be.instanceof(Object).and.eql({
        "context": null,
        "expression": [
          {
            "type": "reserved",
            "value": true
          }
        ]
      });

      segments[1].type.should.equal('conditional');
      segments[1].closing.should.be.true;

    });


    it('should parse two segments', function () {
      var str = '{?{true}}{?{|}}{?{/}}';
      var segments = Parser.parse(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(3);

      segments[0].type.should.equal('conditional');
      segments[0].content.should.be.instanceof(Object).and.eql({
        "context": null,
        "expression": [
          {
            "type": "reserved",
            "value": true
          }
        ]
      });

      segments[1].type.should.equal('conditional');
      segments[1].next.should.be.true;

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
        '{?{true}}{?{|}}{?{|}}{?{/}}',
        '{?{true}}{?{|}}{?{|}}{?{|}}{?{/}}'
      ].forEach(function (str) {
        +(function () { Parser.parse(str); }).should.throw();
      });
    });

  });


  describe('Test switch segments', function () {

    it('should parse single segment', function () {
      var str = '{*{true}}{*{/}}';
      var segments = Parser.parse(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(2);

      segments[0].type.should.equal('switch');
      segments[0].content.should.be.instanceof(Object).and.eql({
        "context": null,
        "expression": [
          {
            "type": "reserved",
            "value": true
          }
        ]
      });

      segments[1].type.should.equal('switch');
      segments[1].closing.should.be.true;

    });

    it('should parse many segments', function () {
      var str = '{*{true}}{*{|}}{*{|}}{*{|}}{*{|}}{*{|}}{*{|}}{*{/}}';
      var segments = Parser.parse(str);
      var expectedCount = 8;

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(8);

      segments[0].type.should.equal('switch');
      segments[0].content.should.be.instanceof(Object).and.eql({
        "context": null,
        "expression": [
          {
            "type": "reserved",
            "value": true
          }
        ]
      });

      for (var i = 1; i < expectedCount - 1; ++i) {
        segments[i].type.should.equal('switch');
        segments[i].next.should.be.true;
      }

      segments[expectedCount - 1].type.should.equal('switch');
      segments[expectedCount - 1].closing.should.be.true;

    });

    it('should fail when no closing segment', function () {
      this.timeout(200);

      [
        '{*{true}}',
        '{*{true /}}'
      ].forEach(function (str) {
        +(function () { Parser.parse(str); }).should.throw();
      });
    });

  });


  describe('Test iterator segments', function () {

    it('should parse single segment', function () {
      var str = '{@{true}}{@{/}}';
      var segments = Parser.parse(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(2);

      segments[0].type.should.equal('iterator');
      segments[0].content.should.be.instanceof(Object).and.eql({
        "context": null,
        "expression": [
          {
            "type": "reserved",
            "value": true
          }
        ]
      });

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
        '{@{true}}{@{|}}{@{/}}',
        '{@{true}}{@{|}}{@{|}}{@{/}}'
      ].forEach(function (str) {
        +(function () { Parser.parse(str); }).should.throw();
      });
    });

  });

  describe('Test custom segments', function () {

    it('should parse single segment', function () {
      var str = '{&{true /}}';
      var segments = Parser.parse(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(1);

      segments[0].type.should.equal('custom');
      segments[0].content.should.be.instanceof(Object).and.eql( {
        "context": null,
        "expression": [
          {
            "type": "reserved",
            "value": true
          }
        ]
      });
      segments[0].closing.should.be.true;

    });

    it('should parse various segments', function () {
      var tests = {
        '{&{true}}{&{/}}': 2,
        '{&{true}}{&{|}}{&{/}}': 3,
        '{&{true}}{&{|}}{&{|}}{&{|}}{&{/}}': 5,
        '{&{true}}{&{|}}{&{|}}{&{|}}{&{|}}{&{|}}{&{/}}': 7,
        '{&{true}}{&{|}}{&{|}}{&{|}}{&{|}}{&{|}}{&{|}}{&{|}}{&{|}}{&{|}}{&{|}}{&{|}}{&{|}}{&{|}}{&{/}}': 15,
      };

      Object.keys(tests).forEach(function (str) {
        var segments = Parser.parse(str);
        var expectedCount = tests[str];

        segments.should.have.lengthOf(expectedCount);

        segments[0].type.should.equal('custom');
        segments[0].content.should.be.instanceof(Object).and.eql({
          "context": null,
          "expression": [
            {
              "type": "reserved",
              "value": true
            }
          ]
        });

        for (var i = 1; i < expectedCount - 1; ++i) {
          segments[i].type.should.equal('custom');
          segments[i].next.should.be.true;
        }

        segments[expectedCount - 1].type.should.equal('custom');
        segments[expectedCount - 1].closing.should.be.true;

      });

    });

  });

  describe('Test named segments (declare)', function () {

    it('should parse single segment', function () {
      var str = '{#{true}}{#{/}}';
      var segments = Parser.parse(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(2);

      segments[0].should.be.instanceof(Object).and.eql({
        "type": "namedDeclare",
        "content": {
          "context": null,
          "expression": [
            {
              "type": "reserved",
              "value": true
            }
          ]
        },
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
        '{#{true}}{#{|}}{#{/}}',
        '{#{true}}{#{|}}{#{|}}{#{/}}'
      ].forEach(function (str) {
        +(function () { Parser.parse(str); }).should.throw();
      });
    });

  });

  describe('Test named segments (render)', function () {

    it('should parse single segment', function () {
      var str = '{+{true /}}';
      var segments = Parser.parse(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(1);

      segments[0].type.should.equal('namedRender');
      segments[0].content.should.be.instanceof(Object).and.eql({
        context: null,
        expression: [ {
          type: 'reserved',
          value: true
        } ]
      });
      segments[0].modifiers.should.be.instanceof(Array).and.have.lengthOf(0);
      segments[0].closing.should.be.true;

    });

    it('should fail when more segments', function () {
      this.timeout(200);

      [
        '{+{true}}{+{/}}',
        '{+{true}}{+{|}}{+{/}}',
        '{+{true}}{+{|}}{+{|}}{#{/}}'
      ].forEach(function (str) {
        +(function () { Parser.parse(str); }).should.throw();
      });
    });

  });

  describe('Test partial segments', function () {

    it('should parse single segment', function () {
      var str = '{>{true /}}';
      var segments = Parser.parse(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.have.lengthOf(1);

      segments[0].type.should.equal('partial');
      segments[0].content.should.be.instanceof(Object).and.eql({
        context: null,
        expression: [ {
          type: 'reserved',
          value: true
        } ]
      });
      segments[0].modifiers.should.be.instanceof(Array).and.have.lengthOf(0);
      segments[0].closing.should.be.true;

    });

    it('should fail when more segments', function () {
      this.timeout(200);

      [
        '{>{true}}{>{/}}',
        '{>{true}}{>{|}}{>{/}}',
        '{>{true}}{>{|}}{>{|}}{>{/}}'
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
      '{-{true}}{-{|}}{-{|}}{-{/}}'
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
      +(function () { Parser.parse(str); }).should.throw();
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
      //console.log("*** TRYING MODIFIER PATTERN", str);
      +(function () { Parser.parse(str); }).should.throw();
    });

  });


  it('should fail on invalid segment state', function () {
    this.timeout(200);

    [
      '{&{/}}',
      '{&{|}}'
    ].forEach(function (str) {
      //console.log("*** TRYING MODIFIER PATTERN", str);
      +(function () { Parser.parse(str); }).should.throw();
    });

  });

});

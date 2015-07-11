


describe('Test Parser', function () {

  var should = require('should');

  var Parser = require('../../lib/parser');
  var ParserException = require('../../lib/exceptions').ParserException;


  this.timeout(3000);

  it('should parse null or empty string', function () {
    [
      null, ''
    ].map(function (str) {
      var segments = Parser.parseString(str);

      segments.should.be.instanceof(Array).and.have.lengthOf(0);

    });

  });

  it('should throw on invalid input', function () {

    this.timeout(200);

    [
      undefined, false, true, [], {}, function () {}, /./
    ].forEach(function (str) {
      +(function () { Parser.parseString(str); }).should.throw(ParserException);
    });

  });


  it('should set string name if provided', function () {
    [
      '', 'foo'
    ].map(function (name) {
      var segments = Parser.parseString('', name);

      segments.name.should.equal(name);

    });

  });



  describe('Test text segment', function () {

    it('should parse single line text segment', function () {
      var str = 'Test string template';

      var segments = Parser.parseString(str);

      //console.log("*** RESULT", segments);

      segments.should.be.instanceof(Array).and.have.lengthOf(1);
      segments[0].type.should.equal('text');
      segments[0].text.should.equal('Test string template');
      segments[0].pos.should.equal(0);
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
          var segments = Parser.parseString(str);

          //console.log("***", segments);

          segments.should.be.instanceof(Array).and.have.lengthOf(1);
          segments[0].type.should.equal('output');
          segments[0].value.should.be.an.Object;
          should(segments[0].value.context).be.undefined;
          segments[0].value.content.should.be.instanceof(Array).and.eql([{
            type: 'context',
            text: 'foo',
            value: 'ctx.getContext("foo").data',
            pos: 0,
            line: 1,
            column: 1
          }]);
          should(segments[0].value.modifiers).be.undefined;
          segments[0].pos.should.equal(0);
          segments[0].line.should.equal(1);
          segments[0].column.should.equal(1);
        });
      });

      it('should parse with context', function () {
        [
          '{{bar\\foo}}'
        ].map(function (str) {
          var segments = Parser.parseString(str);

          segments.should.be.instanceof(Array).and.have.lengthOf(1);
          segments[0].type.should.equal('output');
          segments[0].value.should.be.an.Object;
          segments[0].value.context.should.equal('bar');
          segments[0].value.content.should.be.instanceof(Array).and.eql([{
            type: 'context',
            text: 'foo',
            value: 'ctx.getContext("foo").data',
            pos: 0,
            line: 1,
            column: 1
          }]);
          should(segments[0].value.modifiers).be.undefined;
          segments[0].pos.should.equal(0);
          segments[0].line.should.equal(1);
          segments[0].column.should.equal(1);

        });
      });

      it('should parse with modifiers', function () {
        [
          '{{foo}a|b()|c("Hello")|d(bar)}'
        ].map(function (str) {
          var segments = Parser.parseString(str);

          segments.should.be.instanceof(Array).and.have.lengthOf(1);
          segments[0].type.should.equal('output');
          segments[0].value.should.be.an.Object;
          should(segments[0].value.context).be.undefined;
          segments[0].value.content.should.be.instanceof(Array).and.eql([{
            type: 'context',
            text: 'foo',
            value: 'ctx.getContext("foo").data',
            pos: 0,
            line: 1,
            column: 1
          }]);
          segments[0].value.modifiers.should.be.instanceof(Array).and.eql([
            { action: 'a' },
            { action: 'b', arguments: [] },
            { action: 'c', arguments: [ {
                column: 1,
                line: 1,
                pos: 0,
                text: '"Hello"',
                type: 'string',
                value: 'Hello'
              } ]
            },
            { action: 'd', arguments: [ {
                column: 1,
                line: 1,
                pos: 0,
                text: 'bar',
                type: 'context',
                value: 'ctx.getContext("bar").data'
              } ]
            }
          ]);
          segments[0].pos.should.equal(0);
          segments[0].line.should.equal(1);
          segments[0].column.should.equal(1);

        });
      });

      it('should parse with context and modifiers', function () {
        [
          '{{bar \\ foo}a|b()|c("Hello")|d(bar)}'
        ].map(function (str) {
          var segments = Parser.parseString(str);

          segments.should.be.instanceof(Array).and.have.lengthOf(1);
          segments[0].type.should.equal('output');


          segments[0].value.should.be.an.Object;
          segments[0].value.context.should.equal('bar');
          segments[0].value.content.should.be.instanceof(Array).and.eql([{
            type: 'context',
            text: 'foo',
            value: 'ctx.getContext("foo").data',
            pos: 0,
            line: 1,
            column: 1
          }]);
          segments[0].value.modifiers.should.be.instanceof(Array).and.eql([
            { action: 'a' },
            { action: 'b', arguments: [] },
            { action: 'c', arguments: [ {
                column: 1,
                line: 1,
                pos: 0,
                text: '"Hello"',
                type: 'string',
                value: 'Hello'
              } ]
            },
            { action: 'd', arguments: [ {
                column: 1,
                line: 1,
                pos: 0,
                text: 'bar',
                type: 'context',
                value: 'ctx.getContext("bar").data'
              } ]
            }
          ]);
          segments[0].pos.should.equal(0);
          segments[0].line.should.equal(1);
          segments[0].column.should.equal(1);

        });
      });

      it('should parse with text', function () {
        [
          'Hello {{foo}}'
        ].map(function (str) {
          var segments = Parser.parseString(str);

          segments.should.be.instanceof(Array).and.have.lengthOf(2);
          segments[0].type.should.equal('text');
          segments[0].text.should.equal('Hello ');
          segments[0].pos.should.equal(0);
          segments[0].line.should.equal(1);
          segments[0].column.should.equal(1);

          segments[1].type.should.equal('output');
          segments[1].value.should.be.an.Object;
          should(segments[1].value.context).be.undefined;
          segments[1].value.content.should.be.instanceof(Array).and.eql([{
            type: 'context',
            text: 'foo',
            value: 'ctx.getContext("foo").data',
            pos: 0,
            line: 1,
            column: 1
          }]);
          should(segments[1].value.modifiers).be.undefined;
          segments[1].pos.should.equal(6);
          segments[1].line.should.equal(1);
          segments[1].column.should.equal(7);

        });
      });

    });

  });


  describe('Test conditional segments', function () {

    it('should parse single segment', function () {
      var str = '{?{true}}{?{/}}';
      var segments = Parser.parseString(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.be.instanceof(Array).and.have.lengthOf(2);

      segments[0].type.should.equal('segment');
      segments[0].value.should.be.instanceof(Object).and.eql({
        type: 'conditional',
        content: [ {
          type: 'reserved',
          value: true,
          text: 'true',
          pos: 0,
          line: 1,
          column: 1
        } ],
      });

      segments[1].type.should.equal('segment');
      segments[1].value.should.be.instanceof(Object).and.eql({
        type: 'conditional',
        closing: true
      });

    });


    it('should parse two segments', function () {
      var str = '{?{true}}{?{~}}{?{/}}';
      var segments = Parser.parseString(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.be.instanceof(Array).and.have.lengthOf(3);

      segments[0].type.should.equal('segment');
      segments[0].value.should.be.instanceof(Object).and.eql({
        type: 'conditional',
        content: [ {
          type: 'reserved',
          value: true,
          text: 'true',
          pos: 0,
          line: 1,
          column: 1
        } ],
      });

      segments[1].type.should.equal('segment');
      segments[1].value.should.be.instanceof(Object).and.eql({
        type: 'conditional',
        next: true
      });

      segments[2].type.should.equal('segment');
      segments[2].value.should.be.instanceof(Object).and.eql({
        type: 'conditional',
        closing: true
      });

    });

    it('should fail when no closing segment', function () {
      this.timeout(200);

      [
        '{?{true}}',
        '{?{true /}}'
      ].forEach(function (str) {
        +(function () { Parser.parseString(str); }).should.throw(ParserException);
      });
    });

    it('should fail when more than two segments', function () {
      this.timeout(200);

      [
        '{?{true}}{?{~}}{?{~}}{?{/}}',
        '{?{true}}{?{~}}{?{~}}{?{~}}{?{/}}'
      ].forEach(function (str) {
        +(function () { Parser.parseString(str); }).should.throw(ParserException);
      });
    });

  });


  describe('Test switch segments', function () {

    it('should parse single segment', function () {
      var str = '{*{true}}{*{/}}';
      var segments = Parser.parseString(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.be.instanceof(Array).and.have.lengthOf(2);

      segments[0].type.should.equal('segment');
      segments[0].value.should.be.instanceof(Object).and.eql({
        type: 'switch',
        content: [ {
          type: 'reserved',
          value: true,
          text: 'true',
          pos: 0,
          line: 1,
          column: 1
        } ],
      });

      segments[1].type.should.equal('segment');
      segments[1].value.should.be.instanceof(Object).and.eql({
        type: 'switch',
        closing: true
      });

    });

    it('should parse many segments', function () {
      var str = '{*{true}}{*{~}}{*{~}}{*{~}}{*{~}}{*{~}}{*{~}}{*{/}}';
      var segments = Parser.parseString(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.be.instanceof(Array).and.have.lengthOf(8);

      segments[0].type.should.equal('segment');
      segments[0].value.should.be.instanceof(Object).and.eql({
        type: 'switch',
        content: [ {
          type: 'reserved',
          value: true,
          text: 'true',
          pos: 0,
          line: 1,
          column: 1
        } ],
      });

      for (var i = 1; i < 6; ++i) {
        segments[i].type.should.equal('segment');
        segments[i].value.should.be.instanceof(Object).and.eql({
          type: 'switch',
          next: true
        });
      }

      segments[7].type.should.equal('segment');
      segments[7].value.should.be.instanceof(Object).and.eql({
        type: 'switch',
        closing: true
      });

    });

    it('should fail when no closing segment', function () {
      this.timeout(200);

      [
        '{*{true}}',
        '{*{true /}}'
      ].forEach(function (str) {
        +(function () { Parser.parseString(str); }).should.throw(ParserException);
      });
    });

  });


  describe('Test iterator segments', function () {

    it('should parse single segment', function () {
      var str = '{@{true}}{@{/}}';
      var segments = Parser.parseString(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.be.instanceof(Array).and.have.lengthOf(2);

      segments[0].type.should.equal('segment');
      segments[0].value.should.be.instanceof(Object).and.eql({
        type: 'iterator',
        content: [ {
          type: 'reserved',
          value: true,
          text: 'true',
          pos: 0,
          line: 1,
          column: 1
        } ],
      });

      segments[1].type.should.equal('segment');
      segments[1].value.should.be.instanceof(Object).and.eql({
        type: 'iterator',
        closing: true
      });

    });

    it('should fail when no closing segment', function () {
      this.timeout(200);

      [
        '{@{true}}',
        '{@{true /}}'
      ].forEach(function (str) {
        +(function () { Parser.parseString(str); }).should.throw(ParserException);
      });
    });

    it('should fail when more than one segment', function () {
      this.timeout(200);

      [
        '{@{true}}{@{~}}{@{/}}',
        '{@{true}}{@{~}}{@{~}}{@{/}}'
      ].forEach(function (str) {
        +(function () { Parser.parseString(str); }).should.throw(ParserException);
      });
    });

  });

  describe('Test custom segments', function () {

    it('should parse single segment', function () {
      var str = '{&{true /}}';
      var segments = Parser.parseString(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.be.instanceof(Array).and.have.lengthOf(1);

      segments[0].type.should.equal('segment');
      segments[0].value.should.be.instanceof(Object).and.eql({
        type: 'custom',
        closing: true,
        content: [ {
          type: 'reserved',
          value: true,
          text: 'true',
          pos: 0,
          line: 1,
          column: 1
        } ],
      });

    });

    it('should parse various segments', function () {
      var tests = {
        '{&{true}}{&{/}}': 2,
        '{&{true}}{&{~}}{&{/}}': 3,
        '{&{true}}{&{~}}{&{~}}{&{~}}{&{/}}': 5,
        '{&{true}}{&{~}}{&{~}}{&{~}}{&{~}}{&{~}}{&{/}}': 7,
        '{&{true}}{&{~}}{&{~}}{&{~}}{&{~}}{&{~}}{&{~}}{&{~}}{&{~}}{&{~}}{&{~}}{&{~}}{&{~}}{&{~}}{&{/}}': 15,
      };

      Object.keys(tests).forEach(function (str) {
        var segments = Parser.parseString(str);
        var expectedCount = tests[str];

        segments.should.be.instanceof(Array).and.have.lengthOf(expectedCount);

        segments[0].type.should.equal('segment');
        segments[0].value.should.be.instanceof(Object).and.eql({
          type: 'custom',
          content: [ {
            type: 'reserved',
            value: true,
            text: 'true',
            pos: 0,
            line: 1,
            column: 1
          } ],
        });

        for (var i = 1; i < expectedCount - 1; ++i) {
          segments[i].type.should.equal('segment');
          segments[i].value.should.be.instanceof(Object).and.eql({
            type: 'custom',
            next: true
          });
        }

        segments[expectedCount - 1].type.should.equal('segment');
        segments[expectedCount - 1].value.should.be.instanceof(Object).and.eql({
          type: 'custom',
          closing: true
        });

      });

    });

  });

  describe('Test named segments (declare)', function () {

    it('should parse single segment', function () {
      var str = '{#{true}}{#{/}}';
      var segments = Parser.parseString(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.be.instanceof(Array).and.have.lengthOf(2);

      segments[0].type.should.equal('segment');
      segments[0].value.should.be.instanceof(Object).and.eql({
        type: 'namedDeclare',
        content: [ {
          type: 'reserved',
          value: true,
          text: 'true',
          pos: 0,
          line: 1,
          column: 1
        } ],
      });

      segments[1].type.should.equal('segment');
      segments[1].value.should.be.instanceof(Object).and.eql({
        type: 'namedDeclare',
        closing: true
      });

    });

    it('should fail when no closing segment', function () {
      this.timeout(200);

      [
        '{#{true}}',
        '{#{true /}}'
      ].forEach(function (str) {
        +(function () { Parser.parseString(str); }).should.throw(ParserException);
      });
    });

    it('should fail when more than one segment', function () {
      this.timeout(200);

      [
        '{#{true}}{#{~}}{#{/}}',
        '{#{true}}{#{~}}{#{~}}{#{/}}'
      ].forEach(function (str) {
        +(function () { Parser.parseString(str); }).should.throw(ParserException);
      });
    });

  });

  describe('Test named segments (render)', function () {

    it('should parse single segment', function () {
      var str = '{+{true /}}';
      var segments = Parser.parseString(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.be.instanceof(Array).and.have.lengthOf(1);

      segments[0].type.should.equal('segment');
      segments[0].value.should.be.instanceof(Object).and.eql({
        type: 'namedRender',
        closing: true,
        content: [ {
          type: 'reserved',
          value: true,
          text: 'true',
          pos: 0,
          line: 1,
          column: 1
        } ],
      });

    });

    it('should fail when more segments', function () {
      this.timeout(200);

      [
        '{+{true}}{+{/}}',
        '{+{true}}{+{~}}{+{/}}',
        '{+{true}}{+{~}}{+{~}}{#{/}}'
      ].forEach(function (str) {
        +(function () { Parser.parseString(str); }).should.throw(ParserException);
      });
    });

  });

  describe('Test partial segments', function () {

    it('should parse single segment', function () {
      var str = '{>{true /}}';
      var segments = Parser.parseString(str);

      //console.log(JSON.stringify(segments, null, 2));

      segments.should.be.instanceof(Array).and.have.lengthOf(1);

      segments[0].type.should.equal('segment');
      segments[0].value.should.be.instanceof(Object).and.eql({
        type: 'partial',
        closing: true,
        content: [ {
          type: 'reserved',
          value: true,
          text: 'true',
          pos: 0,
          line: 1,
          column: 1
        } ],
      });

    });

    it('should fail when more segments', function () {
      this.timeout(200);

      [
        '{>{true}}{>{/}}',
        '{>{true}}{>{~}}{>{/}}',
        '{>{true}}{>{~}}{>{~}}{>{/}}'
      ].forEach(function (str) {
        +(function () { Parser.parseString(str); }).should.throw(ParserException);
      });
    });

  });


  it('should fail with invalid segment type', function () {
    this.timeout(200);

    [
      '{Q{true}}{Q{/}}',
      '{P{true}}{P{~}}{P{/}}',
      '{-{true}}{-{~}}{-{~}}{-{/}}'
    ].forEach(function (str) {
      +(function () { Parser.parseString(str); }).should.throw(/^Invalid segment type/);
    });
  });


  it('should fail tempting to close or continue output segment', function () {
    this.timeout(200);

    [
      '{{true /}}',
      '{{true ~}}'
    ].forEach(function (str) {
      +(function () { Parser.parseString(str); }).should.throw(/^Unexpected token/);
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
      +(function () { Parser.parseString(str); }).should.throw(/^Invalid modifier/);
    });

  });


  it('should fail with invalid template name', function () {
    this.timeout(200);

    [
      true, false,
      -1, 0, 1, 123,
      function () {}, {}, [], /./
    ].forEach(function (name) {
      +(function () { Parser.parseString('', name); }).should.throw('Invalid template name : ' + String(name));
    });

  });


  it('should fail on invalid segment state', function () {
    this.timeout(200);

    [
      '{&{/}}',
      '{&{~}}'
    ].forEach(function (str) {
      //console.log("*** TRYING MODIFIER PATTERN", str);
      +(function () { Parser.parseString(str); }).should.throw('Invalid segment state');
    });

  });


  describe('Test parsing files', function () {

    var path = require('path');
    var fixturePath = path.join(__dirname, '..', 'fixtures');

    it('should parse simple file', function (done) {
      var template = path.join(fixturePath, 'simple.eft.html');

      Parser.parseFile(template).then(function (segments) {

        segments.map(function (segment) {
          return segment.type;
        }).should.be.instanceof(Array).and.eql([
          'text', 'output', 'text', 'segment', 'output', 'segment', 'text', 'segment', 'text'
        ]);

      }).then(done).catch(done);

    });

    it('should fail on invalid file', function (done) {
      var invalidTemplate = path.join(fixturePath, '___INVALID___.x.y.z');

      Parser.parseFile(invalidTemplate).then(function () {
        throw new Error('Should have failed with invalid file');
      }).catch(function (err) {
        err.should.be.an.instanceof(Error);
      }).then(done);

    });

  });

});

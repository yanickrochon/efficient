


describe('Test Parser', function () {

  var should = require('should');

  var Parser = require('../../lib/parser');
  var ParserException = require('../../lib/exceptions').ParserException;


  this.timeout(3000);

  it('should parse null or empty string', function () {
    [
      null, ''
    ].map(function (tmpl) {
      var segments = Parser.parseString(tmpl);

      segments.should.be.instanceof(Array).and.have.lengthOf(0);

    });

  });

  it('should throw on invalid input', function () {

    this.timeout(200);

    [
      undefined, false, true, [], {}, function () {}, /./
    ].forEach(function (input) {
      +(function () { Parser.parseString(input); }).should.throw(ParserException);
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
          '{{bar:foo}}'
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
                value: '"Hello"'
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
          '{{bar : foo}a|b()|c("Hello")|d(bar)}'
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
                value: '"Hello"'
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


    describe('Test conditional segments', function () {

      it('should parse `if`', function () {
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


      it('should parse `if... else`', function () {
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

    });

  });


  it('should parse simple string', function () {

    var str = 'Test {?{(a & 123) && (!b.c | true) = ..foo + "foo"}}{{foo}}{?{/}}!!';
    var name = 'test.str';

    var segments = Parser.parseString(str, name);

    //console.log("*** PARSED", segments);


  });


});

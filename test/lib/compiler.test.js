

describe('Test compiler', function () {

  var Compiler = require('../../lib/compiler');

  function execTemplate(tpl, data) {
    var Context = require('../../lib/context');
    var ctx = new Context(data);
    var output = {
      raw: [],
      buffer: ''
    };
    var print = function print(str) {
      output.raw.push(str);
      output.buffer += str;
    };

    return tpl(ctx,print,undefined).then(function () {
      return output;
    });
  }


  describe('Text-only templates', function () {

    it('should compile single text segment', function (done) {
      var parsed = [
        {
          "type": "text",
          "value": "Hello World",
          "text": "Hello World"
        }
      ];
      var fn = Compiler.compile(parsed);

      execTemplate(fn).then(function (output) {
        output.buffer.should.equal('Hello World');
      }).then(done).catch(done);
    });

    it('should optimize consecutive text segments', function (done) {
      var parsed = [
        {
          "type": "text",
          "value": "Hello",
          "text": "Hello"
        },
        {
          "type": "text",
          "value": " ",
          "text": " "
        },
        {
          "type": "text",
          "value": "World",
          "text": "World"
        },
        {
          "type": "text",
          "value": "!",
          "text": "!"
        }
      ];
      var fn = Compiler.compile(parsed);

      execTemplate(fn).then(function (output) {
        output.raw.length.should.equal(1);
        output.buffer.should.equal('Hello World!');
      }).then(done).catch(done);
    });

  });


  describe('Output segments', function () {

    it('should compile single segment');

    it('should compile more segments');

    it('should optimize');

    it('should integrate with other segments');

  });


  describe('Conditional segments', function () {

    it('should compile single segment');

    it('should compile with else segment');

    it('should integrate with other segments');

  });


  describe('Switch segments', function () {

    it('should compile single segment', function (done) {
      var parsed = require('../fixtures/segments/switch1.eft');
      var fn = Compiler.compile(parsed);
      var values = ['0', '0', '0', '0', '0', '0', '0', '0', '0', '0'];

      Promise.all(values.map(function(t, value) {
        var data = {
          value: value
        };

        return execTemplate(fn, data);
      })).then(function (res) {
        res.map(function (output) { return output.buffer; }).should.eql(values);
      }).then(done).catch(done);
    });

    it('should compile with more segments', function (done) {
      var parsed = require('../fixtures/segments/switch2.eft');
      var fn = Compiler.compile(parsed);
      var values = ['a', 'b', 'c', '3', '4', '5', '6', '7', '8', '9', '10'];

      Promise.all(values.map(function(t, value) {
        var data = {
          value: value
        };

        return execTemplate(fn, data);
      })).then(function (res) {
        res.map(function (output) { return output.buffer; }).should.eql(values);
      }).then(done).catch(done);
    });

    it('should integrate with other segments', function (done) {
      var parsed = require('../fixtures/segments/switch3.eft');
      var fn = Compiler.compile(parsed);
      var values = ['0', '1', '2', '3'];

      Promise.all(values.map(function(value, index) {
        var data = {
          index: index,
          value: value
        };

        return execTemplate(fn, data);
      })).then(function (res) {
        res.map(function (output) {
          return output.buffer;
        }).should.eql(values.map(function (val) {
          return 'pre' + val + 'post';
        }));
      }).then(done).catch(done);
    });

  });


  describe('Iterator segments', function () {

    it('should compile single segment');

    it('should integrate with other segments');

  });


  describe('Parsed template', function () {

    it('should compile', function (done) {
      var parsed = require('../fixtures/simple-2.eft');
      var data = {
        name: 'John',
        messages: ['message A', 'message B']
      };
      var fn = Compiler.compile(parsed);

      execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('Hello John, you have two messages');
      }).then(done).catch(done);

    });

  });


});



describe('Test compiler', function () {

  var Compiler = require('../../lib/compiler');

  Compiler.BEAUTIFY = true;   // DEBUG


  function execTemplate(tpl, data) {
    var Context = require('../../lib/context');
    var ctx = new Context(data);
    var output = {
      raw: [],
      buffer: '',
      named: {}
    };
    var engine = {
      out: function out(str) {
        output.raw.push(str);
        output.buffer += str;
      },
      iterator: function (ctx, values, cb) {
        var arr;

        if (values instanceof Array) {
          arr = values.map(function (val, index) {
            return {
              index: index,
              value: val,
              key: val
            };
          });
        } else if (typeof values === 'number') {
          if (values > 0) {
            arr = Array.apply(null, Array(values)).map(function (undefined, index) {
              return {
                index: index,
                value: index,
                key: index
              };
            });
          } else {
            arr = [];
          }
        } else if (values !== null && typeof values === 'object') {
          arr = Object.keys(values).map(function (key, index) {
            return {
              index: index,
              value: values[key],
              key: key
            };
          })
        } else {
          arr = [];
        }

        return arr.reduce(function (p, value) {
          return p.then(function () {
            cb(ctx.push(value));
          });
        }, Promise.resolve(ctx));
      },
      setSegment: function (name, fn) {
        output.named[name] = fn;
      },
      getSegment: function (name) {
        return output.named[name] || function (c) { return c; };
      },
      callCustom: function (ctx, path, segments) {
        var custom = ctx.getContext(String(path)).data;
        var promise = Promise.resolve(ctx);

        if (typeof custom === 'function') {
          promise = promise.then(custom(ctx, segments));
        }

        return promise.then(function () {
          return ctx;
        });
      }
    };

    return tpl(engine,ctx).then(function () {
      return output;
    });
  }


  describe('Text-only Templates', function () {

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


  describe('Output Segments', function () {

    it('should compile single segment', function (done) {
      var parsed = [
        {
          "type": "output",
          "value": {
            "context": "foo",
            "content": [
              {
                "type": "context",
                "value": "ctx.getContext(\"add\").data",
                "text": "add"
              },
              {
                "type": "number",
                "value": 2,
                "text": "2"
              },
              {
                "type": "operator",
                "value": "+",
                "text": "+"
              }
            ]
          },
          "text": "{{foo\\ add + 2}}"
        }
      ];
      var fn = Compiler.compile(parsed);

      execTemplate(fn, {
        foo: {
          add: 10
        }
      }).then(function (output) {
        output.buffer.should.equal('12');
      }).then(done).catch(done);
    });

    it('should compile more segments', function (done) {
      var parsed = [
        {
          "type": "output",
          "value": {
            "context": "foo",
            "content": [
              {
                "type": "context",
                "value": "ctx.getContext(\"add\").data",
                "text": "add"
              },
              {
                "type": "number",
                "value": 2,
                "text": "2"
              },
              {
                "type": "operator",
                "value": "+",
                "text": "+"
              }
            ]
          },
          "text": "{{foo\\ add + 2}}"
        },
        {
          "type": "text",
          "value": " ",
          "text": " "
        },
        {
          "type": "output",
          "value": {
            "context": "bar",
            "content": [
              {
                "type": "context",
                "value": "ctx.getContext(\"mul\").data",
                "text": "mul"
              },
              {
                "type": "number",
                "value": 10,
                "text": "10"
              },
              {
                "type": "operator",
                "value": "*",
                "text": "*"
              }
            ]
          },
          "text": "{{foo\\ mul * 10}}"
        }
      ];
      var fn = Compiler.compile(parsed);

      execTemplate(fn, {
        foo: {
          add: 10
        },
        bar: {
          mul: 5
        }
      }).then(function (output) {
        output.buffer.should.equal('12 50');
      }).then(done).catch(done);
    });

    it('should optimize', function (done) {
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
          "type": "output",
          "value": {
            "context": "foo",
            "content": [
              {
                "type": "context",
                "value": "ctx.getContext(\"bar\").data",
                "text": "foo"
              }
            ]
          },
          "text": "{{foo\\ bar}}"
        },
        {
          "type": "text",
          "value": "!",
          "text": "!"
        }
      ];
      var data = {
        foo: {
          bar: 'John'
        }
      };
      var fn = Compiler.compile(parsed);

      execTemplate(fn, data).then(function (output) {
        output.raw.length.should.equal(1);
        output.buffer.should.equal('Hello John!');
      }).then(done).catch(done);
    });

  });


  describe('Conditional Segments', function () {

    it('should compile single segment', function (done) {
      var parsed = require('../fixtures/segments/conditional1.eft');
      var fn = Compiler.compile(parsed);
      var tests = [
      [    // false
        false, null, undefined, 0, ''
      ],[  // true
        true, {}, [], function () {}, -1, 1, /./
      ]];

      Promise.all(tests.map(function(values, truthy) {
        return Promise.all(values.map(function (value) {
          var data = {
            value: value
          };

          return execTemplate(fn, data);
        })).then(function (res) {
          res.map(function (output) { return output.buffer; }).should.eql(values.map(function () {
            return truthy ? 'Hello World': '';
          }));
        });
      })).then(function () { done(); }).catch(done);
    });

    it('should compile with else segment', function (done) {
      var parsed = require('../fixtures/segments/conditional2.eft');
      var fn = Compiler.compile(parsed);
      var tests = [
      [    // false
        false, null, undefined, 0, ''
      ],[  // true
        true, {}, [], function () {}, -1, 1, /./
      ]];

      Promise.all(tests.map(function(values, truthy) {
        return Promise.all(values.map(function (value) {
          var data = {
            value: value
          };

          return execTemplate(fn, data);
        })).then(function (res) {
          res.map(function (output) { return output.buffer; }).should.eql(values.map(function () {
            return truthy ? 'Hello World': 'Good Bye';
          }));
        });
      })).then(function () { done(); }).catch(done);
    });

    it('should integrate with other segments', function (done) {
      var parsed = require('../fixtures/segments/conditional3.eft');
      var fn = Compiler.compile(parsed);
      var tests = [
      [    // false
        false, null, undefined, 0, ''
      ],[  // true
        true, {}, [], function () {}, -1, 1, /./
      ]];
      var PREVAL = '>>>';
      var POSTVAL = '<<<';

      Promise.all(tests.map(function(values, truthy) {
        return Promise.all(values.map(function (value) {
          var data = {
            pre: PREVAL,
            foo: {
              value: value,
            },
            post: POSTVAL
          };

          return execTemplate(fn, data);
        })).then(function (res) {
          res.map(function (output) { return output.buffer; }).should.eql(values.map(function () {
            return PREVAL + (truthy ? 'Hello World': 'Good Bye') + POSTVAL;
          }));
        });
      })).then(function () { done(); }).catch(done);
    });
  });


  describe('Switch Segments', function () {

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
          foo: {
            index: index,
            value: value
          }
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


  describe('Iterator Segments', function () {

    it('should iterate arrays', function (done) {
      var parsed = require('../fixtures/segments/iterator1.eft');
      var fn = Compiler.compile(parsed);
      var data = {
        values: ['a', 'b', 'c']
      };

      execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('0aa;1bb;2cc;');
        output.raw.should.have.lengthOf(data.values.length);
      }).then(done).catch(done);
    });

    it('should iterate objects', function (done) {
      var parsed = require('../fixtures/segments/iterator1.eft');
      var fn = Compiler.compile(parsed);
      var data = {
        values: {
          'a': 'A',
          'b': 'B',
          'c': 'C'
        }
      };

      execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('0Aa;1Bb;2Cc;');
        output.raw.should.have.lengthOf(Object.keys(data.values).length);
      }).then(done).catch(done);
    });

    it('should iterate counter', function (done) {
      var parsed = require('../fixtures/segments/iterator1.eft');
      var fn = Compiler.compile(parsed);
      var data = {
        values: 3
      };

      execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('000;111;222;');
        output.raw.should.have.lengthOf(data.values);
      }).then(done).catch(done);
    });

  });


  describe('Named Segments', function () {

    it('should set named segments', function (done) {
      var parsed = require('../fixtures/segments/named1.eft');
      var fn = Compiler.compile(parsed);

      execTemplate(fn).then(function (output) {
        output.buffer.should.be.empty;
        output.raw.should.be.empty;
        output.named.should.have.ownProperty('foo').be.a.Function;
      }).then(done).catch(done);
    });

    it('should render named segments', function (done) {
      var parsed = require('../fixtures/segments/named2.eft');
      var fn = Compiler.compile(parsed);
      var data = {
        'user': 'John'
      };

      execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('Hello John');
        output.raw.should.have.lengthOf(1);
        output.named.should.have.ownProperty('foo').be.a.Function;
      }).then(done).catch(done);
    });

  });


  describe('Custom Segments', function () {

    it('should parse custom segments', function (done) {
      var parsed = require('../fixtures/segments/custom1.eft');
      var fn = Compiler.compile(parsed);
      var data = {
        'callback': function () {
          callbackCalled = true;  
        },
        'custom': 'callback'
      };
      var callbackCalled = false;

      execTemplate(fn, data).then(function (output) {
        output.buffer.should.be.empty;
        callbackCalled.should.be.true;
      }).then(done).catch(done);

    });

  });


  describe('Parsed template', function () {

    it('should compile simple template', function (done) {
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

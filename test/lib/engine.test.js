

describe('Test engine', function () {

  var path = require('path');

  var Engine = require('../../lib/engine');

  var engineOptions = {
    paths: {
      'fixtures/testing': path.join(__dirname, '..', 'fixtures'),
      '*': path.join(__dirname, '..', 'fixtures')
    }
  };


  describe('Resolving templates', function () {
    var engine;

    before(function () {
      engine = Engine(engineOptions);
    });

    it('should resolve default path "*"', function (done) {
      engine.resolve('template1').then(function (fileName) {
        fileName.should.endWith('template1.eft');

        done();
      }).catch(done);
    });

    it('should resolve path', function (done) {
      Promise.all([
        engine.resolve('template1'),
        engine.resolve('fixtures/testing/template1'),
      ]).then(function (results) {
        results.should.have.lengthOf(2);
        Object.keys(engine._cache).should.have.lengthOf(2);
        Object.keys(Engine._cache).should.have.lengthOf(1);

        results[0].should.equal(results[1]);

        // read global cache
        return Promise.all([
          engine.resolve(path.join(__dirname, '..', 'fixtures', 'template1')),
          engine.resolve(results[0])
        ]).then(function (absResults) {
          absResults[0].should.equal(absResults[1]);
          absResults[0].should.equal(results[0]);
        });
      }).then(done).catch(done);


    });

    it('should not resolve', function (done) {
      engine.resolve('non-existent').then(function (fileName) {
        throw new Error('Should not have found ' + fileName);
      }, function (err) {
        err.should.be.instanceOf(Error);
      }).then(done).catch(done);
    });

    it('should fail to read file', function (done) {
      var fs = require('fs');
      var _readFile = fs.readFile;

      fs.readFile = function (file, options, cb) {
        cb(new Error('Test I/O error'));
      };

      delete engine._cache['tempalte1'];

      engine.render('template1').then(function () {
        fs.readFile = _readFile;        

        throw new Error('Should have failed reading file');
      }, function (err) {
        fs.readFile = _readFile;

        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Test I/O error');

        done();
      });

    });


  });


  describe('Rendering templates', function () {
    var engine;

    before(function () {
      engine = Engine(engineOptions);
    });

    it('should render correct context', function (done) {
      var data = {
        subject: 'World',
        value: 1,
        foo: {
          value: 2
        },
        bar: {
          value: 3
        },
        buz: {
          fn: function (ctx, segments) {
            this.out('$');
            return segments[0](ctx);
          },
          value: 4
        }
      };

      engine.render('template1', data).then(function (output) {

        output.indexOf('Hello World !').should.not.equal(-1);
        output.indexOf('$0:4').should.not.equal(-1);
        output.indexOf('$1:4').should.not.equal(-1);
        output.indexOf('$2:4').should.not.equal(-1);

        done();
      }).catch(done);
    });

    it('should register string template', function () {
      var tpl = 'Test';
      var globalKeys = Object.keys(Engine._cache);
      var localKeys = Object.keys(engine._cache);

      engine.defineTemplate('tpl', tpl)

      globalKeys.should.eql(Object.keys(Engine._cache));
      localKeys.should.not.eql(Object.keys(engine._cache));

      engine._cache.should.have.ownProperty('tpl');
    });

  });


  describe('Rendering partals', function () {
    var engine;

    before(function () {
      engine = Engine();  // no options, don't need it
    });

    it('should wrap modifiers', function (done) {
      var tmpl1 = 'Hello {>{foo\\ "tmpl2"/}upper|padLeft(10,"0")}';
      var tmpl2 = '{{text}substr(3)}';
      var data = {
        text: '***bob',
        foo: {
          text: '---john'
        }
      };

      engine.defineTemplate('tmpl1', tmpl1);
      engine.defineTemplate('tmpl2', tmpl2);

      Engine._cache.should.not.have.ownProperty('templ1');

      engine._cache.should.have.ownProperty('tmpl1');
      engine._cache.should.have.ownProperty('tmpl2');

      engine.render('tmpl1', data).then(function (output) {
        output.should.equal('Hello 000000JOHN');
      }).then(done).catch(done);
    });

  });


  describe('Control flow', function () {
    var engine;

    before(function () {
      engine = Engine({
        timeout: 200  // 1 sec timeout
      });
    });

    it('should abort rendering from expression', function (done) {
      var tmpl = 'Hello {{foo()}} !';
      var data = {
        foo: function () {
          throw new Error('Aborted from expression');
        }
      };

      engine.defineTemplate('tmpl.expr', tmpl);

      engine.render('tmpl.expr', data).then(function (output) {
        throw new Error("Rendering was not aborted");
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Aborted from expression');

        done();
      }).catch(done);
    });

    it('should abort rendering from custom (reject)', function (done) {
      var tmpl = 'Hello {&{"foo"/}} !';
      var data = {
        foo: function () {
          return new Promise(function (resolve, reject) {
            setTimeout(function () {
              reject(new Error('Aborted from custom reject'));
            }, 10);
          });
        }
      };

      engine.defineTemplate('tmpl.custom.reject', tmpl);

      engine.render('tmpl.custom.reject', data).then(function (output) {
        throw new Error("Rendering was not aborted");
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Aborted from custom reject');

        done();
      }).catch(done);
    });

    it('should abort rendering from custom (throw)', function (done) {
      var tmpl = 'Hello {&{"foo"/}} !';
      var data = {
        foo: function () {
          return new Promise(function () {
            throw new Error('Aborted from custom async throw');
          });
        }
      };

      engine.defineTemplate('tmpl.custom.throw', tmpl);

      engine.render('tmpl.custom.throw', data).then(function (output) {
        throw new Error("Rendering was not aborted");
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Aborted from custom async throw');

        done();
      }).catch(done);
    });

    it('should abort rendering upon stop async', function (done) {
      var tmpl = 'Hello {&{"foo"/}} !';
      var data = {
        foo: function () {
          var engine = this;
          return Promise.resolve().then(function () {
            engine.stop();
          });
        }
      };

      engine.defineTemplate('tmpl.custom.stop', tmpl);

      engine.render('tmpl.custom.stop', data).then(function (output) {
        throw new Error("Rendering was not aborted");
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Rendering aborted');

        done();
      }).catch(done);
    });

    it('should abort rendering upon stop async with custom message', function (done) {
      var tmpl = 'Hello {&{"foo"/}} !';
      var data = {
        foo: function () {
          var engine = this;
          return Promise.resolve().then(function () {
            engine.stop('Custom message test');
          });
        }
      };

      engine.defineTemplate('tmpl.custom.stop.msg', tmpl);

      engine.render('tmpl.custom.stop.msg', data).then(function (output) {
        throw new Error("Rendering was not aborted");
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Rendering aborted : Custom message test');

        done();
      }).catch(done);
    });

    it('should timeout', function (done) {
      var tmpl = 'Hello {&{"foo"/}}';
      var data = {
        foo: function () {
          return new Promise(function () {
            // will not resolve....
          });
        }
      };

      engine.defineTemplate('tmpl.custom.timeout', tmpl);

      engine.render('tmpl.custom.timeout', data).then(function (output) {
        throw new Error("Rendering did not timeout");
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Rendering timeout (200ms)');

        done();
      }).catch(done);
    });

  });


  describe('Custom', function () {
    var engine;

    before(function () {
      engine = Engine({
        timeout: 200
      });
      engine.defineTemplate('custom', '{&{"foo" /}}');
    });

    it('should ignore missing custom functions', function (done) {
      Promise.all([
        engine.render('custom').then(function (output) {
          output.should.be.empty;
        }),
        engine.render('custom', {
          foo: function () {
            this.out('foo');
          }
        }).then(function (output) {
          output.should.equal('foo');
        })
      ]).then(function () { done(); }, done);
    });

  });


  describe('Iterators', function () {
    var engine;

    before(function () {
      engine = Engine({
        timeout: 200
      });
      engine.defineTemplate('iterator', '{@{foo}}{{index}}:{{key}}:{{value}};{@{/}}');
    });

    it('should iterate from object', function (done) {
      var obj = {
        foo: {
          a: 'A',
          b: 'B',
          c: 'C'
        }
      };

      engine.render('iterator', obj).then(function (output) {
        output.should.equal('0:a:A;1:b:B;2:c:C;');
        done();
      }).catch(done);
    });

    it('should iterate from array', function (done) {
      var obj = {
        foo: [
          'A',
          'B',
          'C'
        ]
      };

      engine.render('iterator', obj).then(function (output) {
        output.should.equal('0:0:A;1:1:B;2:2:C;');
        done();
      }).catch(done);
    });

    it('should iterate from counter', function (done) {
      var obj = {
        foo: 3
      };

      engine.render('iterator', obj).then(function (output) {
        output.should.equal('0:0:0;1:1:1;2:2:2;');
        done();
      }).catch(done);
    });

    it('should skip invalid or empty iterators', function (done) {
      Promise.all([
        undefined, null, true, false,
        0, NaN,
        function () {}, /./, 
        {}, []
      ].map(function (iterator) {
        return engine.render('iterator', { foo: iterator }).then(function (output) {
          output.should.be.empty;
        });
      })).then(function () { done(); }, done);
    })

  });


  describe('Modifiers', function () {
    var engine;

    before(function () {
      engine = Engine({
        timeout: 200
      });
    });

    it('should apply single modifier', function (done) {
      engine.defineTemplate('modifier.single', '{{foo}upper}');

      engine.render('modifier.single', {
        foo: 'hello'
      }).then(function (output) {
        output.should.equal('HELLO');
        done();
      }).catch(done);
    });

    it('should apply multiple modifiers in correct order', function (done) {
      var data = {
        foo: 'b'
      };

      engine.defineTemplate('modifier.multiple.1', '{{foo}upper|padLeft(2,"a")|padRight(3,"c")}');
      engine.defineTemplate('modifier.multiple.2', '{{foo}padLeft(2,"a")|upper|padRight(3,"c")}');
      engine.defineTemplate('modifier.multiple.3', '{{foo}padLeft(2,"a")|padRight(3,"c")|upper}');

      Promise.all([
        engine.render('modifier.multiple.1', data).then(function (output) {
          output.should.equal('aBc');
        }),
        engine.render('modifier.multiple.2', data).then(function (output) {
          output.should.equal('ABc');
        }),
        engine.render('modifier.multiple.3', data).then(function (output) {
          output.should.equal('ABC');
        })
      ]).then(function () { done(); }, done);

    });

    it('should call with multiple arguments', function (done) {
      var modifiers = require('../../lib/modifiers');
      var data = {
        foo: 1
      };

      modifiers.register(function adder(val, a, b, c, d, e) {
        return val + (a||0) + (b||0) + (c||0) + (d||0) + (e||0);
      });

      engine.defineTemplate('modifier.args.0', '{{foo}adder()}');
      engine.defineTemplate('modifier.args.1', '{{foo}adder(2)}');
      engine.defineTemplate('modifier.args.2', '{{foo}adder(2,3)}');
      engine.defineTemplate('modifier.args.3', '{{foo}adder(2,3,4)}');
      engine.defineTemplate('modifier.args.4', '{{foo}adder(2,3,4,5)}');
      engine.defineTemplate('modifier.args.5', '{{foo}adder(2,3,4,5,6)}');

      Promise.all([
        engine.render('modifier.args.0', data).then(function (output) {
          output.should.equal('1');
        }),
        engine.render('modifier.args.1', data).then(function (output) {
          output.should.equal('3');
        }),
        engine.render('modifier.args.2', data).then(function (output) {
          output.should.equal('6');
        }),
        engine.render('modifier.args.3', data).then(function (output) {
          output.should.equal('10');
        }),
        engine.render('modifier.args.4', data).then(function (output) {
          output.should.equal('15');
        }),
        engine.render('modifier.args.5', data).then(function (output) {
          output.should.equal('21');
        })
      ]).then(function () {
        modifiers.unregister('adder');

        done();
      }, done);

    });

    it('should fail with invalid modifier', function (done) {
      engine.defineTemplate('modifier.invalid', '{{foo}invalid}');

      engine.render('modifier.invalid').then(function () {
        throw new Error('Test should have failed');
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Invalid modifier invalid');

        done();
      }).catch(done);
    })

  });


  describe('Partials', function () {

    it('should render simple partial');

    it('should render partial with correct context');

    it('should apply modifiers');

  });


  describe('Named segments', function () {

    it('should render named segment');

    it('should render with correct context');

    it('should render with compound context');

    it('should apply modifiers');

  });

});



describe('Test engine', function () {

  var path = require('path');

  var Engine = require('../../lib/engine');

  var engineOptions = {
    paths: {
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

    it('should resolve path');

    it('should not resolve', function (done) {
      engine.resolve('non-existent').then(function (fileName) {
        throw new Error('Should not have found ' + fileName);
      }, function (err) {
        err.should.be.instanceOf(Error);
      }).then(done).catch(done);
    });

  });


  //describe('Test modifiers', function () {

  //});


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

      Promise.all([
        engine.defineTemplate('tmpl1', tmpl1),
        engine.defineTemplate('tmpl2', tmpl2),
      ]).then(function () {

        console.log("**** ", engine._cache);

        return engine.render('tmpl1', data).then(function (output) {
          output.should.equal('Hello 000000JOHN');
        }).then(done);

      }).catch(done);
    });

  });

});



describe('Test context', function () {

  var Context = require('../../lib/context');

  var personsContext = {
    'persons': [{
      'name': {
        'first': 'John',
        'last': 'Smith'
      }
    }, {
      'name': {
        'first': 'Jane',
        'last': 'Doe'
      }
    }],
    'tags': [
      'Poor', 'Average', 'Good'
    ],
    'locales': {
      'en': 'English'
    }
  };


  it('should be valid context paths', function () {
    [
      'foo',
      '~foo',
      '.foo',
      '..foo',
      '.....foo',
      '~foo.bar',
      '~foo..bar',
      'foo.bar:buz',
      '~foo.bar:buz',
      '...foo.bar:buz',
      'foo.bar:buz.meh',
      '~foo.bar:buz.meh',
      '...foo.bar:buz.meh'
    ].forEach(function (path) {
      Context.isValid(path).should.be.true;
    })
  });

  it('should be invalid context paths', function () {
    [
      '~.foo',
      '~..foo',
      '.~foo',
      '..~foo',
      '.foo~',
      'foo:bar:buz',
      'foo.bar:buz:meh',
      'foo:bar.buz:meh',
      'foo.bar$meh',
      'foo.bar:meh!buz'
    ].forEach(function (path) {
      Context.isValid(path).should.be.false;
    })
  });


  it('should create a context', function () {
    var ctx = new Context(null, 'foo');

    ctx.should.be.instanceof(Context);
    ctx.data.should.equal('foo');
    assert.equal(ctx.parent, null);
  });

  it('should push new context', function () {
    var ctx = new Context(null, 'foo');
    var ctxPushed = ctx.push('bar');

    ctxPushed.should.be.instanceof(Context);
    ctxPushed.should.not.equal(ctx);
    ctxPushed.data.should.equal('bar');
    ctxPushed.parent.should.equal(ctx);
  });

  it('should pop parent context', function () {
    var ctx = new Context(null, 'foo');
    var ctxPushed = ctx.push('bar');
    var ctxPop = ctxPushed.pop();

    ctx.should.be.instanceof(Context);
    ctx.data.should.equal('foo');
    assert.equal(ctx.parent, null);

    ctxPushed.should.be.instanceof(Context);
    ctxPushed.should.not.equal(ctx);
    ctxPushed.data.should.equal('bar');
    ctxPushed.parent.should.equal(ctx);

    ctxPop.should.be.instanceof(Context);
    ctx.should.equal(ctx);
    ctxPop.data.should.equal('foo');
    assert.equal(ctxPop.parent, null);

    ctx.pop().pop().pop().pop().pop().should.equal(ctx);
  });

  it('should get context from path', function () {
    var ctx = new Context(null, personsContext);

    ctx.getContext('.').should.equal(ctx);
    ctx.getContext('..').should.equal(ctx);
    ctx.getContext('......').should.equal(ctx);

    ctx.getContext('.persons.name').data.should.be.instanceof(Array).and.have.lengthOf(2);

    ctx.getContext('persons.name.first').data[0].should.equal('John');

    ctx.getContext('persons').getContext('.').data.should.be.an.Array;
    ctx.getContext('persons').getContext('..').should.equal(ctx);

    ctx.getContext('persons.name.first...').should.equal(ctx);

    ctx.getContext('tags').data.should.be.instanceof(Array).and.equal(personsContext.tags);
    ctx.getContext('locales.en').data.should.equal('English');
    ctx.getContext('locales.en........locales.en').data.should.equal('English');
  });

  it('should return property context for empty path values', function () {
    var ctx = new Context(null, { index: 0 });

    //console.log(JSON.stringify(ctx.getContext('index.foo.bar'), null, 2));

    ctx.getContext('index').should.have.ownProperty('data').and.equal(0);
    ctx.getContext('index.foo.bar').should.have.ownProperty('data').and.be.undefined; //.eql(null);
  });

  it('should branch context', function () {
    var ctx = new Context(null, 'foo');
    var branch1 = ctx.push('bar1').push('buz');
    var branch2 = ctx.push('bar2').push('meh');

    ctx.push('bar').push('buz').getContext('..').data.should.equal('foo');

  });



});

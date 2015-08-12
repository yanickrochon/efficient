

describe('Test context', function () {

  var Context = require('../../lib/context');
  var should = require('should');

  var testContextData = {
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
      'Poor', 'Average', undefined, null, 'Good'
    ],
    'locales': {
      'en': 'English'
    },
    'empty': [
      null, undefined
    ],

    'foo': [
      {
        'bar': [
          {
            'buz': "item1"
          },
          {
            'buz': "item2"
          }
        ]
      },
      {
        'bar': [
          {
            'buz': "item3"
          },
          {
            'buz': "item4"
          }
        ]
      },
      {
        'bar': 'item5... not part of an object'
      },
      {
        'bar': {
          'buz': 'item6'
        }
      }
    ]
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
      '~~foo',
      '~..foo',
      '.~foo',
      '..~foo',
      '.foo~',
      'foo..bar',
      'foo....bar',
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
    var ctx = new Context('foo');

    ctx.should.be.instanceof(Context);
    ctx.data.should.equal('foo');
    assert.equal(ctx.parent, null);
  });

  it('should push new context', function () {
    var ctx = new Context('foo');
    var ctxPushed = ctx.push('bar');

    ctxPushed.should.be.instanceof(Context);
    ctxPushed.should.not.equal(ctx);
    ctxPushed.data.should.equal('bar');
    ctxPushed.parent.should.equal(ctx);
  });

  it('should pop parent context', function () {
    var ctx = new Context('foo');
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
    var ctx = new Context(testContextData);

    ctx.get('.').should.equal(ctx);
    ctx.get('..').data.should.equal(ctx.data);
    ctx.get('......').data.should.equal(ctx.data);

    ctx.get('.persons.name').data.should.be.instanceof(Array).and.have.lengthOf(2);

    ctx.get('persons.name.first').data[0].should.equal('John');

    ctx.get('persons').get('.').data.should.be.an.Array;
    ctx.get('persons').get('..').data.should.equal(ctx.data);

    ctx.get('tags').data.should.be.instanceof(Array).and.equal(testContextData.tags);
    ctx.get('locales.en').data.should.equal('English');

    ctx.get('persons.name.first').get('~').data.should.equal(testContextData);
    ctx.get('persons.name.first').get('~persons.name.first').data[0].should.equal('John');

    ctx.get('tags.length').data.should.be.instanceof(Array).and.eql([4, 7, 4]);
    should(ctx.get('empty.foo').data).equal(null);
  });

  it('should return property context for empty path values', function () {
    var ctx = new Context({ index: 0 });

    //console.log(JSON.stringify(ctx.get('index.foo.bar'), null, 2));

    ctx.get('index').should.have.ownProperty('data').and.equal(0);
    ctx.get('index.foo.bar').should.have.ownProperty('data').and.be.undefined; //.eql(null);
  });

  it('should return previous context', function () {
    var ctx = new Context(testContextData);

    ctx.get('persons.name.first').get('~').get('..').data[0].should.equal('John');

  });

  it('should branch context', function () {
    var ctx = new Context('foo');
    // is this really necessary??? What's the use case?
    //var branch1 = ctx.push('bar1').push('buz');
    //var branch2 = ctx.push('bar2').push('meh');

    ctx.push('bar').push('buz').get('..').data.should.equal('bar');
    ctx.push('bar').push('buz').get('...').data.should.equal('foo');

  });

  // it('should check if has data', function () {
  //   new Context().hasData.should.be.false;

  //   [
  //     undefined, null, [], {}
  //   ].forEach(function (data) {
  //     new Context(data).hasData.should.be.false;
  //   });

  //   [
  //     -1, 0, 1, NaN, Infinity,
  //     true, false,
  //     '', 'foo',
  //     { foo: 'bar' }, ['foo']
  //   ].forEach(function (data) {
  //     new Context(data).hasData.should.be.true;
  //   });

  // });

  it('should read nested arrays', function () {
    var ctx = new Context(testContextData);

    ctx.get('foo.bar').data.should.be.instanceOf(Array).with.lengthOf(6);

    ctx.get('foo.bar.buz').data.should.be.instanceOf(Array).eql([
      'item1', 'item2', 'item3', 'item4', 'item6'
    ]);

  })

});

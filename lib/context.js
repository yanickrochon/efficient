/**
Template Context
*/

const PATH_ROOT = '~';
const PATH_SEP = '.';

const PATH_PATTERN = /^(?:~|\.+)?(?:[a-zA-Z_]\w*\.)*[a-zA-Z_]\w*$/;

/**
Expose Context constructor
*/
module.exports = Context;



/**
Private module definition below
*/


/**
Create a new Context

@param {Object} data                        the context's data
@param {Context} parent                     the parent context
@param {String} templateName     (optional) the template name
*/
function Context(data, parent, templateName) {
  this.data = data;
  this.parent = parent;
  this.templateName = templateName || (parent && parent.templateName);
};


Object.defineProperties(Context.prototype, {
  /**
  Returns true if the context has some data
  @return {Boolean}
  */
  'hasData': {
    enumerable: true,
    configurable: false,
    get: hasData
  },

  /**
  Push new data, create a new context and return it
  @param {Object} data
  @return {Context}
  */
  'push': {
    enumerable: true,
    configurable: false,
    writable: false,
    value: pushContext
  },

  /**
  Pop the parent context and return it.
  @return {Context}
  */
  'pop': {
    enumerable: true,
    configurable: false,
    writable: false,
    value: popContext
  },

  /**
  Return a relative context
  @param {String} path    the path to the relative context
  @return {Context}
  */
  'getContext': {
    enumerable: true,
    configurable: false,
    writable: false,
    value: getContext
  }
});

Object.freeze(Context.prototype);


Context.isValid = isContextValid;

Object.freeze(Context);



function isContextValid(path) {
  return PATH_PATTERN.test(path);
}


function hasData() {
  var dataType = typeof this.data;

  if (dataType === 'object') {
    for (var k in this.data) {
      return true;
    }
  } else if (dataType === 'Number' || this.data) {
    return true;
  }

  return false;
}

function pushContext(data) {
  return new Context(data, this);
}

function popContext() {
  return this.parent || this;
}


function getContext(path) {
  var ctx = this;
  var pathOffset = 0;
  var ctxPath;
  var propPath;
  var i;
  var iLen;
  var j;
  var jLen;
  var data;
  var tempData;

  // shortcuts
  if (path === PATH_ROOT) {
    while (ctx.parent) {
      ctx = ctx.parent;
    }

    data = ctx.data;
  } else if (path === PATH_SEP) {
    return this;  // shortcut
  } else {

    if (path.charAt(pathOffset) === PATH_ROOT) {
      while (ctx.parent) {
        ctx = ctx.parent;
      }

      ++pathOffset;
    }

    if (path.charAt(pathOffset) === PATH_SEP) {
      ++pathOffset;  // skip first dot
    }
    while (path.charAt(pathOffset) === PATH_SEP) {
      ctx = ctx.parent || ctx;
      ++pathOffset;
    }

    data = ctx.data;

    if (pathOffset < path.length) {
      path = path.substr(pathOffset).split(PATH_SEP);

      for (i = 0, iLen = path.length; i < iLen; ++i) {
        key = path[i];

        // if data is an array, we try to collect the array items' keys
        if (data instanceof Array) {

          tempData = data;
          data = [];

          for (j = 0, jLen = tempData.length; j < jLen; ++j) {
            if (tempData[j] !== null && tempData[j] !== undefined) {
              if (tempData[j][key] instanceof Array) {
                data = data.concat(tempData[j][key]);
              } else if (tempData[j][key] !== null && tempData[j][key] !== undefined) {
                data.push(tempData[j][key]);
              }
            }
          }

          // no element in the collected array? Default to an object (we don't want empty arrays...)
          data.length || (data = null);
        } else if (data !== null && data !== undefined) {
          data = data[key];
        }
      }
    }
  }

  return this.push(data);
}
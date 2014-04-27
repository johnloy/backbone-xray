/* ==========================================================================
 * Backbone-Xray: backbone-xray.js v@VERSION
 * https://github.com/johnloy/backbone-xray/blob/master/backbone-xray.js
 * ==========================================================================
 * Copyright 2014 John Loy
 * Licensed under MIT (https://github.com/johnloy/backbone-xray/blob/master/LICENSE)
 * ========================================================================== */

(function(root, factory) {

  // Support AMD
  if(typeof define === 'function' && define.amd) {
    define([ 'exports', 'backbone', 'underscore', 'jquery' ], factory);
  }
  // Support Node.js or CommonJS.
  else if(typeof exports === 'object') {
    factory(exports, require('backbone'), require('underscore'), require('jquery'));
  }
  // Support browser global Backbone var. Use `root` here as it references `window`.
  else {
    factory(root, root.Backbone, root._, root.jQuery);
  }

}(this, function( exports, Backbone, _, $) {

  'use strict';

  var xray = { VERSION: '@VERSION' },
      BBXR_DEVELOPMENT = true;

  var noop = $.noop,

      // start matching after: comment start block => ! or @preserve => optional whitespace => newline
      // stop matching before: last newline => optional whitespace => comment end block
      reCommentContents = /\/\*!?(?:\@preserve)?[ \t]*(?:\r\n|\n)([\s\S]*?)(?:\r\n|\n)\s*\*\//;

  var backboneConstructors = {
    'Model'      : Backbone.Model,
    'Collection' : Backbone.Collection,
    'View'       : Backbone.View,
    'Router'     : Backbone.Router
  };


 /**
  * ## Utilities
  * ======================================================================== */

  // Yuck! Why did Underscore remove the optional >1 arguments for _.bindAll?
  var _bindAll = function (obj) {
    var funcs = [].slice.call(arguments, 1);
    if (funcs.length === 0) {
      funcs = _.functions(obj);
    }
    return _.bindAll.apply(_, [obj].concat(funcs));
  };

  var util = {

    parseUri: function(url) {
      var a, url, lastPathSep, query, subdomains;

      a = $('<a>', { href: url } )[0];
      lastPathSep = a.pathname.lastIndexOf('/');
      query = a.search.substr(1); // remove leading /
      subdomains = a.hostname.split('.').slice(0, -2);

      return {
        directory: a.pathname.substr(0, lastPathSep),
        file: a.pathname.slice(lastPathSep + 1),
        hash: a.hash.slice(1), // remove leading #
        host: a.hostname,
        path: a.pathname,
        params: util.parseQueryParams(query),
        protocol: a.protocol.slice(0, -1), // remove trailing :
        query: query,
        subdomains: subdomains,
        tld: a.hostname.substr(a.hostname.lastIndexOf('.') +1),
        userInfo: {
          user: a.username,
          password: a.password
        }
      }
    },

    parseQueryParams: function(query) {
      var re = /([^&=]+)=?([^&]*)/g,
          decodeRE = /\+/g,  // Regex for replacing addition symbol with a space
          decode = function (str) {return decodeURIComponent( str.replace(decodeRE, " ") );},
          params = {},
          matches = null;

      while ( matches = re.exec(query) ) {
          var k = decode( matches[1] ), v = decode( matches[2] );
          if (k.substring(k.length - 2) === '[]') {
              k = k.substring(0, k.length - 2);
              (params[k] || (params[k] = [])).push(v);
          }
          else params[k] = v;
      }

      return params;
    },

    // Mad props to Sindre Sorhus for this great multiline string hack
    // https://github.com/sindresorhus/multiline
    multilineString: function(fn) {
      if (typeof fn !== 'function') {
        throw new TypeError('Expected a function.');
      }

      var match = reCommentContents.exec(fn.toString());

      if (!match) {
        throw new TypeError('Multiline comment missing.');
      }

      return this.stripIndent(match[1]);
    },

    stripIndent: function(str) {
      var match = str.match(/^[ \t]*(?=[^\s])/gm);

      if (!match) {
        return str;
      }

      var indent = Math.min.apply(Math, match.map(function (el) { return el.length }));
      var re = new RegExp('^[ \\t]{' + indent + '}', 'gm');

      return indent > 0 ? str.replace(re, '') : str;
    }

  };


 /**
  * ## Settings
  * ======================================================================== */

  var SETTINGS_STORAGE_KEY = 'backbone-xray.settings',
      persistedSettings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)),
      persistSettingsOpt = persistedSettings ? true : false;

  var settingKeys = ['throttleTime', 'eventSpecifiers', 'loggedEvents'];

  var _extractSettings = function () {
    if(typeof xray.config === 'object') {
      return {
        throttleTime: xray.config ? xray.config.throttleTime : xray.defaults.config.throttleTime,
        eventSpecifiers: xray.eventSpecifiers || null,
        loggedEvents: xray.loggedEvents || null
      }
    }
    return {}
  };

  var _initPersistedSettings = function () {

    var settings = {},
        initialSettings = persistedSettings || _extractSettings();

    _.each(settingKeys, function (key) {
      Object.defineProperty(settings, key, {

        get: function() {
          var settings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
          return settings[key];
        },

        set: function(setting) {
          var settings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)) || {},
              settingsSerialized;
          settings[key] = setting;
          settingsSerialized = JSON.stringify(settings);
          localStorage.setItem(SETTINGS_STORAGE_KEY, settingsSerialized);
        }

      });

      settings[key] = initialSettings[key];

    });

    xray.settings = settings;

  };

  var _destroyPersistedSettings = function () {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  };

  // Public API

  Object.defineProperty(xray, 'persistSettings', {
    get: function() {
      return persistSettingsOpt;
    },
    set: function(persist) {
      if(persist) {
        _initPersistedSettings();
      }
      else {
        _destroyPersistedSettings();
      }
      persistSettingsOpt = persist;
      return persist;
    }
  });

  xray.addSetting = function(name, val) {
    if(arguments.length == 2 && typeof name === 'string') {
      var settingPair = {};
      settingPair[name] = val;
      xray.settings = _.extend(xray.settings, settingPair);
      return settingPair;
    }
  };

  xray.removeSetting = function(name) {
    if(arguments.length > 0 && typeof name === 'string' && typeof xray.settings[name] !== 'undefined') {
      xray.settings = _.omit(xray.settings, name);
    }
  };


 /**
  * ## Instrumentation of Backbone.Events.trigger and other arbitrary methods
  * ======================================================================== */

  var origTrigger = Backbone.Events.trigger,
      trigger     = origTrigger;

  // TODO: Extend this so it isn't totally based on Chrome's error stack implementation
  var _trace = function (){
    var isRelevantStackLine = _.bind(xray.config.isRelevantStackLine, xray);

    try { throw Error(); }
    catch(err) {
      var stackLines = err.stack.split("\n").slice(4),
          relevantLine = _.find(stackLines, isRelevantStackLine),
          details = [];

      details[0] = "\n" + stackLines.join("\n");

      if(relevantLine) {
        var url = relevantLine.match(/\((.*)\)/);
        details[1] = url ? url[1] : undefined;
      }

      return details;
    }
  };

  var _triggerWithLogging = function (eventName, data) {
    var self = this,
        timeElapsed = null;

    if( xray.isLoggingEventsFor.call(xray, this, eventName) &&
        !~eventName.indexOf('xray-logging') &&
        !xray.isPaused ) {

      var firstTiming = window.performance.getEntriesByName('xray-taken').length === 0;

      if(!firstTiming) {
        timeElapsed =  window.performance.now() - _.last(window.performance.getEntriesByType('mark')).startTime;
      }
      window.performance.mark('xray-taken');

      var traceDetails = _trace();
      _.defer(function() {
        var eventInfo, entry;

        eventInfo = {
          type: 'event',
          obj: self,
          name: eventName,
          data: data,
          stack: xray.util.stripIndent(traceDetails[0]),
          location: traceDetails[1],
          timeElapsed: timeElapsed
        };

        xray.log(xray.getEntry(eventInfo), eventInfo);
      });
    }

    origTrigger.apply(this, arguments);
  };

  var _addInstrumentation = function () {
    if(xray.instrumentors) {
      _.each(xray.instrumentors, function(instrumentor) {
        var instrumentedObj = instrumentor.namespace;
        instrumentor.activate();
        if(typeof instrumentedObj.trigger == 'function') {
          instrumentedObj.trigger = _triggerWithLogging;
        }
      });
    }
    Backbone.Model.prototype.trigger      =
    Backbone.Collection.prototype.trigger =
    Backbone.View.prototype.trigger       =
    Backbone.Router.prototype.trigger     = _triggerWithLogging;
  };

  var _removeInstrumentation = function () {
    // if(xray.config.instrumented) {
    //   _.each(xray.instrumented, function(obj) {
    //     obj.trigger = origTrigger;
    //   });
    // }
    Backbone.Model.prototype.trigger      =
    Backbone.Collection.prototype.trigger =
    Backbone.View.prototype.trigger       =
    Backbone.Router.prototype.trigger     = origTrigger;
  };

  var Instrumentor = xray.Instrumentor = function (namespace) {
    this.namespace = namespace;
    namespace[1].__xrayName__ = namespace[0];
    this.descendants = [];
    this.forbiddenProperties = ['model', 'comparator'];
    this.findDescendants(this.namespace[1], 1);
  }

  Instrumentor.parseInstrumentedObjects = function (instrumented) {
    var parsed = _.map(instrumented, function(objChainStr) {
      var objChain = objChainStr.split('.'),
          objChainLength = objChain;

      return _.reduce(objChain, function(currObj, identifier) {
        return currObj[identifier];
      }, window);
    });

    parsed = _.zip(instrumented, parsed);

    return parsed;
  };

  Instrumentor.prototype.activate = function () {
    var i, len;
    this.processDescendant(this.namespace[1]);
    for (i = 0, len = this.descendants.length; i < len; i++) {
      this.processDescendant(this.descendants[i]);
    }
  };

  Instrumentor.prototype.findDescendants = function(namespace, depth) {
    // Prevent a stack overflow
    if(depth > 10) return;

    var property, nextNameSpace;
    for (property in namespace) {
      if (this.isInstrumentableObj(namespace[property])) {
        namespace[property].__xrayName__ = property;
        this.descendants.push(namespace[property]);
      }
    }

    for (property in namespace) {
      nextNameSpace = namespace[property];
      if ($.isPlainObject(nextNameSpace)) {
        this.findDescendants(nextNameSpace, depth + 1);
      }
    }
  };

  Instrumentor.prototype.isInstrumentableObj = function(property) {
    return ( property &&
             !this.isForbiddenProperty(property) &&
             (typeof(property.__super__) === 'object' || $.isPlainObject(property)) );
  };

  Instrumentor.prototype.isForbiddenProperty = function(property) {
    return _.indexOf(this.forbiddenProperties, property) !== -1
  };

  Instrumentor.prototype.processDescendant = function(descendant) {
    var methodsParent = descendant.prototype ? descendant.prototype : descendant,
        property;
    for (property in methodsParent) {
      if (!this.isForbiddenProperty(property)) this.wrapMethod(descendant, property);
    }
  };

  Instrumentor.prototype.wrapMethod = function(descendant, property) {
    var methodsParent = descendant.prototype ? descendant.prototype : descendant,
        method = methodsParent[property];

    if (methodsParent.hasOwnProperty(property) && typeof method === 'function' && !method.__xrayInstrumented__) {
      var id = descendant['__xrayName__'] + "#" + property;
      var original = method;

      // We don't want to wrap constructor functions. Assume a constructor if the prototype has properties.
      if(!_.isEmpty(method.prototype)) return;

      methodsParent[property] = function() {
        var self = this;
        var args = arguments;

        if( xray.isLoggingEventsFor.call(xray, this, id) && !xray.isPaused ) {
          var traceDetails = _trace();

          _.defer(function() {
            var eventInfo, entry;

            eventInfo = {
              type: 'method',
              obj: self,
              name: id,
              arguments: _.toArray(args),
              definition: self[property].original.toString(),
              stack: xray.util.stripIndent(traceDetails[0]),
              location: traceDetails[1],
            };

            entry = xray.getEntry(eventInfo);

            xray.log(entry, eventInfo);
          });

          methodsParent[property]['original'] = original;
          methodsParent[property]['__xrayInstrumented__'] = true;

        };

        // The first time delegateEvents was called methods weren't wrapped,
        // so we have to call it again.
        if(property === 'initialize' && descendant.__super__ === Backbone.View.prototype) {
          this.delegateEvents();
        }

        return original.apply(self, arguments);
      }

    }
  };

  Backbone.on('xray-logging-start', _addInstrumentation);
  Backbone.on('xray-logging-stop' , _removeInstrumentation);


 /**
  * ## Optional loading of a UI on demand
  * ======================================================================== */

  xray.openUi = function(initView) {
    var thisScript, baseName, fileName, uiUrl;
    var chromeExtensionPrefix = 'chrome-extension://kjomdambjjdfjoihpccpanpelcjhgfhd/';
    thisScript = document.querySelector('script[src$="/backbone-xray.js"]').src;

    var scriptUrlParts = thisScript.split('/');
    baseName = scriptUrlParts.slice(0, -1).join('/');
    fileName = scriptUrlParts.slice(-1);

    if(~baseName.indexOf('file://')) {
      uiUrl = chromeExtensionPrefix + 'backbone-xray-ui.js?init_view=' + initView;
    }
    else {

    }

    $('<script />', { src: uiUrl }).appendTo('body');
  };


 /**
  * ## Defaults
  * ======================================================================== */

 var defaults = {

    chromeExtensionId: null,

    config: {

      throttleTime : 100,

      instrumented : [],

      constructors : backboneConstructors,

      formatters   : [
        {
          name: 'method',

          match: function(xray, eventInfo) {
            return eventInfo.type === 'method';
          },

          summary: function(xray, eventInfo) {
            return ['Method: ' + eventInfo.name];
          },

          obj: function(xray, eventInfo) {
            return [ 'Called on: ', eventInfo.obj ];
          },

          arguments: function(xray, eventInfo) {
            return ['Arguments: ', eventInfo.arguments]
          },

          definition: function(xray, eventInfo) {
            return ['Definition:', function() {
              console.log(eventInfo.definition);
            }];
          } 
        },
        {
          name: 'model',
          match: function(xray, eventInfo) {
            return eventInfo.obj instanceof Backbone.Model;
          },
          summary: function(xray, eventInfo) {
            var label = null,
                obj = eventInfo.obj,
                strategies = [
                  function getName() {
                    var name = obj.name || _.isFunction(obj.get) ? obj.get('name') : undefined;
                    return name ? xray.getTypeOf(obj) + '(name: "' + name + '")' : undefined;
                  },
                  function getId() {
                    var obj = eventInfo.obj,
                        idProp = obj.id ? 'id' : 'cid';
                    if(obj[idProp]) {
                      return xray.getTypeOf(obj) + '(' + idProp + ': ' + obj[idProp] + ')';
                    }
                  }
                ].reverse(),
                i = strategies.length;

            while(i--) {
              label = strategies[i]();
              if(label) {
                return [
                  'Event: %s ❯ %s',
                  label,
                  eventInfo.name
                ];
              }
            }
          }
        },
        {
          name: 'collection',
          match: function(xray, eventInfo) {
            return eventInfo.obj instanceof Backbone.Collection;
          },
          summary: function(xray, eventInfo) {
            var obj = eventInfo.obj;
            return [
              'Event: %s ❯ %s',
              xray.getTypeOf(obj) + '(length: ' + obj.length + ')',
              eventInfo.name
            ];
          }
        },
        {
          name: 'view',
          match: function(xray, eventInfo) {
            return eventInfo.obj instanceof Backbone.View;
          },
          summary: function(xray, eventInfo) {
            var obj = eventInfo.obj;
            return [
              'Event: %s ❯ %s',
              xray.getTypeOf(obj),
              eventInfo.name
            ];
          }
        },
        {
          name: 'router',
          match: function(xray, eventInfo) {
            return eventInfo.obj instanceof Backbone.Router;
          },
          summary: function(xray, eventInfo) {
            var obj = eventInfo.obj;
            return [
              'Event: %s ❯ %s',
              xray.getTypeOf(obj),
              eventInfo.name
            ];
          }
        },
        { name: 'default',
          match: function() { return true; },

          summary: function(xray, eventInfo) {
            var obj = eventInfo.obj;
            return [ 'Event: %s ❯ %s', xray.getTypeOf(obj), eventInfo.name ];
          },

          obj: function(xray, eventInfo) {
            return [ 'Triggered on: ', eventInfo.obj ];
          },

          listeners: function(xray, eventInfo) {

            if(eventInfo.obj._events && eventInfo.obj._events[eventInfo.name]) {

              var formatter = ['Listeners: '];

              _.each(eventInfo.obj._events[eventInfo.name], function(listener, i) {
                var funcStr = listener.callback.toString();
                var funcName = (function() {
                  var logRef = funcStr.match(/@name\s(\w+#[a-zA-Z0-9_]+)/);
                  if(logRef) return logRef[1] + ':';
                }());

                formatter.push(function() {
                  console.groupCollapsed(funcName || '(anonymous): ');
                    console.log(listener.callback.toString());
                  console.groupEnd();
                });

              });

              return formatter;
            }
          },

          data: function(xray, eventInfo) {
            return [ 'Data: ', eventInfo.data ];
          },

          location: function(xray, eventInfo) {
            return [ 'At (file:line): ' + eventInfo.location ];
          },

          timeElapsed: function(xray, eventInfo) {
            return [ 'Time since previous event logged: ' + eventInfo.timeElapsed / 1000 + ' seconds' ];
          },

          stack: function(xray, eventInfo) {
            return [
              'Call stack: ',
              function() {
                console.log(eventInfo.stack);
              }
            ];
          },

          prepend: noop,
          append: noop
        }
      ],

      aliases      : [
        {
          name: 'backbone',
          expanded: ['Model', 'Collection', 'View', 'Router']
        },
        {
          name: 'backbone-data',
          expanded: ['Model', 'Collection']
        }
      ],

      isRelevantStackLine: function (stackLine) {
       if(!/(backbone|underscore|jquery)(\..+\.|\.)js/.test(stackLine)) return true;
      },

      log: function (entry, eventInfo) {

        if(eventInfo.type === 'event') {
          entry.summary(function() {
            entry.prepend();
            entry.obj();
            entry.location();
            entry.data();
            entry.listeners();
            entry.timeElapsed();
            entry.stack();
            entry.append();
          });
        } else {
          entry.summary(function() {
            entry.prepend();
            entry.obj();
            entry.arguments();
            entry.location();
            entry.definition();
            entry.timeElapsed();
            entry.stack();
            entry.append();
          });
        }
      }

    }

  };


 /**
  * ## Main API
  * ======================================================================== */

  var eventSpecifiersParsed = false,
      configured = false,
      formattersWrapped = false,
      formatterFieldNames = [];

  // Private methods

  var _compareEventSpecifiers = function (a, b) {
    if( (_.isString(a) && a[0].match(/[A-Z]/)) ||
       _.isFunction(a) ) {
      return -1;
    }
    return 1;
  };

  var _containsUnexpandedAlias = function (expanded) {
    return ~(expanded.join('').indexOf('*'));
  };

  var _expandEventAliases = function (alias) {

    if(!alias.expanded) {
      alias.expanded = [];
    }

    while(_containsUnexpandedAlias(alias.expanded)) {
      alias.expanded = _.chain(alias.expanded).map(function(expansion) {
        var unexpanded = ~expansion.indexOf('*'),
        resolveKey;
        if(unexpanded) {
          resolveKey = expansion.slice(1);
          return _.findWhere(xray.config.aliases, {name: resolveKey}).expanded;
        }
        return expansion;
      }).flatten().uniq().value();
    }

    return alias;
  };

  var _isInstanceOf = function (obj, constr) {
    constr = typeof constr === 'function' ? constr : xray.config.constructors[constr];
    if(typeof constr !== 'undefined') return (obj instanceof constr);
    return false;
  };

  var _isPatternSpecifier = function (specifier) {
    return _.isString(specifier) && specifier[0] === '/';
  };

  var _isValidEventSpecifier = function () {
    var specifiers = _.toArray(arguments);
    return _.all(specifiers, function(specifier) {
      return _.any( [ _.isString, _.isRegExp ],
                   function(test) { return test(specifier); }
                  );
    });
  };

  var _stringifyEventSpecifiers = function (eventSpecifiers) {
    return _.map(eventSpecifiers, function(specifier) {
      if(specifier instanceof RegExp) return _toRegExpString(specifier);
      return specifier;
    });
  };

  var _patternStrToRegExp = function (patternStr) {
    return RegExp(patternStr.slice(1,-1));
  };

  // We can't store RegExp objects in xray.loggedEvents, as identical RegExp
  // instances aren't ===, so comparison's don't work (WTF ???)
  var _toRegExpString = function (pattern) {
    if(_isPatternSpecifier(pattern.toString())) {
      return pattern.toString();
    }
    else {
      return '/' + pattern + '/';
    }
  };

  var _formattersReversed = _.memoize(function () {
    var reversed = [],
        formatters = xray.config.formatters,
        len = formatters.length;
    for (var i = (len - 1); i >= 0; i--) {
      reversed.push(formatters[i]);
    }
    return reversed;
  });

  var _resetConfig = function () {
    return xray.config = $.extend({}, xray.defaults.config);
  };

  var _addFormatterFieldNames = function (formatters) {
    formatterFieldNames = _.uniq(formatterFieldNames.concat(
      _.chain(formatters).map(function(formatter) {
        return _.keys(_.omit(formatter, 'name', 'match'));
      }).flatten().uniq().value()
    ));
  };

  var _wrapFormatters = function (formatters) {
    var wrappedFormatters;

    formatters = formatters || xray.config.formatters;
    _addFormatterFieldNames(formatters);

    wrappedFormatters = _.map(formatters, function (formatter) {

      _.each(formatterFieldNames, function (name) {
        var currMethod = formatter[name];
        if(currMethod) {
          formatter[name] = _.wrap(currMethod, function(origFunc, xray, eventInfo, callback) {
            var args = [].slice.call(arguments).slice(1),
                origResults = origFunc.call(formatter, xray, eventInfo),
                origResultsMsg,
                origResultsCallbacks,
                callbacks;

            origResultsMsg = _.reject(origResults, _.isFunction);
            origResultsCallbacks = _.select(origResults, _.isFunction);

            callbacks = _.compact(_.union(callback, origResultsCallbacks));

            if(callbacks.length) {
              console.groupCollapsed.apply(console, origResultsMsg);
              _.each(callbacks, function(f){ f(); });
              console.groupEnd();
            } else {
              console.log.apply(console, origResults);
            }
          });
        }
      });
      return formatter;
    });

    formattersWrapped = true;

    return wrappedFormatters;
  };

  // Public API

  xray = _.extend(xray, {

    defaults: defaults,

    config: $.extend({}, defaults.config),

    loggedEvents: persistedSettings.loggedEvents || [],

    eventSpecifiers: persistedSettings.eventSpecifiers || [],

    configure: function(config) {
      _resetConfig();

      // Omit aliases for now, because the aliases need to be parsed by addAliases
      this.config = $.extend(true, {}, this.config, _.omit(config, 'aliases', 'formatters'));

      if(config.aliases) this.addAliases.apply(this, config.aliases);

      if(config.formatters) this.addFormatters.apply(this, config.formatters);

      if(config.instrumented) this.instrument.apply(this, config.instrumented);

      if(!eventSpecifiersParsed) this.parseEventSpecifiers();

      configured = true;
      Backbone.trigger('xray-configure');
    },

    help: function() {
      this.openUi('help');
    },

    focusOn: function() {

     /**
      * Turn on event logging by supplying event specifiers as arguments. These specifiers
      * limit logged events to only ones triggered on specified objects and with specified
      * event names.
      *
      * Specifiers can reference an object, a predefined class of objects, or an event name
      * pattern. Any number of specifier arguments in any order can be supplied. If none
      * are supplied, event logging is disabled.
      *
      * When both object and event name specifiers exist, only events matching both one
      * of the object specifiers and one of the event name specifiers will be logged.
      *
      * When only event name specifiers exist, events triggered on any object matching the
      * name pattern will be logged.
      *
      * When only object specifiers exist, all events triggered on only those objects will
      * be logged.
      *
      * Object specifiers may take any of the following forms:
      *  - A string of the name of a constructor function (example: 'HotelModel')
      *  - A reference to a constructor function
      *  - A string representing a class of objects (example: 'model')
      *
      * Event name specifiers may take any of the following forms:
      *  - A string to be searched for as a substring within event names
      *  - A regular expression to be matched against event names
      *
      * @method focusOn
      * @param {Object} context The object that will have its dependencies
      */

      if(arguments[0] === null) {
        this.stopLogging();
        return;
      }

      var eventSpecifiers = null;

      if(arguments && arguments.length && arguments[0] !== '*') {
        eventSpecifiers = _.toArray(arguments);
      } else {
        eventSpecifiers = ['*backbone'];
      }

      this.eventSpecifiers = eventSpecifiers.sort(_compareEventSpecifiers);
      this.validateEventSpecifiers();
      this.parseEventSpecifiers();

      return this.loggedEvents;
    },

    instrument: function () {
      var instrumentedObjects = Instrumentor.parseInstrumentedObjects(_.toArray(arguments));

      var instrumentors = _.map(instrumentedObjects, function (namespace) {
        return new Instrumentor(namespace);
      });

      this.instrumentors = _.uniq(_.compact(_.union(this.instrumentors, instrumentors)));

      return instrumentors;
    },

    startLogging: function() {
      if(this.eventSpecifiers.length === 0) {
        this.focusOn('*');
        console.warn('No event pattern specifiers have yet been provided. All events for all objects that extend ' +
                     'Backbone.Model, Backbone.Collection, Backbone.View, and Backbone.Router will be logged.')
      }

      this.isPaused = false;

      if(!eventSpecifiersParsed) this.parseEventSpecifiers();
      if(!formattersWrapped) this.config.formatters = _wrapFormatters();

      if(!configured) {
        Backbone.on('xray-configure', function() {
          Backbone.trigger('xray-logging-start');
        });
      } else {
        Backbone.trigger('xray-logging-start');
      }
    },

    stopLogging: function() {
      this.loggedEvents = [];
      this.eventSpecifiers = [];
      eventSpecifiersParsed = false;
      xray.removeSetting('loggedEvents');
      xray.removeSetting('eventSpecifiers');
      this.isPaused = false;
      Backbone.trigger('xray-logging-stop');
    },

    pauseLogging: function() {
      this.isPaused = true;
      Backbone.trigger('xray-logging-pause');
    },

    parseEventSpecifiers: function() {
      var self = this,
          loggedEvents = this.loggedEvents = [],
          eventObjMatchers = this.eventObjMatchers = [];

      _.each(this.eventSpecifiers, function(specifier) {
        var alias;

        // Constructor name
        if(self.isConstructorName(specifier)) {
          loggedEvents.push(specifier);
        }

        // Alias
        else if(typeof specifier === 'string' && specifier[0] === '*' && self.config.aliases.length) {
          alias = _.findWhere(self.config.aliases, {name: specifier.slice(1)});
          if(alias) {
            loggedEvents = loggedEvents.concat(alias.expanded);
            if(_.isFunction(alias.match)) eventObjMatchers.push(_.bind(alias.match, alias));
          }
        }

        // String or Regexp event name specifier
        else {
          loggedEvents.push(_toRegExpString(specifier));
        }
      });

      this.loggedEvents = _.uniq(loggedEvents);

      if(xray.persistSettings) {
        xray.settings.loggedEvents = loggedEvents;
        xray.settings.eventSpecifiers = _stringifyEventSpecifiers(this.eventSpecifiers);
      }

      eventSpecifiersParsed = true;
    },

    validateEventSpecifiers: function() {
      if(!_isValidEventSpecifier.apply(this, this.eventSpecifiers)) {
        throw new Error('Specifier for types of events to log must be a String or RexExp.');
      }
    },

    isEventNameLogged: function(eventName) {
      var loggedPatterns = _.select(this.loggedEvents, _isPatternSpecifier),
          regexes = _.map(loggedPatterns, _patternStrToRegExp),
          eventNameMatches = function(regex) { return regex.test(eventName); };
      return _.isEmpty(loggedPatterns) || _.any(regexes, eventNameMatches);
    },

    isConstructorName: function(testStr) {
      return (typeof testStr === 'string' && testStr.match(/^[A-Z]/) !== null);
    },

    getLoggedConstructorNames: function() {
      return _.select(this.loggedEvents, this.isConstructorName);
    },

    isObjLogged: function(obj) {
      return this.isObjLoggedInstance(obj) || this.doesObjMatchAlias(obj);
    },

    isObjLoggedInstance: function(obj) {
       return _.any(this.getLoggedConstructorNames(), _.bind(_isInstanceOf, this, obj));
    },

    doesObjMatchAlias: function(obj) {
      var self = this;
      return _.any(this.eventObjMatchers, function(matcher) {
        return matcher(obj, self);
      });
    },

    isLoggingEventsFor: function(obj, eventName) {
      return this.isObjLogged(obj) && this.isEventNameLogged(eventName, obj);
    },

    addFormatters: function() {
      var self = this,
          addedFormatters = _wrapFormatters(_.toArray(arguments)),
          addedFormatterNames = _.pluck(addedFormatters, 'name'),
          formatterNames = _.pluck(this.config.formatters, 'name');

      _addFormatterFieldNames(addedFormatters);

      if(_.intersection(addedFormatterNames, formatterNames) != 0) {
        _.each(addedFormatterNames, function(formatterName) {
           var newFormatter = _.findWhere(addedFormatters, { name: formatterName }),
               oldFormatter = _.findWhere(self.config.formatters, { name: formatterName }),
               newFormatterFunctions = _.omit(newFormatter, name);
           _.extend(oldFormatter, newFormatterFunctions);
        });
      } else {
        this.config.formatters = this.config.formatters.concat(addedFormatters);
      }

    },

    getTypeOf: function (obj) {
      var constructors = this.config.constructors,
          constrName;

      for(constrName in constructors) {
        if(obj.constructor === constructors[constrName]) return constrName;
      }

      for(constrName in constructors) {
        if(obj instanceof constructors[constrName]) return constrName;
      }

      return 'Object';
    },

    getEntry: function(eventInfo) {
      var formatters = _formattersReversed(),
          defaultFormatter = _.findWhere(formatters, { name: 'default' }),
          i = formatters.length,
          formatter, matches;

      _bindAll(defaultFormatter);

      while(i--) {
        matches = _.bind(formatters[i].match, formatters[i])(xray, eventInfo);
        if(matches) {
          formatter = _bindAll(formatters[i]);
          return _.reduce(formatterFieldNames, function(entry, formatterName) {
            entry[formatterName] = _.partial(formatter[formatterName] || defaultFormatter[formatterName], xray, eventInfo);
            return entry;
          }, {});
        }
      }
    },

    addAliases: function() {
      this.config.aliases = _.union(this.config.aliases, _.toArray(arguments));
      this.config.aliases = _.map(this.config.aliases, _.bind(_expandEventAliases, this));
      this.parseEventSpecifiers();
    },

    log: function() {
      var logFunc = _.bind(this.config.log, this);
      logFunc.apply(this, arguments);
      this.log = logFunc;
      logFunc = _.throttle(logFunc, this.config.throttleTime);
    },

    util : util

  });


  // Alias these for semantic convenience
  xray.addFormatter = xray.addFormatters;
  xray.addAlias = xray.addAliases;

  if(persistedSettings) {
    xray.persistSettings = true;
  } else {
    xray.settings = null;
    xray.persistSettings = persistSettingsOpt;
  }

  // Start logging if persistSettings is true
  if(xray.eventSpecifiers.length) xray.startLogging();

  Backbone.focusOn      = _.bind(xray.focusOn, xray);
  Backbone.startLogging = _.bind(xray.startLogging, xray);
  Backbone.stopLogging  = _.bind(xray.stopLogging, xray);
  Backbone.pauseLogging = _.bind(xray.pauseLogging, xray);

  // Export the module to Backbone in the browser, and AMD and Node via return
  return (Backbone.xray = xray);

}));

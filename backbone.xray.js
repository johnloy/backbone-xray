(function(root, factory) {
	// Support AMD 
	if(typeof define === 'function' && define.amd) {
		define([ 'exports', 'backbone', 'underscore' ], factory);
	}
	// Support Node.js or CommonJS.
	else if(typeof exports === 'object') {
		factory(exports, require('backbone'), require('underscore'));
	}
	// Support browser global Backbone var. Use `root` here as it references `window`.
	else {
		factory(root, root.Backbone, root._);
	}
}(this, function( exports, Backbone, _) {

  var xray = { VERSION: '0.1.0' },
      SETTINGS_STORAGE_KEY = 'backbone.xray.settings',
      persistedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      persistSettingsOpt = persistedSettings ? true : false;

  Object.defineProperty(xray, 'persistSettings', {
    get: function() {
      return persistSettingsOpt;
    },
    set: function(persist) {
      if(persist) {
        initPersistedSettings();
      }
      else {
        destroyPersistedSettings();
      }
      persistSettingsOpt = persist;
      return persist;
    }
  });

  if(persistedSettings) {
    xray.settings = persistedSettings;
    initPersistedSettings();
    xray.persistSettings = true;
  } else {
    xray.persistSettings = persistSettingsOpt;
  } 

  function initPersistedSettings() {
    Object.defineProperty(xray, 'settings', {
      get: function() {
        var settings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
        if(!settings) settings = {};
        return settings;
      },
      set: function(settings) {
        var settingsSerialized = JSON.stringify(settings);
        localStorage.setItem(SETTINGS_STORAGE_KEY, settingsSerialized);
      }
    });

    xray.settings = xray.settings || {};
  };

  function destroyPersistedSettings() {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  }

  xray.applySetting = function(name, val) {
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





  var origTrigger = Backbone.Events.trigger,
      trigger     = origTrigger,
      eventSpecifiersParsed = false;

  Backbone.on('xray-logging-start', addInstrumentation);
  Backbone.on('xray-logging-stop' , removeInstrumentation);

  function addInstrumentation() {
    if(xray.config.instrumented) {
      _.each(xray.instrumented, function(obj) {
        obj.trigger = triggerWithLogging;
      });
    }
    Backbone.Model.prototype.trigger      =
    Backbone.Collection.prototype.trigger =
    Backbone.View.prototype.trigger       =
    Backbone.Router.prototype.trigger     = triggerWithLogging;
  }

  function removeInstrumentation() {
    if(xray.config.instrumented) {
      _.each(xray.instrumented, function(obj) {
        obj.trigger = origTrigger;
      });
    }
    Backbone.Model.prototype.trigger      =
    Backbone.Collection.prototype.trigger =
    Backbone.View.prototype.trigger       =
    Backbone.Router.prototype.trigger     = origTrigger;
  }

  function triggerWithLogging(eventName, data) {
    var self = this,
        timeElapsed = null;

    if( xray.isLoggingEventsFor.call(xray, this, eventName) &&
        !~eventName.indexOf('xray-logging')) {

      var firstTiming = window.performance.getEntriesByName('xray-taken').length === 0;

      if(!firstTiming) {
        timeElapsed =  window.performance.now() - _.last(window.performance.getEntriesByType('mark')).startTime;
      }
      window.performance.mark('xray-taken');

      var traceDetails = trace();
      _.defer(function() {
        xray.logEvent(self, eventName, data, traceDetails[0], traceDetails[1], timeElapsed);
      });
    }

    origTrigger.apply(this, arguments);
  }

  // This is totally based on Chrome's error stack implementation
  function trace(){

    try { throw Error(); }
    catch(err) {
      var stackLines = err.stack.split("\n").slice(4),
          relevantLine = _.find(stackLines, isRelevantLine),
          details = [];

      details[0] = "\n" + stackLines.join("\n");

      if(relevantLine) {
        var url = relevantLine.match(/\((.*)\)/);
        details[1] = url ? url[1] : undefined;
      }

      return details;
    }
  }

  function isRelevantLine(stackLine) {
   if( ~stackLine.indexOf('events.js') ||
       ~stackLine.indexOf('_base.js')) return false;
   return (/\/javascripts\//).test(stackLine);
  }


  var noop = function(){},
      eventSpecifiersParsed = false;

  var backboneConstructors = { 
    'Model'      : Backbone.Model,
    'Collection' : Backbone.Collection,
    'View'       : Backbone.View,
    'Router'     : Backbone.Router
  };

  function getBackboneTypeOf(obj) {
    var typeOf = '';
    _.find(backboneConstructors, function(constr, constrName) {
      var isInstance = obj instanceof constr;
      if(isInstance) typeOf = constrName;
      return isInstance;
    });
    return typeOf;
  }

  xray = _.extend(xray, {

    config: {
      instrumented : [],
      constructors : {},
      getTypeOf    : getBackboneTypeOf,
      formatters   : [],
      aliases      : []
    },

    configure: function(config) {
      _.extend(this.config, _.omit(config, 'aliases'));

      if(config.instrumented) addInstrumentation(config.instrumented);

      // Must use the addAliases method, because the aliases need to be parsed
      if(config.aliases) this.addAliases.apply(this, config.aliases);

      this.parseEventSpecifiers();
    },

    loggedEvents: (
      function initLoggedEvents() {
        var logSettings = xray.settings;
        if(logSettings && logSettings.loggedEvents) {
          return logSettings.loggedEvents;
        }
        return [];
      }()
    ),

    eventSpecifiers: (
      function initEventSpecifiers() {
        var logSettings = xray.settings;
        if(logSettings && logSettings.eventSpecifiers) {
          return logSettings.eventSpecifiers;
        }
        return [];
      }()
    ),

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
    * @method logEvents
    * @param {Object} context The object that will have its dependencies
    */
    logEvents: function() {

      if(_.isUndefined(arguments[0])) {
        this.stopLoggingEvents();
        return;
      }

      this.eventSpecifiers = _.toArray(arguments).sort(this.compareEventSpecifiers);
      this.validateEventSpecifiers();
      this.parseEventSpecifiers();
      this.startLoggingEvents();

      return this.loggedEvents;
    },

    startLoggingEvents: function() {
      if(this.eventSpecifiers.length === 0) {
        throw new Error('No event pattern specifiers have yet been provided. Call Backbone.xray.logEvents() \
                         with at least one argument before calling Backbone.xray.startLoggingEvents');
      }

      if(!eventSpecifiersParsed) {
        this.parseEventSpecifiers();
      };

      Backbone.trigger('xray-logging-start');
    },

    stopLoggingEvents: function() {
      Backbone.trigger('xray-logging-stop');
      this.loggedEvents = [];
      xray.removeSetting('loggedEvents');
    },

    pauseLoggingEvents: function() {
      Backbone.trigger('xray-logging-pause');
    },

    parseEventSpecifiers: function() {
      var self = this;
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
          loggedEvents.push(self.toRegExpString(specifier));
        }
      });

      this.loggedEvents = _.uniq(loggedEvents);

      if(xray.persistSettings) {
        xray.applySetting('loggedEvents', loggedEvents);
        xray.applySetting('eventSpecifiers', this.stringifyEventSpecifiers());
      }

      eventSpecifiersParsed = true;
    },

    validateEventSpecifiers: function() {
      if(!this.isValidEventSpecifier.apply(this, this.eventSpecifiers)) {
        throw new Error('Specifier for types of events to log must be a String or RexExp.');
      }
    },

    compareEventSpecifiers: function(a, b) {
      if( (_.isString(a) && a[0].match(/[A-Z]/)) ||
           _.isFunction(a) ) {
        return -1;
      }
      return 1;
    },

    stringifyEventSpecifiers: function() {
      var self = this;
      return _.map(this.eventSpecifiers, function(specifier) {
        if(specifier instanceof RegExp) return self.toRegExpString(specifier);
        return specifier;
      });
    },

    // We can't store RegExp objects in this.loggedEvents, as identical RegExp
    // instances aren't ===, so comparison's don't work (WTF ???)
    toRegExpString: function(pattern) {
      if(this.isPatternSpecifier(pattern.toString())) {
        return pattern.toString();
      }
      else {
        return '/' + pattern + '/';
      }
    },

    toRegExp: function(patternStr) {
      return RegExp(patternStr.slice(1,-1));
    },

    isValidEventSpecifier: function() {
      var self = this,
          specifiers = _.toArray(arguments);
      return _.all(specifiers, function(specifier) {
        return _.any( [ _.isString, _.isRegExp ],
          function(test) { return test(specifier); }
        );
      });
    },

    isPatternSpecifier: function(specifier) {
      return _.isString(specifier) && specifier[0] === '/';
    },

    isEventNameLogged: function(eventName) {
      var loggedPatterns = _.select(this.loggedEvents, this.isPatternSpecifier),
          regexes = _.map(loggedPatterns, this.toRegExp);
          eventNameMatches = function(regex) { return regex.test(eventName); };
      return _.isEmpty(loggedPatterns) || _.any(regexes, eventNameMatches);
    },

    isConstructorName: function(testStr) {
      return typeof testStr === 'string' && testStr.match(/^[A-Z]/);
    },

    isInstanceOf: function(obj, constr) {
      constr = typeof constr === 'function' ? constr : this.constructors[constr];
      if(typeof constr !== 'undefined') return (obj instanceof constr);
      return false;
    },

    getLoggedConstructorNames: function() {
      return _.select(this.loggedEvents, this.isConstructorName);
    },

    isObjLogged: function(obj) {
      return this.isObjLoggedConstructor(obj) || this.doesObjMatchAlias(obj);
    }, 

    isObjLoggedConstructor: function(obj) {
       return _.any(this.getLoggedConstructorNames(), _.partial(this.isInstanceOf, obj));
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

    defaultEventTitleFormat: function(eventInfo) {
      var self = this,
          label = null,
          obj = eventInfo.obj,
          strategies = [
            function getName() {
              var name = eventInfo.obj.name || _.isFunction(eventInfo.obj.get) ? obj.get('name') : undefined;
              return name ? self.config.getTypeOf(obj) + '(name: "' + name + '")' : undefined;
            },
            function getId() {
              var obj = eventInfo.obj,
                  idProp = obj.id ? 'id' : 'cid';
              return self.config.getTypeOf(obj) + '(' + idProp + ': ' + obj[idProp] + ')';
            }
          ].reverse(),
          i = strategies.length;

      while(i--) {
        label = strategies[i]();
        if(label) return label;
      }

    },

    addFormatters: function() {
      var formatters = _.toArray(arguments)
      this.config.formatters = this.config.formatters.concat(formatters);
    },

    getEventFormatter: function(eventInfo) {
      var formatters = this.config.formatters.reverse(),
          i = formatters.length,
          defaultTitleFormatter = _.bind(this.defaultEventTitleFormat, this),
          matches, title, prependLogContent, appendLogContent,
          formatTitleMethod, prependLogContentMethod, appendLogContentMethod;

      while(i--) {
        matches = formatters[i].match(eventInfo);
        if(matches) {
          title = formatters[i].formatTitle || defaultTitleFormatter;
          prependLogContent = formatters[i].prependLogContent || noop;
          appendLogContent = formatters[i].appendLogContent || noop;
          break;
        }
      }

      return {
        title: title || defaultTitleFormatter,
        prependLogContent: prependLogContent || noop,
        appendLogContent: appendLogContent || noop
      };
    },

    addAliases: function() {
      this.config.aliases = _.toArray(arguments);
      this.config.aliases = _.map(this.config.aliases, _.bind(this.expandEventAliases, this));
      this.parseEventSpecifiers();
    },

    expandEventAliases: function(alias) {
      var self = this;

      if(!alias.expanded) {
        alias.expanded = [alias.name];
      }

      while(this.containsUnexpandedAlias(alias.expanded)) {
        alias.expanded = _.chain(alias.expanded).map(function(expansion) {
          var unexpanded = ~expansion.indexOf('*'),
              resolveKey;
          if(unexpanded) {
            resolveKey = expansion.slice(1);
            return _.findWhere(self.config.aliases, {name: resolveKey}).expanded;
          }
          return expansion;
        }).flatten().uniq().value();
      }

      return alias;
    },

    containsUnexpandedAlias: function(expanded) {
      return ~(expanded.join('').indexOf('*'));
    },

    logEvent: function(obj, name, data, stack, location, timeElapsed) {
      var self = this, c = console, eventInfo;

      eventInfo = {
        obj: obj,
        name: name,
        data: data,
        stack: stack,
        location: location,
        timeElapsed: timeElapsed
      };

      var formatter = this.getEventFormatter(eventInfo);

      _.defer(_.bind(function(){
        if(xray.settings.logEventNameOnly) {
          c.log('Event: %s ❯ %s', formatter.title(eventInfo), name);
        }
        else {
          c.groupCollapsed('Event: %s ❯ %s', formatter.title(eventInfo), name);

            formatter.prependLogContent(eventInfo);

            c.log('Triggered on: ', obj);

            if(obj._events && obj._events[eventInfo.name]) {
              c.groupCollapsed('Listeners: ');

              _.each(obj._events[eventInfo.name], function(listener, i) {
                var funcStr = listener.callback.toString();
                var funcName = (function() {
                  var logRef = funcStr.match(/@logref\s(\w+#[a-zA-Z0-9_]+)/);
                  if(logRef) return logRef[1] + ':';
                }());

                c.groupCollapsed(funcName || '(anonymous): ');
                  console.log(listener.callback.toString());
                c.groupEnd();
              });

              c.groupEnd();
            }

            if(location) c.log('At (file:line): ', location);
            if(data) c.log('Data: ', data);
            if(timeElapsed) c.log('Time since previous event logged: ' + timeElapsed / 1000 + ' seconds');
            c.groupCollapsed('Call stack: ');
              c.log(stack);
            c.groupEnd();
            formatter.appendLogContent(eventInfo);
          c.groupEnd();
        }
      }, this));
    }

  });

  // Alias these for semantic convenience
  xray.addFormatter = xray.addFormatters;
  xray.addAlias = xray.addAliases;

  // Start logging if persistSettings is true
  if(xray.eventSpecifiers.length) xray.startLoggingEvents();

  // Export the module to Backbone in the browser, and AMD and Node via return
  return (Backbone.xray = xray);
});

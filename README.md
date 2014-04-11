Backbone-Xray
=============

A configurable event logger for Backbone apps. Log only events you care about, formatted the way you want, without any messy console.log calls in your code.

(NOTE: This README is a work in progress, and Backbone-Xray is still very alpha, so use at your own risk.)

Contents
-------
- [Introduction](#introduction)
- [Features](#features)
- [Installing](#installing)
- [Getting Started](#getting-started)
- [Configuring](#configuring)
- [Command API](#command-api)
- [Caveats](#caveats)
- [Making Your App More "Loggable"](#making-your-app-more-loggable)
- [Browser Support](#browser-support)
- [Release Notes](#release-notes)
- [Authors](#authors)
- [Contributing](#contributing)
- [Acknowledgements](#acknowledgements)
- [Copyright and License](#copyright-and-license)

Introduction
------------

In Backbone applications that make heavy use of custom events, it can be challenging to understand the linear flow of logic resulting from many events having multiple event listeners each. This is especially true for applications divided into many files. If an object in one file triggers an event for which methods in other files listen, that full set of relationships is not apparent by reading only one or a few of the the files involved. Furthermore, the final order in which all listener callbacks are invoked is usually not obvious. Add to this already uncertain situation the unpredictable timing of asynchronous Backbone events in models and collections, and development and debugging can become a murky guessing game.

To confidently work on a sophisticated event-driven app, it helps to have a full grasp of the effect of triggering any event. Though it's possible to do this by manually by littering code with scattered console.log calls, that approach is messy and bound to be uncomprehensive.

Backbone-Xray provides the ability to log to the console and inspect the linear flow of events and method calls in a Backbone application without the need to manually insert console.log statements. With it, events triggered on any object that extends Backbone.Model, Backbone.Collection, Backbone.View, or Backbone.Router, in addition to potentially any method on any object (even non-Backbone), can be logged and formatted exactly to your liking and needs. Crucial aspects of an event, like the name, triggering object, and listeners can also be included in a log entry to provide context beyond the simple sequence of events. 

The configuration options provided by Backbone-Xray let you limit your logging to only the events you want to capture, and to format the contents and appearance of log entries to suit your needs.

Features
------------

* Uses console.log under the hood, but without requiring actual insertion of statements into code
* Designed to avoid slowing your app down, as much as is possible
* Interactive Javascript console api for activation toggling, configuring, and operating
* Remains dormant and imposes no processing overhead by default until activated from the JS console
* Once activated, optionally persists active state and settings on page reloads (uses localStorage)
* If the console supports console.group, log entries are collapsed console groups containing useful information about event context
* Console groups with extra information are optional (runs faster without them)
* By default, log entries include:
  * Backbone constructor name (e.g. Model, Collection, View, or Router)
  * Backbone id or cid, if either exists
  * Event name
  * Triggering object (inspectable in the browser)
  * Listeners, in order of registration/execution (function body viewable in the browser)
  * File and line number (links directly to source in some browser dev tools)
  * Event data payload (inspectable in the browser)
  * Sub-millisecond ellapsed time since the last event logged (if browser supports the HTML5 User Timing API)
  * Call stack, up to the point where an event was triggered
* Most log entry data fields listed above are optional
* Presentation of log entries are configurable with custom formatting logic
* Log only events triggered on specified objects matching specified substring or regex patterns
* Alias arbitrarily complex sets of object and event name specifiers for less typing in the console (useful for focusing only on code for a specific flow)
* Instrument all or only certain methods on specified objects for logging

Installing
----------

### Download and install manually

### Download with Bower

```bash
$ bower install --save backbone-xray
```

### Download with NPM

Currently, the usefulness of Backbone-Xray out of a browser context is unclear, as it's primarily for observing the realtime flow of events as an app runs. With the advent of server-side execution of Backbone apps using something like [Rendr](https://github.com/rendrjs/rendre), however, there might eventually be an attempt to develop a Node REPL flavor of Backbone-Xray.

For now, you're welcome to install this as an npm module -- it includes CommonJS support -- but there's really not much value in doing so other than begin able to play with the command API in a REPL. Of course, the better way to do that right now is just to load it up in an HTML file in a browser.

### Adding it to your app

It goes without saying that to use Backbone-Xray, you need an existing Backbone app. Just include backbone-xray.js after jQuery, Underscore, and Backbone have loaded, whether that be via a script tag, an AMD loader, or otherwise. Ideally, backbone-xray.js should be loaded before your app has initialized, though that's not strictly necessary. The reasons for this are detailed under [Configuring](#configuring) .

```javascript
<script src="bower_components/backbone-xray/backbone-xray.js"></script>
```

```javascript
require(['backbone', 'backbone-xray'], function(Backbone, BbXray) {
  // App
})
```

Backbone-Xray monkey-patches the [Backbone.Events.trigger](http://backbonejs.org/docs/backbone.html#section-22) method to inject logging logic, so it's important that it load after the whole Backbone dependency stack. This hijacking of Backbone.Events.trigger only happens after activating logging from the command line, so there's no imposition on your app's processing until absolutely necessary.

Getting Started
---------------

### Logging all Backbone events

To activate logging of all events triggered by objects extending Backbone.Model, Backbone.Collection, Backbone.View, or Backbone.Router, open the dev tools JS console and type:

```javascript
Backbone.logEvents('*backbone')
```

Then, start interacting with your app and watch the console.

### Specifying the objects whose events should be logged 

The `*backbone` string passed as an argument is one possible form of an "event specifier". See [Configuring](#configuring) below to learn about event specifiers. Specifically, `*backbone` is an alias or shorthand form of specifier (aliases begin with an asterix) that expands to other specifiers: _Model_, _Collection_, _View_, and _Router_. So, the code above is equivalent to typing:

```javascript
Backbone.logEvents('Model', 'Collection', 'View', 'Router')
```

As an aside, `Backbone.logEvents()` with no arguments, as well as `Backbone.logEvents('*')`, are equivalent to this expansion as well.

You'll notice these arguments are the names of the four main Backbone constructor functions under the _Backbone_ namespace. Backbone-Xray provides the ability to limit logged events to only those triggered by instances of specified constructors. So, as you might guess, you could choose to only log model events by typing:

```javascript
Backbone.logEvents('Model')
```

Notice that the argument is a string, not a function reference, and that the string begins with a capital letter. The initial capital letter in an argument clues in Backbone-Xray to the fact that the argument is intended to directly indicate a constructor function. This is because it's [idiomatic in Javascript](https://github.com/rwaldron/idiomatic.js/#naming) to name constructors using PascalCase. 

Backbone-Xray internally knows the string 'Model' means instances of Backbone.Model. Likewise for the other three Backbone constructors. In addition to understanding the '*backbone' alias and these four constructor names, a special '*backbone-data' alias is also understood "out of the box", to provide a quick way to monitor events for only models and collections. This is convenient for observing activity related to [Backbone.Sync](http://backbonejs.org/#Sync).

### Specifying by name which events should be logged 

After specifying the objects whose events you wish to log, you can further limit logging to only events whose name matches a certain substring or regular expression.

```javascript
Backbone.logEvents('Model', 'change:foo', /change:ba$/) // matches change:bar and change:baz
```

### Specifying both objects and event names together

Both object and event name specifiers live harmoniously side-by-side as arguments as long as your event names don't begin with a capital letter and your constructor names do.

```javascript
Backbone.logEvents('Model', 'change:foo', /change:ba$/)
```

This terse argument style of configuration, in addition to specifier aliasing, keeps the console typing ceremony to a minimum when activating/configuring logging. The alternative would be a punctuation-heavy object literal argument style, which Backbone-Xray's author (cough) simply thinks is just too much clickity clack.

Just as any number of object specifiers can be passed as arguments to logEvents, any number of event name specifiers can as well, but there's really no need to go crazy with arguments when you can define alias expansions.

One unfortunate compromise that had to be made to accommodate side-by-side object and event name specifiers is that objects can't be specified in a logEvents argument using a regular expression. There isn't an easy way to know whether the RegExp should be matched against a constructor name or event name. If you really want to do this, something approximating it can currently be accomplished using a `match` method on an alias. Just do the regular expression matching in the match function.

When both object and event name specifiers are provided, only events matching at least one specified object AND one specified event name pattern will be logged. They act in tandem as compound filters.


Configuring
-----------

Command API
-----------

Caveats
---------------

Browser Support
---------------


Making Your App More "Loggable"
-------------------------------

You can help make Backbone-Xray a little more configurable and informative through a few coding practices.

### Expose invisible constructors

In order for the logEvents method to be able to understand what is meant by an event specifier like "TodoModel", you need to supply a `constructors` config option whose value is an object that maps that string to a constructor function reference. Such a map can be difficult to create if your constructor functions can't be referenced because they are locked inside a closure somewhere. Do yourself a favor and expose or "export" these functions to some sort of namepspace. A common idiom is to create a single global variable that functions as a global app namespace, which is what's done in the TodoMVC Backbone example app. An app namespace is a fine place to export your constructors. After that's done, you can configure Backbone-Xray more easily.

```javascript
Backbone.xray.configure({
  constructors: {
    'AppView'         : app.AppView,
    'TodoView'        : app.TodoView,
    'TodoRouter'      : app.TodoRouter,
    'TodoModel'       : app.TodoModel,
    'TodosCollection' : app.TodosCollection
  }
});
```

### Name your methods

A common pattern in Backbone applications is to use an object literal to define prototype properties and methods for custom Backbone "classes" (forgive my use of the word here). 

```javascript
app.AppView = Backbone.View.extend({

  initialize: function() {
    // I don't have a name
  },

  render: function() {

  }

});
```

This looks tidy, but results in methods on instances of these classes not knowing their name; they're anonymous functions, after all. Javascript provides an easy way to name a function, by using either a function declaration or [named function expression'(http://kangax.github.io/nfe/). Once named, you can easily get a function name with `[function reference].name`. So, you could name your Backbone class methods like this:

```javascript
app.AppView = Backbone.View.extend({

  initialize: function initialize() {
    // I have a name
  },

  render: function render() {

  }

});
```

If you did so, Backbone.Xray will be able to report the names of functions that listen to logged events. Extremely handy! Unfortunately, this syntax appears redundant to developer eyes hungry for syntactic elegance. The alternatives are to either use the conventional anonymous function pattern and pre-process your code with something like [Sweet.js](http://sweetjs.org/) or [Grasp](http://graspjs.com/) to dynamically insert the function name, or to annotate your functions with a comment that Backbone-Xray understands. By default, if Backbone-Xray sees a string like "@name funcName" (no quotes) inside the body of a function (through the magic of Function.prototype.toString) it will parse out the funcName part and consider that the function name. Luckily, this style of annotation is in keeping with the commonly used JSDoc and YUIDoc annotation syntaxes. As long as you're already using either of those, you might as well include the @name annotation. It couldn't hurt, and just somehow doesn't feel as awful as repeating a function name in an object literal property assignment. Beware that most minifiers will strip out the annotation, however, rendering this technique only suitable for development (pre-build).


Release Notes
-------------

Authors
-------------

* [John Loy](https://github.com/johnloy/)

Contributing
-----------

Acknowledgements
----------------

Copyright and License
---------------------
Copyright (c) 2014 John Loy

Distributed under The MIT License (MIT)


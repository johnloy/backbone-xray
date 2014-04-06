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
- [Browser Support](#browser-support)
- [Release Notes](#release-notes)
- [Authors](#authors)
- [Contributing](#contributing)
- [Acknowledgements](#acknowledgements)
- [Copyright and License](#copyright-and-license)

Introduction
------------

In non-trivial Backbone applications that make heavy use of custom events, it can be challenging to understand the linear flow of logic resulting from many events having multiple event listeners each. This is especially true for applications divided into many files. If an object in one file triggers an event for which other objects in other files listen, that full set of relationships is not apparent by reading only one or a few of the the files involved. Furthermore, the final order in which listener callbacks are invoked is usually not obvious. Add to this already uncertain situation the unpredictable timing of asynchronous XHR-related 'sync', 'reset', 'change', and 'error' Backbone events, and development and debugging becomes a murky guessing game.

To confidently work on a sophisticated event-driven app, it helps to have a full grasp of the effect of triggering any event. Doing this by manually littering code with scattered console.log calls is messy and bound to be uncomprehensive.

Backbone-Xray provides the ability to log and inspect the linear flow of select events and method calls in a Backbone application, without the need to manually insert console.log statements. With it, events triggered on any object that extends Backbone.Events, in addition to potentially any method on any object (even non-Backbone), can be logged and formatted exactly to your liking and needs. Crucial aspects of an event, like the name, triggering object, and listeners can also be included in a log entry to provide context beyond the simple sequence of events. The configuration options provided by Backbone-Xray let you limit your logging to only what you want to capture.

Features
------------

* Uses console.log under the hood, but without requiring actual insertion of statements into code
* Designed to avoid slowing your app down, as much as is possible
* Interactive Javascript console api for activation toggling, configuring, and operating
* Remains dormant and imposes no processing overhead by default until activated from the JS console
* Once activated, optionally persists active state and settings on page reloads (browser only; uses localStorage)
* Log entries are collapsed console groups, if the console supports grouping, containing useful information about event context
* Console groups with extra information are optional (runs faster without them)
* Log entries by default include: 
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

### Bower

### NPM

Getting Started
---------------

Configuring
-----------

Command API
-----------

Caveats
---------------

Browser Support
---------------

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


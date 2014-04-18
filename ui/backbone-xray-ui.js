(function(Backbone, window){

  if(typeof Backbone !== 'object') {
    console.warn('Backbone must be loaded before backbone-xray-ui.js');
    return;
  }

  var xray, ui, thisScript, thisUri;

  xray = Backbone.xray = Backbone.xray || {};
  ui = xray.ui = {};

  thisScript = document.querySelector('script[src*="/backbone-xray-ui"]').src;
  thisUri = xray.util.parseUri(thisScript);

  ui.help = {

   helpContents: '',

   show: function() {
     this.drawOverlay();
     this.insertContents();
   },

   drawOverlay: function() {
     this.$overlay = $('<div />').css({
       backgroundColor: 'rgba(0, 0, 0, .8)',
       position: 'fixed',
       width: '100%',
       height: '100%',
       top: 0,
       left: 0,
       zIndex: 10000,
       display: 'none',
       color: '#fff',
     }).appendTo('body').fadeIn(500);
   },

   insertContents: function() {
     this.$helpContents = $('<div />').css({
       maxWidth: '720px',
       margin: '0 auto'
     }).append(this.helpContents + this.generateDocs()).appendTo(this.$overlay);
   },

   generateDocs: function() {
     return _.functions(xray).join(', ');
   }
 };

 _.bindAll(ui.help, 'show');


 var initView = thisUri.params['init_view'];

 if(initView) {
   ui[initView].show();
 } else {
   ui.help.show();
 }

}(Backbone, window));

/**
 * Image.js
 *
 * Copyright 2012, Moxiecode Systems AB
 * Released under GPL License.
 *
 * License: http://www.plupload.com/license
 * Contributing: http://www.plupload.com/contributing
 */

// JSLint defined globals
/*global window:false, escape:false */

/*
depends on:
- mOxie.js
- Exceptions.js
- Util.js
- I18N.js
- EventTarget.js
- Runtime.js
*/

;(function(window, document, o, undefined) {
	
var x = o.Exceptions;

o.Image = (function() {
	var dispatches = ['loadstart', 'progress', 'load', 'error', 'loadend', 'resize', 'embedded'];
	
	function Image() {
		var self = this;
			
		o.RuntimeClient.call(this);
		
		o.extend(this, {
			
			uid: o.guid('uid_'),

			ruid: null,
			
			name: "",
			
			size: 0,

			width: 0,

			height: 0,
			
			type: "",

			meta: {},

			clone: function() {
				this.load.apply(this, arguments);
			},

			load: function(src, options) {
				var el, url, urlp;

				this.convertEventPropsToHandlers(dispatches);	

				if (src instanceof o.Image) {
					if (!src.size) { // only preloaded image objects can be used as source
						throw new x.DOMException(x.DOMException.INVALID_STATE_ERR);	
					}
					_loadFromImage.apply(this, arguments);
				} 
				else if (src instanceof o.File || src instanceof o.Blob) {
					_loadFromBlob.apply(this, arguments);
				} 
				else if (o.typeOf(src) === 'string' && /^http:\/\//.test(src)) {
					_loadFromUrl.apply(this, arguments);
				} 
				else if (el = o(src) && el.nodeName === 'img') {
					urlp = o.parseUrl(el.src); // src can be relative

					// manually resolve the url
					url = urlp.scheme + '://' + urlp.host + (urlp.port !== 80 ? ':' + urlp.port : '') + urlp.path;

					_loadFromUrl.call(this, url, options);
				} 
				else {
					throw new x.DOMException(x.DOMException.TYPE_MISMATCH_ERR);	
				}
			},

			resize: function(width, height, crop) {
				var runtime;

				if (!this.size) { // only preloaded image objects can be used as source
					throw new x.DOMException(x.DOMException.INVALID_STATE_ERR);	
				}

				if (!width) {
					throw new x.DOMException(x.DOMException.SYNTAX_ERR);	
				}

				if (!height) {
					height = width;
				}

				runtime = this.connectRuntime(this.ruid);
				self.bind('Resize', function(e, info) {
					_updateInfo.call(this, info);
				}, 999);
				runtime.exec.call(self, 'Image', 'resize', width, height, (crop === undefined ? false : crop));
			},

			crop: function(width, height) {
				this.resize(width, height, true);
			},

			getAsCanvas: function() {
				if (!o.ua.can('create_canvas')) {
					throw new x.RuntimeError(x.RuntimeError.NOT_SUPPORTED_ERR);	
				}

				var runtime = this.connectRuntime(this.ruid);
				return runtime.exec.call(self, 'Image', 'getAsCanvas');
			},

			getAsImage: function() {
				var runtime = this.connectRuntime(this.ruid);
				return runtime.exec.call(self, 'Image', 'getAsImage');
			},

			getAsBlob: function(type, quality) {
				if (!type) {
					type = 'image/jpeg';
				}

				if (type === 'image/jpeg' && !quality) {
					quality = 90;
				}

				if (!this.ruid) {
					throw new x.RuntimeError(x.RuntimeError.NOT_INIT_ERR);	
				}

				runtime = this.connectRuntime(this.ruid);
				return runtime.exec.call(self, 'Image', 'getAsBlob', type, quality);
			},

			getAsDataURL: function(type, quality) {
				var runtime = this.connectRuntime(this.ruid);
				return runtime.exec.call(self, 'Image', 'getAsDataURL', type, quality);
			},


			getAsBinaryString: function(type, quality) {
				var blob, frs;
				
				blob = this.getAsBlob(type, quality);
				
				frs = new o.FileReaderSync;
				return frs.readAsBinaryString(blob);
			},

			embed: function(el) {
				var image, type, quality, dimensions
				, options = arguments[1] || {}
				, width = this.width
				, height = this.height
				, runtime // this has to be outside of all the closures to contain proper runtime
				;

				function onResize() {
					var dataUrl, type = type || this.type || 'image/jpeg';

					// if possible, embed a canvas element directly
					if (o.ua.can('create_canvas')) {
						var canvas = image.getAsCanvas();
						if (canvas) {
							el.appendChild(canvas);
							canvas = null;
							image.destroy();
							self.trigger('embedded');
							return;
						}
					} 

					dataUrl = image.getAsDataURL(type, quality);

					if (o.ua.can('use_data_uri_of', image.size)) {
						el.innerHTML = '<img src="' + dataUrl + '" width="' + image.width + '" height="' + image.height + '" />';
						image.destroy();
						self.trigger('embedded');
					} else {
						var tr = new o.Transporter;

						tr.bind("TransportingComplete", function() {
							runtime = self.connectRuntime(this.result.ruid);
						
							self.bind("Embedded", function() {
								// position and size properly
								o.extend(runtime.getShimContainer().style, {
									//position: 'relative',
									width: image.width + 'px',
									height: image.height + 'px'
								});

								// some shims (Flash/SilverLight) reinitialize, if parent element is hidden, reordered or it's 
								// position type changes (in Gecko), but since we basically need this only in IEs 6/7 and 
								// sometimes 8 and they do not have this problem, we can comment this for now
								/*tr.bind("RuntimeInit", function(e, runtime) {
									tr.destroy();
									runtime.destroy();
									onResize.call(self); // re-feed our image data
								});*/
							}, 999);

							runtime.exec.call(self, "ImageView", "display", this.result.getSource().id, width, height);
							image.destroy();
						});

						tr.transport(o.atob(dataUrl.substring(dataUrl.indexOf('base64,') + 7)), type, o.extend({}, options, {
							required_caps: {
								display_media: true
							},
							container: el
						}));
					}
				}

				if (!(el = o(el))) {
					throw new x.DOMException(x.DOMException.INVALID_NODE_TYPE_ERR);	
				}

				if (!this.size) { // only preloaded image objects can be used as source
					throw new x.DOMException(x.DOMException.INVALID_STATE_ERR);	
				}


				type = options.type;
				quality = options.quality || 90;
				crop = options.crop !== undefined ? options.crop : false;

				// figure out dimensions for the thumb
				if (options.width) {
					width = options.width;
					height = options.height || width;
				} else {
					// if container element has > 0 dimensions, take them
					dimensions = o.getSize(el);
					if (dimensions.w && dimensions.h) { // both should be > 0
						width = dimensions.w;
						height = dimensions.h;
					}
				}
				
				image = new o.Image;

				image.bind("Resize", function() {
					onResize.call(self);
				});

				image.bind("Load", function() {
					image.resize(width, height, crop);
				});

				image.clone(this, false);					

				return image;	
			},

			destroy: function() {
				if (this.ruid) {
					var runtime = this.connectRuntime(this.ruid);
					runtime.exec.call(self, 'Image', 'destroy');
				}
				this.unbindAll();
			},
			
			constructor: o.Image
		});


		o.defineProperty(this, 'src', {
			configurable: false,

			set: function(src) {
				this.load(src);
			}
		});

		
		this.bind('load', function(e, info) {
			_updateInfo.call(this, info);
		}, 999);


		function _updateInfo(info) {
			if (!info) {
				info = this.connectRuntime(this.ruid).runtime.exec.call(this, 'Image', 'getInfo');
			}

			if (info) {
				if (o.typeOf(info.meta) === 'string') { // might be a JSON string
					try {
						this.meta = o.JSON.parse(info.meta);
					} catch(ex) {}
				}
			}

			o.extend(this, { // info object might be non-enumerable (as returned from SilverLight for example)
				size: info.size,
				width: info.width,
				height: info.height,
				name: info.name,
				type: info.type
			});
		}


		function _loadFromImage(img, exact) {
			var runtime = this.connectRuntime(img.ruid);
			this.ruid = runtime.uid;
			runtime.exec.call(self, 'Image', 'loadFromImage', img, (exact === undefined ? true : exact));
		}


		function _loadFromBlob(blob, asBinary) {
			var runtime = this.connectRuntime(blob.ruid);
			this.ruid = runtime.uid;
			runtime.exec.call(self, 'Image', 'loadFromBlob', blob.getSource(), asBinary);
		}

		function _loadFromUrl(url, options) {
			var xhr;

			xhr = new o.XMLHttpRequest;

			xhr.open('get', url);
			xhr.responseType = 'blob';

			xhr.onprogress = function(e) {
				self.trigger(e);
			};

			xhr.onload = function() {
				_loadFromBlob.call(self, xhr.response);
			};

			xhr.onerror = function(e) {
				self.trigger(e);
			};

			xhr.onloadend = function() {
				self.trigger('onloadend');
				xhr.unbindAll();
			};

			self.trigger('loadstart');
			xhr.send(null, options);
		}
	}
	
	Image.prototype = o.eventTarget;
	
	return Image;
}());


o.ImageEditor = (function() {

	function ImageEditor(image) {
		var self = this,
			ops = "rotate flipH flipV resize crop sharpen emboss".split(/\s+/);

		if (!image || !image.size) { // only preloaded image objects can be used as source
			throw new x.DOMException(x.DOMException.TYPE_MISMATCH_ERR);	
		}

		o.RuntimeClient.call(this);

		o.each(ops, function(op) {
			self[op] = function() {
				var runtime;
				
				if (!this.ruid) {
					throw new x.RuntimeError(x.RuntimeError.NOT_INIT_ERR);	
				}

				runtime = this.connectRuntime(this.ruid);
				runtime.exec.call(self, 'ImageEditor', op);	

				return self; // support chaining
			};
		});

	}

	return ImageEditor;
}());

	
}(window, document, mOxie));
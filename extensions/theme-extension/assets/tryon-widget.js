(function () {
  'use strict';

  var PROXY_BASE = '/apps/try-on';
  var MAX_MB = 10;
  var TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

  var EU_CODES = [
    'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR',
    'HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI',
    'SK','IS','LI','NO'
  ];

  var CONSENT_TEXT = {
    BIPA: 'To process your virtual try-on, we capture a temporary image of you and use it solely to generate your outfit preview. Your photo is deleted from our servers immediately after your result is delivered — we never store, share, or sell it.',
    GDPR: 'Under GDPR, your photo is processed as personal data for the sole purpose of generating your try-on result. It is deleted immediately after delivery and will never be retained, shared with third parties, or used for any other purpose.',
    CCPA: 'As a California resident under CCPA, you have the right to know how your data is used: your photo is used only to create your outfit preview and is permanently deleted once your result is ready. We do not sell your personal information.',
    CUBI: 'Under Texas biometric law, we collect a temporary image solely to generate your virtual try-on result. Your photo is immediately and permanently deleted after your result is delivered, and we do not share or retain biometric data.',
    GENERAL: 'Your photo is used only to generate your virtual try-on preview and is deleted from our servers the moment your result is ready. We never store, share, or use your image for any purpose beyond this single try-on session.'
  };

  function getJurisdiction(country) {
    if (country === 'IL') return 'BIPA';
    if (country === 'CA') return 'CCPA';
    if (country === 'TX') return 'CUBI';
    if (EU_CODES.indexOf(country) !== -1) return 'GDPR';
    return 'GENERAL';
  }

  function TryOnWidget(button) {
    this.button = button;
    this.productId = button.getAttribute('data-tryon-product-id');
    this.shop = button.getAttribute('data-tryon-shop');
    this.buttonColor = button.getAttribute('data-tryon-color') || '#000000';
    this.country = button.getAttribute('data-tryon-country') || '';
    this.jurisdiction = getJurisdiction(this.country);

    // State
    this.file = null;
    this.uploadId = null;
    this.resultUrl = null;
    this.consentTimestamp = null;
    this._progressInterval = null;
    this._progressValue = 0;
    this._overlay = null;
    this._panel = null;
  }

  TryOnWidget.prototype.init = function () {
    var self = this;

    // Overlay
    var overlay = document.createElement('div');
    overlay.className = 'tryon-overlay';
    this._overlay = overlay;

    // Panel
    var panel = document.createElement('div');
    panel.className = 'tryon-panel';
    panel.style.setProperty('--tryon-color', this.buttonColor);
    this._panel = panel;

    // Close button
    var closeBtn = document.createElement('button');
    closeBtn.className = 'tryon-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&#x2715;';
    panel.appendChild(closeBtn);

    // Inner wrapper
    var inner = document.createElement('div');
    inner.className = 'tryon-panel-inner';
    panel.appendChild(inner);

    // Build steps
    inner.appendChild(this._buildConsentStep());
    inner.appendChild(this._buildUploadStep());
    inner.appendChild(this._buildLoadingStep());
    inner.appendChild(this._buildResultStep());
    inner.appendChild(this._buildErrorStep());

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    // Events
    closeBtn.addEventListener('click', function () { self.close(); });
    overlay.addEventListener('click', function () { self.close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { self.close(); }
    });

    // Consent
    panel.querySelector('[data-tryon-agree]').addEventListener('click', function () {
      self.consentTimestamp = new Date().toISOString();
      self.showStep('upload');
    });
    panel.querySelector('[data-tryon-decline]').addEventListener('click', function () {
      self.close();
    });

    // File input
    var fileInput = panel.querySelector('.tryon-dropzone-input');
    fileInput.addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) {
        self.handleFile(e.target.files[0]);
      }
    });

    // Drop zone
    var dropzone = panel.querySelector('.tryon-dropzone');
    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropzone.classList.add('dragging');
    });
    dropzone.addEventListener('dragleave', function () {
      dropzone.classList.remove('dragging');
    });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('dragging');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        self.handleFile(e.dataTransfer.files[0]);
      }
    });

    // Submit
    panel.querySelector('[data-tryon-submit]').addEventListener('click', function () {
      self.process();
    });

    // Try again buttons (result + error)
    var tryAgainBtns = panel.querySelectorAll('[data-tryon-try-again]');
    for (var i = 0; i < tryAgainBtns.length; i++) {
      tryAgainBtns[i].addEventListener('click', function () {
        self.showStep('upload');
      });
    }

    // Share
    panel.querySelector('[data-tryon-share]').addEventListener('click', function () {
      self.share();
    });
  };

  TryOnWidget.prototype._buildConsentStep = function () {
    var step = document.createElement('div');
    step.className = 'tryon-step tryon-consent-step';
    step.setAttribute('data-step', 'consent');

    var title = document.createElement('h2');
    title.className = 'tryon-consent-title';
    title.textContent = 'Virtual Try-On';

    var body = document.createElement('p');
    body.className = 'tryon-consent-body';
    body.setAttribute('data-tryon-consent-text', '');

    var actions = document.createElement('div');
    actions.className = 'tryon-consent-actions';

    var agree = document.createElement('button');
    agree.className = 'tryon-btn-primary';
    agree.setAttribute('data-tryon-agree', '');
    agree.textContent = 'I Agree — Try It On';

    var decline = document.createElement('button');
    decline.className = 'tryon-btn-secondary';
    decline.setAttribute('data-tryon-decline', '');
    decline.textContent = 'No Thanks';

    actions.appendChild(agree);
    actions.appendChild(decline);
    step.appendChild(title);
    step.appendChild(body);
    step.appendChild(actions);
    return step;
  };

  TryOnWidget.prototype._buildUploadStep = function () {
    var step = document.createElement('div');
    step.className = 'tryon-step';
    step.setAttribute('data-step', 'upload');
    step.setAttribute('hidden', '');

    var dropzone = document.createElement('div');
    dropzone.className = 'tryon-dropzone';

    var icon = document.createElement('div');
    icon.className = 'tryon-dropzone-icon';
    icon.textContent = '📷';

    var label = document.createElement('div');
    label.className = 'tryon-dropzone-label';
    label.innerHTML = 'Drag your photo here<br>or click to choose';

    var input = document.createElement('input');
    input.type = 'file';
    input.className = 'tryon-dropzone-input';
    input.accept = TYPES.join(',');

    dropzone.appendChild(icon);
    dropzone.appendChild(label);
    dropzone.appendChild(input);

    var previewWrap = document.createElement('div');
    previewWrap.className = 'tryon-preview-wrap';
    var preview = document.createElement('img');
    preview.className = 'tryon-preview';
    preview.alt = 'Preview';
    previewWrap.appendChild(preview);

    var submit = document.createElement('button');
    submit.className = 'tryon-btn-primary';
    submit.setAttribute('data-tryon-submit', '');
    submit.textContent = 'Try It On \u2192';
    submit.disabled = true;
    submit.style.opacity = '0.4';

    var privacy = document.createElement('p');
    privacy.className = 'tryon-privacy-note';
    privacy.textContent = 'Your photo is used only for this try-on and deleted immediately.';

    step.appendChild(dropzone);
    step.appendChild(previewWrap);
    step.appendChild(submit);
    step.appendChild(privacy);
    return step;
  };

  TryOnWidget.prototype._buildLoadingStep = function () {
    var step = document.createElement('div');
    step.className = 'tryon-step tryon-loading-step';
    step.setAttribute('data-step', 'loading');
    step.setAttribute('hidden', '');

    var spinner = document.createElement('div');
    spinner.className = 'tryon-spinner';

    var text = document.createElement('p');
    text.className = 'tryon-loading-text';
    text.setAttribute('data-tryon-loading-text', '');
    text.textContent = 'Getting ready\u2026';

    var track = document.createElement('div');
    track.className = 'tryon-progress-track';
    var bar = document.createElement('div');
    bar.className = 'tryon-progress-bar';
    bar.setAttribute('data-tryon-progress', '');
    track.appendChild(bar);

    step.appendChild(spinner);
    step.appendChild(text);
    step.appendChild(track);
    return step;
  };

  TryOnWidget.prototype._buildResultStep = function () {
    var step = document.createElement('div');
    step.className = 'tryon-step tryon-result-step';
    step.setAttribute('data-step', 'result');
    step.setAttribute('hidden', '');

    var img = document.createElement('img');
    img.className = 'tryon-result-img';
    img.alt = 'Your virtual try-on result';
    img.setAttribute('data-tryon-result-img', '');

    var actions = document.createElement('div');
    actions.className = 'tryon-result-actions';

    var share = document.createElement('button');
    share.className = 'tryon-btn-primary';
    share.setAttribute('data-tryon-share', '');
    share.textContent = 'Share Look';

    var tryAgain = document.createElement('button');
    tryAgain.className = 'tryon-btn-secondary';
    tryAgain.setAttribute('data-tryon-try-again', '');
    tryAgain.textContent = 'Try Another Photo';

    actions.appendChild(share);
    actions.appendChild(tryAgain);
    step.appendChild(img);
    step.appendChild(actions);
    return step;
  };

  TryOnWidget.prototype._buildErrorStep = function () {
    var step = document.createElement('div');
    step.className = 'tryon-step tryon-error-step';
    step.setAttribute('data-step', 'error');
    step.setAttribute('hidden', '');

    var icon = document.createElement('div');
    icon.className = 'tryon-error-icon';
    icon.textContent = '\u26A0\uFE0F';

    var title = document.createElement('p');
    title.className = 'tryon-error-title';
    title.textContent = 'Something went wrong';

    var msg = document.createElement('p');
    msg.className = 'tryon-error-msg';
    msg.setAttribute('data-tryon-error-msg', '');

    var retry = document.createElement('button');
    retry.className = 'tryon-btn-secondary';
    retry.setAttribute('data-tryon-try-again', '');
    retry.textContent = 'Try Again';

    step.appendChild(icon);
    step.appendChild(title);
    step.appendChild(msg);
    step.appendChild(retry);
    return step;
  };

  TryOnWidget.prototype.open = function () {
    // Populate consent text
    var consentEl = this._panel.querySelector('[data-tryon-consent-text]');
    if (consentEl) {
      consentEl.textContent = CONSENT_TEXT[this.jurisdiction];
    }
    this.showStep('consent');
    this._overlay.classList.add('tryon-visible');
    this._panel.classList.add('tryon-visible');
    document.body.style.overflow = 'hidden';
  };

  TryOnWidget.prototype.close = function () {
    this._overlay.classList.remove('tryon-visible');
    this._panel.classList.remove('tryon-visible');
    document.body.style.overflow = '';
    this._reset();
  };

  TryOnWidget.prototype._reset = function () {
    this.file = null;
    this.uploadId = null;
    this.resultUrl = null;
    this.consentTimestamp = null;
    if (this._progressInterval) {
      clearInterval(this._progressInterval);
      this._progressInterval = null;
    }
    this._progressValue = 0;

    // Reset preview
    var preview = this._panel.querySelector('.tryon-preview');
    if (preview) {
      preview.style.display = 'none';
      preview.src = '';
    }

    // Reset submit button
    var submit = this._panel.querySelector('[data-tryon-submit]');
    if (submit) {
      submit.disabled = true;
      submit.style.opacity = '0.4';
    }

    // Reset file input
    var input = this._panel.querySelector('.tryon-dropzone-input');
    if (input) { input.value = ''; }

    // Reset progress bar
    var bar = this._panel.querySelector('[data-tryon-progress]');
    if (bar) { bar.style.width = '0%'; }
  };

  TryOnWidget.prototype.showStep = function (name) {
    var steps = this._panel.querySelectorAll('.tryon-step');
    for (var i = 0; i < steps.length; i++) {
      steps[i].setAttribute('hidden', '');
    }
    var target = this._panel.querySelector('[data-step="' + name + '"]');
    if (target) {
      target.removeAttribute('hidden');
    }
  };

  TryOnWidget.prototype.handleFile = function (file) {
    var self = this;
    if (TYPES.indexOf(file.type) === -1) {
      this.showError('Please choose a JPEG, PNG, WebP, or HEIC image.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      this.showError('Photo must be smaller than ' + MAX_MB + ' MB.');
      return;
    }
    this.file = file;

    var reader = new FileReader();
    reader.onload = function (e) {
      var preview = self._panel.querySelector('.tryon-preview');
      if (preview) {
        preview.src = e.target.result;
        preview.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);

    var submit = this._panel.querySelector('[data-tryon-submit]');
    if (submit) {
      submit.disabled = false;
      submit.style.opacity = '1';
    }
  };

  TryOnWidget.prototype.process = function () {
    var self = this;
    this.showStep('loading');
    this.updateLoadingText('Getting ready\u2026');
    this.startProgress();

    // Step 1: presign
    fetch(PROXY_BASE + '?action=presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop: self.shop, productId: self.productId })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Presign request failed (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        self.uploadId = data.uploadId;
        self.updateLoadingText('Uploading your photo\u2026');

        // Step 2: PUT photo to presigned URL
        return fetch(data.presignedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: self.file
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error('Photo upload failed (' + res.status + ')');
        self.updateLoadingText('Applying your outfit\u2026');

        // Step 3: process
        return fetch(PROXY_BASE + '?action=process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId: self.uploadId,
            productId: self.productId,
            shop: self.shop,
            consentTimestamp: self.consentTimestamp,
            jurisdiction: self.jurisdiction
          })
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error('Processing failed (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        self.resultUrl = data.resultUrl;
        self.showResult(data.resultUrl);
      })
      .catch(function (err) {
        self.showError(err.message || 'An unexpected error occurred.');
      });
  };

  TryOnWidget.prototype.startProgress = function () {
    var self = this;
    var bar = this._panel.querySelector('[data-tryon-progress]');
    if (!bar) return;
    this._progressValue = 0;
    bar.style.width = '0%';

    this._progressInterval = setInterval(function () {
      // Slow asymptotic approach to 90%
      var remaining = 90 - self._progressValue;
      var increment = remaining * 0.04;
      if (increment < 0.2) increment = 0.2;
      self._progressValue = Math.min(self._progressValue + increment, 90);
      bar.style.width = self._progressValue.toFixed(1) + '%';
      if (self._progressValue >= 90) {
        clearInterval(self._progressInterval);
        self._progressInterval = null;
      }
    }, 150);
  };

  TryOnWidget.prototype.finishProgress = function () {
    if (this._progressInterval) {
      clearInterval(this._progressInterval);
      this._progressInterval = null;
    }
    var bar = this._panel.querySelector('[data-tryon-progress]');
    if (bar) { bar.style.width = '100%'; }
  };

  TryOnWidget.prototype.updateLoadingText = function (text) {
    var el = this._panel.querySelector('[data-tryon-loading-text]');
    if (el) { el.textContent = text; }
  };

  TryOnWidget.prototype.showResult = function (url) {
    var self = this;
    var img = this._panel.querySelector('[data-tryon-result-img]');
    if (img) {
      img.onload = function () {
        self.finishProgress();
        self.showStep('result');
      };
      img.onerror = function () {
        self.showError('Could not load your result image. Please try again.');
      };
      img.src = url;
    }
  };

  TryOnWidget.prototype.showError = function (msg) {
    if (this._progressInterval) {
      clearInterval(this._progressInterval);
      this._progressInterval = null;
    }
    var el = this._panel.querySelector('[data-tryon-error-msg]');
    if (el) { el.textContent = msg; }
    this.showStep('error');
  };

  TryOnWidget.prototype.share = function () {
    var url = this.resultUrl;
    if (!url) return;
    if (navigator.share) {
      navigator.share({
        title: 'My Virtual Try-On',
        text: 'Check out how this outfit looks on me!',
        url: url
      }).catch(function () { /* user cancelled or not supported */ });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        alert('Link copied to clipboard!');
      });
    } else {
      window.prompt('Copy this link:', url);
    }
  };

  // Bootstrap
  document.querySelectorAll('[data-tryon-product-id]').forEach(function (btn) {
    var widget = new TryOnWidget(btn);
    var ready = false;
    btn.addEventListener('click', function () {
      if (!ready) {
        widget.init();
        ready = true;
      }
      widget.open();
    });
  });

}());

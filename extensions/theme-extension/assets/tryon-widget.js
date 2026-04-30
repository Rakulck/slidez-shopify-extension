(function () {
  'use strict';

  // ── Firebase project config ───────────────────────────────────────────────────
  var FB_PROJECT = 'slidez-be88c';
  var FB_REGION  = 'us-central1';
  var FB_CALLABLE_BASE = 'https://' + FB_REGION + '-' + FB_PROJECT + '.cloudfunctions.net';

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

    // Get model image URLs - try data attributes first, then fallback to asset URL format
    var modelManUrl = button.getAttribute('data-tryon-model-man');
    var modelWomanUrl = button.getAttribute('data-tryon-model-woman');

    // Generate Shopify asset URL format as fallback
    var cdnBaseUrl = document.currentScript?.src.split('/cdn/shop/')[0] + '/cdn/shop/';
    if (!modelManUrl) {
      modelManUrl = cdnBaseUrl + 'files/model-man.jpg?v=' + Date.now();
    }
    if (!modelWomanUrl) {
      modelWomanUrl = cdnBaseUrl + 'files/model-woman.jpg?v=' + Date.now();
    }

    var modelManUrl2 = button.getAttribute('data-tryon-model-man-2') || modelManUrl;
    var modelWomanUrl2 = button.getAttribute('data-tryon-model-woman-2') || modelWomanUrl;

    this.modelManUrl = modelManUrl;
    this.modelWomanUrl = modelWomanUrl;
    this.modelManUrl2 = modelManUrl2;
    this.modelWomanUrl2 = modelWomanUrl2;

    // Product data (passed via Liquid data attributes)
    this.productImageUrl = button.getAttribute('data-tryon-product-image') || '';
    this.productTitle    = button.getAttribute('data-tryon-product-title') || 'the selected garment';
    this.productType     = button.getAttribute('data-tryon-product-type') || '';

    // State
    this.mode = null; // 'upload' | 'ai'
    this.file = null;
    this._userImageData = null; // { base64, mimeType } for upload mode
    this._cachedPhotoDataUrl = null; // data URL cached across opens
    this.aiOptions = { gender: null, modelImage: null };
    this.uploadId = null;
    this.resultUrl = null;
    this.consentTimestamp = null;
    this._progressInterval = null;
    this._progressValue = 0;
    this._overlay = null;
    this._panel = null;
  }

  TryOnWidget.prototype.init = function () {
    var self = this, i;

    var overlay = document.createElement('div');
    overlay.className = 'tryon-overlay';
    this._overlay = overlay;

    var panel = document.createElement('div');
    panel.className = 'tryon-panel';
    panel.style.setProperty('--tryon-color', this.buttonColor);
    this._panel = panel;

    var closeBtn = document.createElement('button');
    closeBtn.className = 'tryon-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&#x2715;';
    panel.appendChild(closeBtn);

    var inner = document.createElement('div');
    inner.className = 'tryon-panel-inner';
    panel.appendChild(inner);

    inner.appendChild(this._buildConsentStep());
    inner.appendChild(this._buildModeStep());
    inner.appendChild(this._buildLookStep());
    inner.appendChild(this._buildLoadingStep());
    inner.appendChild(this._buildResultStep());
    inner.appendChild(this._buildErrorStep());

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    // Close
    closeBtn.addEventListener('click', function () { self.close(); });
    overlay.addEventListener('click', function () { self.close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { self.close(); }
    });

    // Consent
    panel.querySelector('[data-tryon-agree]').addEventListener('click', function () {
      self.consentTimestamp = new Date().toISOString();
      try { sessionStorage.setItem('tryon_consent_timestamp', self.consentTimestamp); } catch (e) {}
      self.showStep('mode');
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

    // Generate / submit (unified for upload and AI modes)
    panel.querySelector('[data-tryon-generate]').addEventListener('click', function () {
      var ready = false;
      if (self.mode === 'ai') {
        ready = !!(self.aiOptions.gender && self.aiOptions.modelImage);
      } else if (self.mode === 'upload') {
        ready = !!(self._userImageData || self.file);
      }
      if (ready) {
        self.process();
      }
    });

    // Gender pills — set gender then navigate to combined look step
    var genderBtns = panel.querySelectorAll('[data-tryon-gender]');
    for (i = 0; i < genderBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var all = panel.querySelectorAll('[data-tryon-gender]');
          for (var j = 0; j < all.length; j++) { all[j].classList.remove('selected'); }
          btn.classList.add('selected');
          self.aiOptions.gender = btn.getAttribute('data-tryon-gender');
          self.showStep('look');
        });
      })(genderBtns[i]);
    }

    // Model image selection — sets mode to 'ai', deselects photo card (keeps cached photo)
    var modelImgBtns = panel.querySelectorAll('[data-tryon-model-image]');
    for (i = 0; i < modelImgBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var all = panel.querySelectorAll('[data-tryon-model-image]');
          for (var j = 0; j < all.length; j++) { all[j].classList.remove('selected'); }
          btn.classList.add('selected');
          self.aiOptions.modelImage = btn.getAttribute('data-tryon-model-image');
          self.mode = 'ai';
          self.file = null;
          var dz = panel.querySelector('.tryon-dropzone');
          if (dz) { dz.classList.remove('selected'); }
          self._checkAiReady();
        });
      })(modelImgBtns[i]);
    }

    // Dropzone click — when showing a photo, re-selects upload mode (no file dialog)
    var dropzoneEl = panel.querySelector('.tryon-dropzone');
    if (dropzoneEl) {
      dropzoneEl.addEventListener('click', function (e) {
        if (!dropzoneEl.classList.contains('has-photo')) return; // normal click-to-browse
        if (e.target.getAttribute('data-tryon-photo-remove') !== null) return; // handled below
        e.preventDefault();
        e.stopPropagation();
        var allModels = panel.querySelectorAll('[data-tryon-model-image]');
        for (var j = 0; j < allModels.length; j++) { allModels[j].classList.remove('selected'); }
        dropzoneEl.classList.add('selected');
        self.aiOptions.modelImage = null;
        self.mode = 'upload';
        self._checkAiReady();
      });
    }

    // Remove button — clears the cached photo
    var removeBtn = panel.querySelector('[data-tryon-photo-remove]');
    if (removeBtn) {
      removeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        self._clearPhoto();
      });
    }

    // Try again — flush state, back to mode select
    var tryAgainBtns = panel.querySelectorAll('[data-tryon-try-again]');
    for (i = 0; i < tryAgainBtns.length; i++) {
      tryAgainBtns[i].addEventListener('click', function () {
        self._reset();
        self.showStep('mode');
      });
    }

    // Save look (download)
    panel.querySelector('[data-tryon-save]').addEventListener('click', function () {
      self._saveLook();
    });

    // Add to cart
    panel.querySelector('[data-tryon-add-cart]').addEventListener('click', function () {
      self._addToCart(this);
    });

    // Back buttons
    var backBtns = panel.querySelectorAll('[data-tryon-back]');
    for (i = 0; i < backBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          self.showStep(btn.getAttribute('data-tryon-back'));
        });
      })(backBtns[i]);
    }
  };

  TryOnWidget.prototype._checkAiReady = function () {
    var btn = this._panel.querySelector('[data-tryon-generate]');
    if (!btn) return;
    var ready = false;
    if (this.mode === 'ai') {
      ready = !!(this.aiOptions.gender && this.aiOptions.modelImage);
    } else if (this.mode === 'upload') {
      ready = !!(this._userImageData || this.file);
    }
    btn.disabled = !ready;
    btn.style.opacity = ready ? '1' : '0.4';
  };

  TryOnWidget.prototype._buildConsentStep = function () {
    var step = document.createElement('div');
    step.className = 'tryon-step tryon-consent-step';
    step.setAttribute('data-step', 'consent');

    var title = document.createElement('h2');
    title.className = 'tryon-consent-title';
    title.textContent = 'Virtual Try-On';

    var sub = document.createElement('p');
    sub.className = 'tryon-consent-subtitle';
    sub.textContent = 'See how this looks on you before you buy';

    var body = document.createElement('p');
    body.className = 'tryon-consent-body';
    body.setAttribute('data-tryon-consent-text', '');

    var actions = document.createElement('div');
    actions.className = 'tryon-consent-actions';

    var agree = document.createElement('button');
    agree.className = 'tryon-btn-primary';
    agree.setAttribute('data-tryon-agree', '');
    agree.textContent = "I Agree \u2014 Let's Go \u2728";

    var decline = document.createElement('button');
    decline.className = 'tryon-btn-ghost';
    decline.setAttribute('data-tryon-decline', '');
    decline.textContent = 'No Thanks';

    actions.appendChild(agree);
    actions.appendChild(decline);
    step.appendChild(title);
    step.appendChild(sub);
    step.appendChild(body);
    step.appendChild(actions);
    return step;
  };

  TryOnWidget.prototype._buildModeStep = function () {
    var step = document.createElement('div');
    step.className = 'tryon-step tryon-mode-step';
    step.setAttribute('data-step', 'mode');
    step.setAttribute('hidden', '');

    var title = document.createElement('h2');
    title.className = 'tryon-mode-title';
    title.textContent = 'How do you want to try it on?';

    var pills = document.createElement('div');
    pills.className = 'tryon-selector-pills';

    var femaleBtn = document.createElement('button');
    femaleBtn.className = 'tryon-selector-pill';
    femaleBtn.setAttribute('data-tryon-gender', 'female');
    femaleBtn.textContent = '♀ Female';

    var maleBtn = document.createElement('button');
    maleBtn.className = 'tryon-selector-pill';
    maleBtn.setAttribute('data-tryon-gender', 'male');
    maleBtn.textContent = '♂ Male';

    pills.appendChild(femaleBtn);
    pills.appendChild(maleBtn);
    step.appendChild(title);
    step.appendChild(pills);
    return step;
  };

  TryOnWidget.prototype._buildLookStep = function () {
    var self = this;
    var step = document.createElement('div');
    step.className = 'tryon-step tryon-look-step';
    step.setAttribute('data-step', 'look');
    step.setAttribute('hidden', '');

    // Header with back button
    var header = document.createElement('div');
    header.className = 'tryon-step-header';
    var backBtn = document.createElement('button');
    backBtn.className = 'tryon-back-btn';
    backBtn.setAttribute('data-tryon-back', 'mode');
    backBtn.innerHTML = '←';
    var stepTitle = document.createElement('span');
    stepTitle.className = 'tryon-step-title';
    stepTitle.textContent = 'Choose Your Look';
    header.appendChild(backBtn);
    header.appendChild(stepTitle);
    step.appendChild(header);

    // 4 model cards in a row
    var modelRow = document.createElement('div');
    modelRow.className = 'tryon-model-cards';

    var models = [
      { url: self.modelManUrl,    value: 'male',    alt: 'Male Model 1'   },
      { url: self.modelManUrl2,   value: 'male2',   alt: 'Male Model 2'   },
      { url: self.modelWomanUrl,  value: 'female',  alt: 'Female Model 1' },
      { url: self.modelWomanUrl2, value: 'female2', alt: 'Female Model 2' }
    ];

    for (var i = 0; i < models.length; i++) {
      (function (m) {
        var card = document.createElement('div');
        card.className = 'tryon-model-card-item';
        card.setAttribute('data-tryon-model-image', m.value);
        var img = document.createElement('img');
        img.src = m.url;
        img.alt = m.alt;
        img.onerror = function () {
          img.style.display = 'none';
          card.style.background = '#f0f0f0';
        };
        card.appendChild(img);
        modelRow.appendChild(card);
      })(models[i]);
    }
    step.appendChild(modelRow);

    // OR divider
    var orDiv = document.createElement('div');
    orDiv.className = 'tryon-or-divider';
    orDiv.textContent = 'or';
    step.appendChild(orDiv);

    // Upload dropzone (also shows photo preview when uploaded)
    var dropzone = document.createElement('div');
    dropzone.className = 'tryon-dropzone';
    var dzIcon = document.createElement('div');
    dzIcon.className = 'tryon-dropzone-icon';
    dzIcon.textContent = '📷';
    var dzLabel = document.createElement('div');
    dzLabel.className = 'tryon-dropzone-label';
    dzLabel.innerHTML = 'Upload your photo<br>or <span class="tryon-dropzone-link">browse files</span>';
    var dzHint = document.createElement('div');
    dzHint.className = 'tryon-dropzone-hint';
    dzHint.textContent = 'JPEG, PNG, WebP, HEIC · Max 10 MB';
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.className = 'tryon-dropzone-input';
    fileInput.accept = TYPES.join(',');
    // Photo preview (shown inside the box after upload)
    var dzPreview = document.createElement('img');
    dzPreview.className = 'tryon-dropzone-preview';
    dzPreview.setAttribute('data-tryon-photo-preview', '');
    dzPreview.alt = 'Your photo';
    // Remove button
    var dzRemove = document.createElement('button');
    dzRemove.className = 'tryon-dropzone-remove';
    dzRemove.setAttribute('data-tryon-photo-remove', '');
    dzRemove.type = 'button';
    dzRemove.innerHTML = '&times;';
    dropzone.appendChild(dzIcon);
    dropzone.appendChild(dzLabel);
    dropzone.appendChild(dzHint);
    dropzone.appendChild(fileInput);
    dropzone.appendChild(dzPreview);
    dropzone.appendChild(dzRemove);
    step.appendChild(dropzone);

    // CTA button (shared for AI model + upload)
    var cta = document.createElement('button');
    cta.className = 'tryon-btn-primary';
    cta.setAttribute('data-tryon-generate', '');
    cta.textContent = 'Try It On →';
    cta.disabled = true;
    cta.style.opacity = '0.4';
    step.appendChild(cta);

    var privacy = document.createElement('p');
    privacy.className = 'tryon-privacy-note';
    privacy.textContent = 'Photo used only for this try-on and deleted immediately.';
    step.appendChild(privacy);

    return step;
  };

  TryOnWidget.prototype._buildSelectorGroup = function (labelText, options) {
    var group = document.createElement('div');
    group.className = 'tryon-selector-group';
    var label = document.createElement('div');
    label.className = 'tryon-selector-label';
    label.textContent = labelText;
    var pills = document.createElement('div');
    pills.className = 'tryon-selector-pills';
    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      var btn = document.createElement('button');
      btn.className = 'tryon-selector-pill';
      btn.setAttribute(o.attr, o.value);
      btn.textContent = o.label;
      pills.appendChild(btn);
    }
    group.appendChild(label);
    group.appendChild(pills);
    return group;
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
    text.textContent = 'Styling your look\u2026';

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

    var addCart = document.createElement('button');
    addCart.className = 'tryon-btn-primary';
    addCart.setAttribute('data-tryon-add-cart', '');
    addCart.textContent = '\uD83D\uDED2 Add to Cart';

    var save = document.createElement('button');
    save.className = 'tryon-btn-secondary';
    save.setAttribute('data-tryon-save', '');
    save.textContent = '\u2764\uFE0F Save Look';

    var tryAgain = document.createElement('button');
    tryAgain.className = 'tryon-btn-ghost';
    tryAgain.setAttribute('data-tryon-try-again', '');
    tryAgain.textContent = '\uD83D\uDD04 Try Again';

    actions.appendChild(addCart);
    actions.appendChild(save);
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
    var consentEl = this._panel.querySelector('[data-tryon-consent-text]');
    if (consentEl) {
      consentEl.textContent = CONSENT_TEXT[this.jurisdiction];
    }

    // Restore cached photo from previous opens this session
    if (!this._userImageData) {
      try {
        var cachedPhoto = sessionStorage.getItem('tryon_cached_photo');
        var cachedMime  = sessionStorage.getItem('tryon_cached_photo_mime');
        if (cachedPhoto && cachedMime) {
          var commaIdx = cachedPhoto.indexOf(',');
          this._userImageData = { base64: cachedPhoto.substring(commaIdx + 1), mimeType: cachedMime };
          this._cachedPhotoDataUrl = cachedPhoto;
          var photoPreview = this._panel.querySelector('[data-tryon-photo-preview]');
          if (photoPreview) { photoPreview.src = cachedPhoto; }
          var dz = this._panel.querySelector('.tryon-dropzone');
          if (dz) { dz.classList.add('has-photo'); }
        }
      } catch (e2) {}
    }

    var storedConsent = null;
    try { storedConsent = sessionStorage.getItem('tryon_consent_timestamp'); } catch (e) {}

    if (storedConsent) {
      this.consentTimestamp = storedConsent;
      this.showStep('mode');
    } else {
      this.showStep('consent');
    }

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
    this.mode = null;
    this.file = null;
    // Keep _userImageData and _cachedPhotoDataUrl — photo persists through the session
    this.aiOptions = { gender: null, modelImage: null };
    this.uploadId = null;
    this.resultUrl = null;
    this.consentTimestamp = null;

    if (this._progressInterval) {
      clearInterval(this._progressInterval);
      this._progressInterval = null;
    }
    this._progressValue = 0;

    var generate = this._panel.querySelector('[data-tryon-generate]');
    if (generate) { generate.disabled = true; generate.style.opacity = '0.4'; }

    var input = this._panel.querySelector('.tryon-dropzone-input');
    if (input) { input.value = ''; }

    var bar = this._panel.querySelector('[data-tryon-progress]');
    if (bar) { bar.style.width = '0%'; }

    var selected = this._panel.querySelectorAll('.tryon-selector-pill.selected, .tryon-tone-swatch.selected, .tryon-model-card-item.selected');
    for (var i = 0; i < selected.length; i++) { selected[i].classList.remove('selected'); }

    // Deselect dropzone visually (re-selected when look step opens if photo is cached)
    var dz = this._panel.querySelector('.tryon-dropzone');
    if (dz) { dz.classList.remove('selected'); }
  };

  TryOnWidget.prototype.showStep = function (name) {
    var steps = this._panel.querySelectorAll('.tryon-step');
    for (var i = 0; i < steps.length; i++) {
      steps[i].setAttribute('hidden', '');
    }
    var target = this._panel.querySelector('[data-step="' + name + '"]');
    if (target) { target.removeAttribute('hidden'); }
    // When entering the look step, auto-select dropzone (photo) if no AI model is chosen
    if (name === 'look' && this._userImageData && !this.aiOptions.modelImage) {
      var dz = this._panel.querySelector('.tryon-dropzone');
      if (dz) {
        dz.classList.add('selected');
        this.mode = 'upload';
        this._checkAiReady();
      }
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
    this.mode = 'upload';

    var reader = new FileReader();
    reader.onload = function (e) {
      var dataUrl = e.target.result;
      // Precompute base64 + mimeType so _processUpload skips re-reading
      var commaIdx = dataUrl.indexOf(',');
      var mimeType = dataUrl.substring(5, dataUrl.indexOf(';'));
      self._userImageData = { base64: dataUrl.substring(commaIdx + 1), mimeType: mimeType };
      self._cachedPhotoDataUrl = dataUrl;
      // Persist across closes for this session
      try {
        sessionStorage.setItem('tryon_cached_photo', dataUrl);
        sessionStorage.setItem('tryon_cached_photo_mime', mimeType);
      } catch (e2) {}
      // Show photo inside the dropzone box
      self._showUploadPreview(dataUrl);
      self._checkAiReady();
    };
    reader.readAsDataURL(file);
  };

  TryOnWidget.prototype._showUploadPreview = function (dataUrl) {
    var photoPreview = this._panel.querySelector('[data-tryon-photo-preview]');
    if (photoPreview) { photoPreview.src = dataUrl; }
    var dz = this._panel.querySelector('.tryon-dropzone');
    if (dz) { dz.classList.add('has-photo', 'selected'); }
    // Deselect any model card
    var allModels = this._panel.querySelectorAll('[data-tryon-model-image]');
    for (var j = 0; j < allModels.length; j++) { allModels[j].classList.remove('selected'); }
    this.aiOptions.modelImage = null;
  };

  TryOnWidget.prototype._clearPhoto = function () {
    this.file = null;
    this._userImageData = null;
    this._cachedPhotoDataUrl = null;
    try {
      sessionStorage.removeItem('tryon_cached_photo');
      sessionStorage.removeItem('tryon_cached_photo_mime');
    } catch (e) {}
    var dz = this._panel.querySelector('.tryon-dropzone');
    if (dz) { dz.classList.remove('has-photo', 'selected'); }
    var input = this._panel.querySelector('.tryon-dropzone-input');
    if (input) { input.value = ''; }
    if (this.mode === 'upload') { this.mode = null; }
    this._checkAiReady();
  };
  TryOnWidget.prototype.process = function () {
    this.showStep('loading');
    this.updateLoadingText('Styling your look\u2026');
    this.startProgress();
    if (this.mode === 'upload') {
      this._processUpload();
    } else {
      this._processAiModel();
    }
  };

  // ── Upload mode: convert photo then call singleItemTryOn directly ─────────────
  TryOnWidget.prototype._processUpload = function () {
    var self = this;
    console.log('[TryOn] _processUpload | productImageUrl=', self.productImageUrl);

    if (!self.productImageUrl) {
      self.showError('This product has no image. Cannot generate a try-on.');
      return;
    }

    var timeoutId = null;
    var timeoutPromise = new Promise(function (_, reject) {
      timeoutId = setTimeout(function () {
        reject(new Error('Request timed out after 2 minutes. Gemini may be busy — please try again.'));
      }, 120000);
    });

    self.updateLoadingText('Preparing your photo\u2026');

    var userImgPromise = self._userImageData
      ? Promise.resolve(self._userImageData)
      : fileToBase64(self.file);

    var mainFlow = Promise.all([
      userImgPromise,
      imageUrlToBase64(self.productImageUrl)
    ])
      .then(function (results) {
        var userImg    = results[0];
        var productImg = results[1];
        self._userImageData = userImg;
        console.log('[TryOn] images ready | userMime=', userImg.mimeType, '| productMime=', productImg.mimeType);
        self.updateLoadingText('Applying your outfit\u2026');
        return callFirebaseFunction('singleItemTryOn', {
          tryOnType: 'garment',
          userImageBase64: userImg.base64,
          userMimeType: userImg.mimeType,
          referenceImageBase64: productImg.base64,
          referenceMimeType: productImg.mimeType,
          garmentDescription: self.productTitle,
          category: self.productType,
          garmentImageContainsPerson: false,
          platform: 'shopify_extension',
          device: /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
          shopDomain: self.shop || '',
          productId: self.productId || '',
          productTitle: self.productTitle || '',
          productImageUrl: self.productImageUrl || ''
        });
      })
      .then(function (result) {
        clearTimeout(timeoutId);
        console.log('[TryOn] singleItemTryOn success | mimeType=', result.mimeType);
        var dataUrl = 'data:' + result.mimeType + ';base64,' + result.imageBase64;
        self.resultUrl = dataUrl;
        self.showResult(dataUrl);
      });

    Promise.race([mainFlow, timeoutPromise])
      .catch(function (err) {
        clearTimeout(timeoutId);
        console.error('[TryOn] _processUpload error:', err);
        self.showError(err.message || 'An unexpected error occurred.');
      });
  };

  // ── AI model mode: use selected model image + product image ───────────────────
  TryOnWidget.prototype._processAiModel = function () {
    var self = this;
    var modelUrlMap = { male: self.modelManUrl, male2: self.modelManUrl2, female: self.modelWomanUrl, female2: self.modelWomanUrl2 };
    var modelUrl = modelUrlMap[self.aiOptions.modelImage] || self.modelManUrl;
    console.log('[TryOn] _processAiModel | modelImage=', self.aiOptions.modelImage, '| modelUrl=', modelUrl, '| productImageUrl=', self.productImageUrl, '| productTitle=', self.productTitle);

    if (!self.productImageUrl) {
      self.showError('This product has no image. Cannot generate a try-on.');
      return;
    }
    if (!modelUrl) {
      self.showError('Model image not available. Please refresh and try again.');
      return;
    }

    var timeoutId = null;
    var timeoutPromise = new Promise(function (_, reject) {
      timeoutId = setTimeout(function () {
        reject(new Error('Request timed out after 2 minutes. Gemini may be busy — please try again.'));
      }, 120000);
    });

    self.updateLoadingText('Loading images\u2026');

    var mainFlow = Promise.all([
      imageUrlToBase64(modelUrl),
      imageUrlToBase64(self.productImageUrl)
    ])
      .then(function (results) {
        var modelImg   = results[0];
        var productImg = results[1];
        console.log('[TryOn] images converted | modelMime=', modelImg.mimeType, '| productMime=', productImg.mimeType, '| modelB64Len=', modelImg.base64.length, '| productB64Len=', productImg.base64.length);
        self.updateLoadingText('Generating your look with AI\u2026');
        return callFirebaseFunction('singleItemTryOn', {
          tryOnType: 'garment',
          userImageBase64: modelImg.base64,
          userMimeType: modelImg.mimeType,
          referenceImageBase64: productImg.base64,
          referenceMimeType: productImg.mimeType,
          garmentDescription: self.productTitle,
          category: self.productType,
          garmentImageContainsPerson: false,
          platform: 'shopify_extension',
          device: /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
          shopDomain: self.shop || '',
          productId: self.productId || '',
          productTitle: self.productTitle || '',
          productImageUrl: self.productImageUrl || ''
        });
      })
      .then(function (result) {
        clearTimeout(timeoutId);
        console.log('[TryOn] singleItemTryOn success | mimeType=', result.mimeType);
        var dataUrl = 'data:' + result.mimeType + ';base64,' + result.imageBase64;
        self.resultUrl = dataUrl;
        self.showResult(dataUrl);
      });

    Promise.race([mainFlow, timeoutPromise])
      .catch(function (err) {
        clearTimeout(timeoutId);
        console.error('[TryOn] _processAiModel error:', err);
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
      var remaining = 90 - self._progressValue;
      var increment = remaining * 0.05;
      if (increment < 0.3) increment = 0.3;
      self._progressValue = Math.min(self._progressValue + increment, 90);
      bar.style.width = self._progressValue.toFixed(1) + '%';
      if (self._progressValue >= 90) {
        clearInterval(self._progressInterval);
        self._progressInterval = null;
      }
    }, 100);
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
    this.finishProgress();
    var img = this._panel.querySelector('[data-tryon-result-img]');
    if (img) {
      img.onload = function () { self.showStep('result'); };
      img.onerror = function () { self.showError('Could not load your result. Please try again.'); };
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

  TryOnWidget.prototype._saveLook = function () {
    var url = this.resultUrl;
    if (!url) return;
    var a = document.createElement('a');
    a.href = url;
    a.download = 'my-look.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  TryOnWidget.prototype._addToCart = function (btn) {

    // ── Already added: clicking "View Cart" navigates immediately ──────────────
    if (btn.getAttribute('data-cart-done') === 'true') {
      window.location.href = '/cart';
      return;
    }

    // ── Find the selected variant ID ──────────────────────────────────────────
    // Cover all major Shopify themes: Dawn, Debut, Sense, Craft, etc.
    var variantInput =
      document.querySelector('form[action*="/cart/add"] input[name="id"]') ||
      document.querySelector('form[action="/cart/add"] input[name="id"]') ||
      document.querySelector('select[name="id"]') ||
      document.querySelector('input[name="id"]');

    var variantId = variantInput ? variantInput.value : null;

    // ── No variant found: go straight to cart ─────────────────────────────────
    if (!variantId) {
      window.location.href = '/cart';
      return;
    }

    var original = btn.textContent;
    btn.textContent = 'Adding to cart…';
    btn.disabled = true;
    btn.style.transition = 'background 300ms ease';

    // ── POST to Shopify AJAX Cart API ─────────────────────────────────────────
    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: parseInt(variantId, 10), quantity: 1 })
    })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (e) { throw new Error(e.description || 'Add to cart failed'); });
        return res.json();
      })
      .then(function () {
        // ── Success: green ✔ Added! ──────────────────────────────────────────
        btn.textContent = '✔ Added!';
        btn.style.background = '#16a34a';
        btn.disabled = false;
        btn.setAttribute('data-cart-done', 'true'); // mark so next click navigates
        console.log('[TryOn] Product added to cart | variantId:', variantId);

        // ── Update the cart count / trigger the cart drawer ───────────────────
        fetch('/cart.js')
          .then(function (r) { return r.json(); })
          .then(function (cart) {
            var bubbles = document.querySelectorAll(
              '.cart-count-bubble span[aria-hidden], '
              + '#cart-count, .cart__count, [data-cart-count], '
              + '.header__cart-count, .icon-cart__bubble'
            );
            for (var i = 0; i < bubbles.length; i++) {
              bubbles[i].textContent = cart.item_count;
            }
            document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true, detail: { source: 'slidez-tryon' } }));
            var cartDrawer = document.querySelector('cart-drawer');
            if (cartDrawer && typeof cartDrawer.open === 'function') {
              cartDrawer.open();
            } else {
              var cartToggle = document.querySelector('[data-cart-toggle]:not(.tryon-btn-primary), #cart-icon-bubble, .js-cart-toggle');
              if (cartToggle) cartToggle.click();
            }
          })
          .catch(function () {});

        // ── After 2 s flip to "View Cart" ─────────────────────────────────────
        setTimeout(function () {
          btn.textContent = '🛒 View Cart';
          btn.style.background = '';
          // clicking "View Cart" will hit the data-cart-done guard above → /cart
        }, 2000);
      })
      .catch(function (err) {
        console.error('[TryOn] Add to cart error:', err);
        btn.textContent = '⚠️ ' + (err.message || 'Try Again');
        btn.style.background = '';
        btn.disabled = false;
        setTimeout(function () {
          btn.textContent = original;
        }, 3000);
      });
  };

  // ── Firebase callable helper ─────────────────────────────────────────────────
  function callFirebaseFunction(fnName, data) {
    var url = FB_CALLABLE_BASE + '/' + fnName;
    console.log('[TryOn] calling Firebase function:', fnName, '| url:', url);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: data })
    })
      .then(function (res) {
        console.log('[TryOn]', fnName, 'HTTP status:', res.status);
        return res.json();
      })
      .then(function (json) {
        console.log('[TryOn]', fnName, 'response keys:', Object.keys(json));
        if (json.error) {
          var msg = (json.error.message || json.error.status || JSON.stringify(json.error));
          console.error('[TryOn]', fnName, 'Firebase error:', msg);
          throw new Error(msg);
        }
        return json.result;
      });
  }

  // ── Image URL → { base64, mimeType } ─────────────────────────────────────────
  function imageUrlToBase64(url) {
    return fetch(url)
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () {
            var parts = reader.result.split(',');
            resolve({ base64: parts[1], mimeType: blob.type || 'image/jpeg' });
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      });
  }

  // ── File → { base64, mimeType } ──────────────────────────────────────────────
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var parts = reader.result.split(',');
        resolve({ base64: parts[1], mimeType: file.type || 'image/jpeg' });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────────
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

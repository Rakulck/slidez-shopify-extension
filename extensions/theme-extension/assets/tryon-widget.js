(function () {
  'use strict';

  // ── Firebase project config ───────────────────────────────────────────────────
  var FB_PROJECT = 'slidez-be88c';
  var FB_REGION  = 'us-central1';
  var FB_CALLABLE_BASE = 'https://' + FB_REGION + '-' + FB_PROJECT + '.cloudfunctions.net';

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

  // Mock result: a purple-gradient placeholder silhouette (no external URL)
  var MOCK_RESULT = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">' +
    '<defs>' +
    '<linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">' +
    '<stop offset="0%" style="stop-color:#f3eeff"/>' +
    '<stop offset="100%" style="stop-color:#ddd0f8"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<rect width="400" height="600" fill="url(#bg)"/>' +
    '<ellipse cx="200" cy="130" rx="54" ry="60" fill="#c4a8e8"/>' +
    '<rect x="110" y="210" width="180" height="240" rx="22" fill="#b490de"/>' +
    '<rect x="80" y="215" width="50" height="160" rx="18" fill="#c4a8e8"/>' +
    '<rect x="270" y="215" width="50" height="160" rx="18" fill="#c4a8e8"/>' +
    '<rect x="130" y="450" width="55" height="130" rx="18" fill="#b490de"/>' +
    '<rect x="215" y="450" width="55" height="130" rx="18" fill="#b490de"/>' +
    '<text x="200" y="590" text-anchor="middle" fill="#7c5cbf" font-size="13" font-family="sans-serif" font-weight="500">✨ Your Look Preview</text>' +
    '</svg>'
  );

  var SKIN_TONES = [
    { id: 'tone-light', color: '#E8B88A', label: 'Light' },
    { id: 'tone-medium', color: '#C68642', label: 'Medium' },
    { id: 'tone-deep', color: '#5C3317', label: 'Deep' }
  ];

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
    if (!modelManUrl) {
      var cdnUrl = document.currentScript?.src.split('/cdn/shop/')[0] + '/cdn/shop/';
      modelManUrl = cdnUrl + 'files/model-man.jpg?v=' + Date.now();
    }
    if (!modelWomanUrl) {
      var cdnUrl = document.currentScript?.src.split('/cdn/shop/')[0] + '/cdn/shop/';
      modelWomanUrl = cdnUrl + 'files/model-woman.jpg?v=' + Date.now();
    }

    this.modelManUrl = modelManUrl;
    this.modelWomanUrl = modelWomanUrl;

    // Product data (passed via Liquid data attributes)
    this.productImageUrl = button.getAttribute('data-tryon-product-image') || '';
    this.productTitle    = button.getAttribute('data-tryon-product-title') || 'the selected garment';
    this.productType     = button.getAttribute('data-tryon-product-type') || '';

    // State
    this.mode = null; // 'upload' | 'ai'
    this.file = null;
    this._userImageData = null; // { base64, mimeType } for upload mode
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
    var self = this;

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
    inner.appendChild(this._buildUploadStep());
    inner.appendChild(this._buildAiModelStep());
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

    // Mode cards
    panel.querySelector('[data-tryon-mode="upload"]').addEventListener('click', function () {
      self.mode = 'upload';
      self.showStep('upload');
    });
    panel.querySelector('[data-tryon-mode="ai"]').addEventListener('click', function () {
      self.mode = 'ai';
      self.showStep('ai');
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

    // Upload submit
    panel.querySelector('[data-tryon-submit]').addEventListener('click', function () {
      self.process();
    });

    // AI generate
    panel.querySelector('[data-tryon-generate]').addEventListener('click', function () {
      if (self.aiOptions.gender && self.aiOptions.modelImage) {
        self.process();
      }
    });

    // Gender pills
    var genderBtns = panel.querySelectorAll('[data-tryon-gender]');
    for (var i = 0; i < genderBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var all = panel.querySelectorAll('[data-tryon-gender]');
          for (var j = 0; j < all.length; j++) { all[j].classList.remove('selected'); }
          btn.classList.add('selected');
          self.aiOptions.gender = btn.getAttribute('data-tryon-gender');
          self._checkAiReady();
        });
      })(genderBtns[i]);
    }

    // Body type pills
    var bodyBtns = panel.querySelectorAll('[data-tryon-body]');
    for (var i = 0; i < bodyBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var all = panel.querySelectorAll('[data-tryon-body]');
          for (var j = 0; j < all.length; j++) { all[j].classList.remove('selected'); }
          btn.classList.add('selected');
          self.aiOptions.bodyType = btn.getAttribute('data-tryon-body');
          self._checkAiReady();
        });
      })(bodyBtns[i]);
    }

    // Skin tone swatches
    var toneBtns = panel.querySelectorAll('[data-tryon-tone]');
    for (var i = 0; i < toneBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var all = panel.querySelectorAll('[data-tryon-tone]');
          for (var j = 0; j < all.length; j++) { all[j].classList.remove('selected'); }
          btn.classList.add('selected');
          self.aiOptions.skinTone = btn.getAttribute('data-tryon-tone');
          self._checkAiReady();
        });
      })(toneBtns[i]);
    }

    // Model image selection
    var modelImgBtns = panel.querySelectorAll('[data-tryon-model-image]');
    for (var i = 0; i < modelImgBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var all = panel.querySelectorAll('[data-tryon-model-image]');
          for (var j = 0; j < all.length; j++) { all[j].classList.remove('selected'); }
          btn.classList.add('selected');
          self.aiOptions.modelImage = btn.getAttribute('data-tryon-model-image');
          self._checkAiReady();
        });
      })(modelImgBtns[i]);
    }

    // Try again — flush state, back to mode select
    var tryAgainBtns = panel.querySelectorAll('[data-tryon-try-again]');
    for (var i = 0; i < tryAgainBtns.length; i++) {
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
    for (var i = 0; i < backBtns.length; i++) {
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
    var ready = !!(this.aiOptions.gender && this.aiOptions.modelImage);
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

    var cards = document.createElement('div');
    cards.className = 'tryon-mode-cards';

    var uploadCard = document.createElement('button');
    uploadCard.className = 'tryon-mode-card';
    uploadCard.setAttribute('data-tryon-mode', 'upload');
    uploadCard.innerHTML =
      '<div class="tryon-mode-icon">\uD83D\uDCF8</div>' +
      '<div class="tryon-mode-label">Upload your photo</div>' +
      '<div class="tryon-mode-desc">Use your own photo for a personal fit</div>';

    var aiCard = document.createElement('button');
    aiCard.className = 'tryon-mode-card';
    aiCard.setAttribute('data-tryon-mode', 'ai');
    aiCard.innerHTML =
      '<div class="tryon-mode-icon">\u2728</div>' +
      '<div class="tryon-mode-label">Use AI model</div>' +
      '<div class="tryon-mode-desc">Instant \u2014 choose your look & body type</div>';

    cards.appendChild(uploadCard);
    cards.appendChild(aiCard);
    step.appendChild(title);
    step.appendChild(cards);
    return step;
  };

  TryOnWidget.prototype._buildUploadStep = function () {
    var step = document.createElement('div');
    step.className = 'tryon-step';
    step.setAttribute('data-step', 'upload');
    step.setAttribute('hidden', '');

    var header = document.createElement('div');
    header.className = 'tryon-step-header';
    var backBtn = document.createElement('button');
    backBtn.className = 'tryon-back-btn';
    backBtn.setAttribute('data-tryon-back', 'mode');
    backBtn.innerHTML = '\u2190 Back';
    var stepTitle = document.createElement('span');
    stepTitle.className = 'tryon-step-title';
    stepTitle.textContent = 'Upload Your Photo';
    header.appendChild(backBtn);
    header.appendChild(stepTitle);

    var dropzone = document.createElement('div');
    dropzone.className = 'tryon-dropzone';
    var icon = document.createElement('div');
    icon.className = 'tryon-dropzone-icon';
    icon.textContent = '\uD83D\uDCF7';
    var label = document.createElement('div');
    label.className = 'tryon-dropzone-label';
    label.innerHTML = 'Drag your photo here<br>or <span class="tryon-dropzone-link">browse files</span>';
    var hint = document.createElement('div');
    hint.className = 'tryon-dropzone-hint';
    hint.textContent = 'JPEG, PNG, WebP, HEIC \u00B7 Max 10 MB';
    var input = document.createElement('input');
    input.type = 'file';
    input.className = 'tryon-dropzone-input';
    input.accept = TYPES.join(',');
    dropzone.appendChild(icon);
    dropzone.appendChild(label);
    dropzone.appendChild(hint);
    dropzone.appendChild(input);

    // Preview with crop-grid overlay
    var previewWrap = document.createElement('div');
    previewWrap.className = 'tryon-preview-wrap';
    var preview = document.createElement('img');
    preview.className = 'tryon-preview';
    preview.alt = 'Preview';
    var cropGrid = document.createElement('div');
    cropGrid.className = 'tryon-crop-grid';
    previewWrap.appendChild(preview);
    previewWrap.appendChild(cropGrid);

    var submit = document.createElement('button');
    submit.className = 'tryon-btn-primary';
    submit.setAttribute('data-tryon-submit', '');
    submit.textContent = 'Try It On \u2192';
    submit.disabled = true;
    submit.style.opacity = '0.4';

    var privacy = document.createElement('p');
    privacy.className = 'tryon-privacy-note';
    privacy.textContent = 'Photo used only for this try-on and deleted immediately.';

    step.appendChild(header);
    step.appendChild(dropzone);
    step.appendChild(previewWrap);
    step.appendChild(submit);
    step.appendChild(privacy);
    return step;
  };

  TryOnWidget.prototype._buildAiModelStep = function () {
    var self = this; // capture instance for closures below
    var step = document.createElement('div');
    step.className = 'tryon-step tryon-ai-step';
    step.setAttribute('data-step', 'ai');
    step.setAttribute('hidden', '');

    var header = document.createElement('div');
    header.className = 'tryon-step-header';
    var backBtn = document.createElement('button');
    backBtn.className = 'tryon-back-btn';
    backBtn.setAttribute('data-tryon-back', 'mode');
    backBtn.innerHTML = '\u2190 Back';
    var stepTitle = document.createElement('span');
    stepTitle.className = 'tryon-step-title';
    stepTitle.textContent = 'Choose Your Look';
    header.appendChild(backBtn);
    header.appendChild(stepTitle);
    step.appendChild(header);

    // Gender selection only (body type + skin tone removed — handled by AI)
    step.appendChild(this._buildSelectorGroup('Gender', [
      { label: '\u2640 Female', value: 'female', attr: 'data-tryon-gender' },
      { label: '\u2642 Male',   value: 'male',   attr: 'data-tryon-gender' }
    ]));

    // Model Image selection
    var modelSection = document.createElement('div');
    modelSection.className = 'tryon-selector-group';
    var modelLabel = document.createElement('div');
    modelLabel.className = 'tryon-selector-label';
    modelLabel.textContent = 'Model Image';
    var modelRow = document.createElement('div');
    modelRow.className = 'tryon-model-cards';

    var m1 = document.createElement('div');
    m1.className = 'tryon-model-card-item';
    m1.setAttribute('data-tryon-model-image', 'male');
    var img1 = document.createElement('img');
    img1.src = self.modelManUrl; // fixed: use captured self, not global self
    img1.alt = 'Male Model';
    img1.onerror = function () {
      // asset_url is the correct path; no valid fallback exists
      img1.style.display = 'none';
      img1.parentElement.style.background = '#f0f0f0';
    };
    m1.appendChild(img1);

    var m2 = document.createElement('div');
    m2.className = 'tryon-model-card-item';
    m2.setAttribute('data-tryon-model-image', 'female');
    var img2 = document.createElement('img');
    img2.src = self.modelWomanUrl; // fixed: use captured self, not global self
    img2.alt = 'Female Model';
    img2.onerror = function () {
      // asset_url is the correct path; no valid fallback exists
      img2.style.display = 'none';
      img2.parentElement.style.background = '#f0f0f0';
    };
    m2.appendChild(img2);

    modelRow.appendChild(m1);
    modelRow.appendChild(m2);
    modelSection.appendChild(modelLabel);
    modelSection.appendChild(modelRow);
    step.appendChild(modelSection);

    var generate = document.createElement('button');
    generate.className = 'tryon-btn-primary';
    generate.setAttribute('data-tryon-generate', '');
    generate.textContent = 'Generate Look \u2192';
    generate.disabled = true;
    generate.style.opacity = '0.4';
    step.appendChild(generate);

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
    this._userImageData = null;
    this.aiOptions = { gender: null, modelImage: null };
    this.uploadId = null;
    this.resultUrl = null;
    this.consentTimestamp = null;

    if (this._progressInterval) {
      clearInterval(this._progressInterval);
      this._progressInterval = null;
    }
    this._progressValue = 0;

    var preview = this._panel.querySelector('.tryon-preview');
    if (preview) { preview.style.display = 'none'; preview.src = ''; }

    var cropGrid = this._panel.querySelector('.tryon-crop-grid');
    if (cropGrid) { cropGrid.style.display = 'none'; }

    var submit = this._panel.querySelector('[data-tryon-submit]');
    if (submit) { submit.disabled = true; submit.style.opacity = '0.4'; }

    var generate = this._panel.querySelector('[data-tryon-generate]');
    if (generate) { generate.disabled = true; generate.style.opacity = '0.4'; }

    var input = this._panel.querySelector('.tryon-dropzone-input');
    if (input) { input.value = ''; }

    var bar = this._panel.querySelector('[data-tryon-progress]');
    if (bar) { bar.style.width = '0%'; }

    var selected = this._panel.querySelectorAll('.tryon-selector-pill.selected, .tryon-tone-swatch.selected, .tryon-model-card-item.selected');
    for (var i = 0; i < selected.length; i++) { selected[i].classList.remove('selected'); }
  };

  TryOnWidget.prototype.showStep = function (name) {
    var steps = this._panel.querySelectorAll('.tryon-step');
    for (var i = 0; i < steps.length; i++) {
      steps[i].setAttribute('hidden', '');
    }
    var target = this._panel.querySelector('[data-step="' + name + '"]');
    if (target) { target.removeAttribute('hidden'); }
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
      var cropGrid = self._panel.querySelector('.tryon-crop-grid');
      if (preview) {
        preview.src = e.target.result;
        preview.style.display = 'block';
      }
      if (cropGrid) { cropGrid.style.display = 'block'; }
    };
    reader.readAsDataURL(file);

    var submit = this._panel.querySelector('[data-tryon-submit]');
    if (submit) { submit.disabled = false; submit.style.opacity = '1'; }
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

    var mainFlow = Promise.all([
      fileToBase64(self.file),
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
    var modelUrl = self.aiOptions.modelImage === 'male' ? self.modelManUrl : self.modelWomanUrl;
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
    var self = this;

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

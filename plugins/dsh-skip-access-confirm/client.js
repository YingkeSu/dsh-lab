/*
 * dsh-skip-access-confirm — browser half.
 *
 * The Web client gates two permission presets behind an in-page risk
 * acknowledgement (`RiskConfirmation`): Full access and Auto review (EXP).
 * The acknowledgement is a purely client-side dialog; this plugin watches for
 * exactly those two dialogs and confirms them for you, so picking the preset
 * stays a single click.
 *
 * It only ever touches dialogs whose aria-label/heading is one of those two
 * risk confirmations, and only after finding the acknowledgement checkbox plus
 * a disabled action button. Every other dialog on the page is left alone.
 */
window.__ModuleLoader__.load({
  id: 'dsh-skip-access-confirm',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    /* Titles of the two permission risk acknowledgements, across the shipped
       locales. Matched against the dialog's aria-label or heading only. */
    var RISK_TITLE = /full access|完全权限|フルアクセス|vollzugriff|voll(?:en)? zugriff|полный доступ|acc[èe]s complet|acceso completo|acesso total|auto review|自动审查|自動認可レビュー|自動審査/i;

    var pollTimers = typeof WeakMap === 'function' ? new WeakMap() : null;

    function toArray(list) {
      return Array.prototype.slice.call(list);
    }

    /** The localized title Modal puts on role="dialog" (aria-label) and in its h2. */
    function dialogTitle(dialog) {
      var label = dialog.getAttribute('aria-label');
      if (label) return label;
      var heading = dialog.querySelector('h1, h2, h3, [role="heading"]');
      return heading ? (heading.textContent || '') : '';
    }

    /** True for the Full-access / Auto-review acknowledgement dialog. */
    function isRiskConfirmation(dialog) {
      if (!RISK_TITLE.test(dialogTitle(dialog))) return false;
      if (dialog.querySelector('input[type="checkbox"]') === null) return false;
      var buttons = toArray(dialog.querySelectorAll('button'));
      return buttons.some(function (button) { return button.disabled; });
    }

    /**
     * Check the acknowledgement box and press the action button it unlocks.
     * The button starts disabled and React enables it on the next render, so the
     * press waits for that render instead of assuming it already happened.
     * @param {Element} dialog - the dialog element.
     */
    function confirm(dialog) {
      if (dialog.getAttribute('data-skip-access-confirm') !== null) return;
      var box = dialog.querySelector('input[type="checkbox"]');
      if (box === null || box.checked || box.disabled) return;
      dialog.setAttribute('data-skip-access-confirm', 'pending');

      var buttons = toArray(dialog.querySelectorAll('button'));
      var disabledAtOpen = buttons.filter(function (button) { return button.disabled; });
      box.click();

      var attempts = 0;
      var timer = setInterval(function () {
        attempts += 1;
        var target = disabledAtOpen.filter(function (button) {
          return button.isConnected && !button.disabled;
        })[0];
        if (target === undefined) {
          target = buttons.filter(function (button) {
            return button.isConnected && !button.disabled
              && /^(enable|ativar|activar|activer|aktivieren|включить|有効|启用)/i.test(
                (button.textContent || '').trim());
          })[0];
        }
        if (target !== undefined) {
          clearInterval(timer);
          if (pollTimers !== null) pollTimers.delete(dialog);
          dialog.setAttribute('data-skip-access-confirm', 'done');
          target.click();
          return;
        }
        if (!dialog.isConnected || attempts > 120) {
          clearInterval(timer);
          if (pollTimers !== null) pollTimers.delete(dialog);
        }
      }, 16);
      if (pollTimers !== null) pollTimers.set(dialog, timer);
    }

    /** Scan a newly added subtree (or a dialog already on the page) for targets. */
    function scan(node) {
      if (node.nodeType !== 1) return;
      if (node.matches && node.matches('[role="dialog"]') && isRiskConfirmation(node)) {
        confirm(node);
      }
      if (!node.querySelectorAll) return;
      var dialogs = node.querySelectorAll('[role="dialog"]');
      for (var i = 0; i < dialogs.length; i += 1) {
        if (isRiskConfirmation(dialogs[i])) confirm(dialogs[i]);
      }
    }

    /**
     * Start watching the page for the two permission risk acknowledgements.
     * @param {object} ctx - the client plugin context.
     */
    function apply(ctx) {
      var observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i += 1) {
          var added = mutations[i].addedNodes;
          for (var j = 0; j < added.length; j += 1) scan(added[j]);
        }
      });
      ctx.effect(function () {
        observer.observe(document.body, { childList: true, subtree: true });
        var existing = document.querySelectorAll('[role="dialog"]');
        for (var i = 0; i < existing.length; i += 1) {
          if (isRiskConfirmation(existing[i])) confirm(existing[i]);
        }
        return function () {
          observer.disconnect();
          if (pollTimers !== null) {
            document.querySelectorAll('[data-skip-access-confirm="pending"]').forEach(function (dialog) {
              var timer = pollTimers.get(dialog);
              if (timer !== undefined) clearInterval(timer);
            });
          }
        };
      }, 'skip-access-confirm: risk acknowledgements');
    }

    exports.name = 'skip-access-confirm';
    exports.inject = [];
    exports.apply = apply;
    return module.exports;
  },
});

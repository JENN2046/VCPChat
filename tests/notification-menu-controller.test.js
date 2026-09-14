const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { NotificationMenuController } = require('../modules/ui-system/next-shell/notification-menu-controller.js');

function fixture() {
    const dom = new JSDOM(`<!doctype html><body>
      <button id="nextUiNotificationMenuBtn" aria-expanded="false"></button>
      <div id="nextUiNotificationMenu" role="menu" hidden>
        <button id="nextUiNotificationForum" role="menuitem"></button>
        <button id="nextUiNotificationMemo" role="menuitem"></button>
        <button id="nextUiNotificationLog" role="menuitem"></button>
        <button id="nextUiNotificationObserver" role="menuitem"></button>
        <button id="nextUiNotificationFilterToggle" role="menuitemcheckbox" aria-checked="false"><span id="nextUiNotificationFilterState"></span></button>
        <button id="nextUiNotificationSettings" role="menuitem"></button>
        <button id="nextUiNotificationClear" role="menuitem"></button>
      </div>
      <button id="settingsFocusTarget"></button>
    </body>`, { pretendToBeVisual: true, url: 'file:///notification.html' });
    return dom;
}

test('notification menu owns current commands, keyboard focus and lifecycle cleanup', async () => {
    const dom = fixture();
    const calls = [];
    let enabled = false;
    const byId = id => dom.window.document.getElementById(id);
    const dispatcher = {
        register(entry) { this.entry = entry; return () => { this.entry = null; }; }
    };
    const controller = new NotificationMenuController({
        window: dom.window,
        document: dom.window.document,
        commands: () => ({
            openForum: () => calls.push('forum'),
            openMemo: () => calls.push('memo'),
            openLog: () => calls.push('log'),
            openRagObserver: () => calls.push('observer'),
            toggleNotificationFilter: () => { calls.push('toggle'); enabled = !enabled; },
            openNotificationFilterSettings: () => {
                calls.push('filter-settings');
                byId('settingsFocusTarget').focus();
            },
            clearNotifications: () => calls.push('clear'),
        }),
        filterManager: { isFilterEnabled: () => enabled },
        escapeDispatcher: dispatcher,
    });
    assert.equal(controller.mount(), true);
    assert.equal(controller.mount(), true, 'repeat mount must not duplicate listeners');
    const trigger = byId('nextUiNotificationMenuBtn');
    const menu = byId('nextUiNotificationMenu');
    controller.open();
    assert.equal(dom.window.document.activeElement.id, 'nextUiNotificationForum');
    for (const [key, target] of [
        ['ArrowDown', 'nextUiNotificationMemo'],
        ['ArrowDown', 'nextUiNotificationLog'],
        ['End', 'nextUiNotificationClear'],
        ['Home', 'nextUiNotificationForum'],
        ['ArrowUp', 'nextUiNotificationClear'],
    ]) {
        dom.window.document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
            key, bubbles: true, cancelable: true,
        }));
        assert.equal(dom.window.document.activeElement.id, target, key);
    }
    for (const [id, action] of [
        ['nextUiNotificationForum', 'forum'],
        ['nextUiNotificationMemo', 'memo'],
        ['nextUiNotificationLog', 'log'],
        ['nextUiNotificationObserver', 'observer'],
        ['nextUiNotificationFilterToggle', 'toggle'],
        ['nextUiNotificationSettings', 'filter-settings'],
        ['nextUiNotificationClear', 'clear'],
    ]) {
        controller.open();
        byId(id).click();
        await Promise.resolve();
        assert.equal(calls.at(-1), action);
        assert.equal(trigger.getAttribute('aria-expanded'), 'false');
        assert.equal(menu.hidden, true);
        assert.equal(dom.window.document.activeElement.id,
            action === 'filter-settings' ? 'settingsFocusTarget' : 'nextUiNotificationMenuBtn');
    }
    assert.equal(byId('nextUiNotificationFilterToggle').getAttribute('aria-checked'), 'true');

    controller.open();
    const filter = byId('nextUiNotificationFilterToggle');
    filter.focus();
    filter.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'ContextMenu', bubbles: true, cancelable: true,
    }));
    await Promise.resolve();
    assert.equal(calls.at(-1), 'filter-settings');
    assert.equal(menu.hidden, true);
    assert.equal(dom.window.document.activeElement.id, 'settingsFocusTarget');
    assert.deepEqual(calls, [
        'forum', 'memo', 'log', 'observer', 'toggle',
        'filter-settings', 'clear', 'filter-settings'
    ]);

    trigger.click();
    assert.equal(dispatcher.entry.close(), true);
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(dom.window.document.activeElement, trigger);
    controller.dispose();
    assert.equal(dispatcher.entry, null);
    const callCount = calls.length;
    byId('nextUiNotificationForum').click();
    trigger.click();
    await Promise.resolve();
    assert.equal(calls.length, callCount, 'disposed action listeners must be removed');
    assert.equal(menu.hidden, true, 'disposed trigger must not reopen the menu');
    dom.window.close();
});

test('notification menu closes and restores focus after a rejected action', async () => {
    const dom = fixture();
    const toasts = [];
    const controller = new NotificationMenuController({
        window: dom.window,
        filterManager: { isFilterEnabled: () => true },
        showToast: (...args) => toasts.push(args),
    });
    assert.equal(controller.mount(), true);
    controller.open();
    const result = await controller.runAction(async () => { throw new Error('synthetic action rejection'); });
    assert.equal(result.success, false);
    assert.equal(result.error, 'synthetic action rejection');
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0][1], 'error');
    assert.equal(dom.window.document.getElementById('nextUiNotificationMenu').hidden, true);
    assert.equal(dom.window.document.getElementById('nextUiNotificationMenuBtn').getAttribute('aria-expanded'), 'false');
    assert.equal(dom.window.document.activeElement.id, 'nextUiNotificationMenuBtn');
    assert.equal(dom.window.document.getElementById('nextUiNotificationFilterToggle').getAttribute('aria-checked'), 'true');
    controller.dispose();
    dom.window.close();
});

test('notification menu refuses incomplete accepted command markup', () => {
    for (const id of [
        'nextUiNotificationForum', 'nextUiNotificationMemo',
        'nextUiNotificationLog', 'nextUiNotificationObserver',
        'nextUiNotificationFilterToggle', 'nextUiNotificationSettings', 'nextUiNotificationClear'
    ]) {
        const dom = fixture();
        dom.window.document.getElementById(id).remove();
        const controller = new NotificationMenuController({ window: dom.window });
        assert.equal(controller.mount(), false, id);
        assert.equal(controller.mounted, false);
        assert.equal(dom.window.document.getElementById('nextUiNotificationMenu').hidden, true);
        controller.dispose();
        dom.window.close();
    }
});

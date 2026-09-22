import { extension_settings } from '../../../extensions.js';
import * as host from '../../../../script.js';

// Independent add-on: upstream index.js is deliberately unchanged.
const SETTINGS_KEY = 'kimi_reasoning_injector';
const PROFILES_KEY = 'kimi_reasoning_injector_saved_profiles';
const CARD_ID = 'kimi_saved_settings_card';
const SETTING_KEYS = ["enabled","language","injectTarget","reasoningContent","reasoningEffort","injectModes","thinkingFold","foldMode","foldMarker","rerollOnEnglishThinking","rerollOnNoThinking","rerollOnEmpty","rerollOnNoMutter","rerollOnKeyword","rerollKeywords","mutterSoundEnabled","mutterSoundType","autoRerollLimit","fixMesOnGenerate","fixMarker","rerollMinThinkingTokens","nameEnabled","nameValue","nameModes","autoStopEnabled","autoStopMarker","rerollPaused","dsThinkingMode","dsReasoningEffort","wordReplaceEnabled","wordReplacements","customPresets","reasoningHeightCss","reasoningHeightCssValue","showTps","keepScrollOnGenerate","reasoningTimer","mutterVibrate","mutterTrigger","clineProviderEnabled","clinePriority","psnapShowFloat","floatBarEnabled","floatShowTagFix","floatShowCline","floatRouteBadge","clineRouteAlert","opencodeHeadersEnabled","autoUpdate","floatPanelKeys","floatPanelAllKey","clineModelOverride","clineProvider","clineShowMenuBtn","clineCustomProviders","floatShowStopReroll","stopRerollMenuBtn","stopRerollInlineBtn","psnapShowMenuBtn"];
const clone = value => JSON.parse(JSON.stringify(value));

export function snapshot(settings) {
    return Object.fromEntries(SETTING_KEYS.filter(key => Object.hasOwn(settings, key))
        .map(key => [key, clone(settings[key])]));
}

export function restore(settings, saved) {
    // Preserve the object referenced by upstream, and never touch other modules.
    for (const key of SETTING_KEYS) {
        if (Object.hasOwn(saved, key)) settings[key] = clone(saved[key]);
    }
}

function profiles() {
    const saved = extension_settings[PROFILES_KEY];
    return Array.isArray(saved) ? saved : [];
}

async function persist() {
    // saveSettings catches HTTP errors itself; only its success event confirms a save.
    const event = host.event_types?.SETTINGS_UPDATED;
    if (typeof host.saveSettings !== 'function' || !event || !host.eventSource) {
        throw new Error('此酒馆版本缺少设置保存确认接口，未执行操作。');
    }
    let confirmed = false;
    const done = () => { confirmed = true; };
    host.eventSource.on(event, done);
    try {
        await host.saveSettings();
        if (!confirmed) throw new Error('设置未确认保存，请检查服务器连接后重试。');
    } finally {
        host.eventSource.removeListener(event, done);
    }
}

function mount() {
    const panel = document.querySelector('#kimi_reasoning_injector_settings .inline-drawer-content');
    if (!panel || document.getElementById(CARD_ID)) return;
    const card = document.createElement('details');
    card.id = CARD_ID;
    card.className = 'kimi-card';
    card.innerHTML = `
        <summary>💾 保存设置</summary>
        <div class="kimi-card-body">
            <input class="text_pole profile-name" type="text" maxlength="80"
                placeholder="设置方案名称" aria-label="设置方案名称">
            <button type="button" class="menu_button profile-save">保存当前设置</button>
            <select class="text_pole profile-list" aria-label="已保存的设置方案"></select>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" class="menu_button profile-load">读取并刷新</button>
                <button type="button" class="menu_button profile-delete">删除</button>
            </div>
            <p class="kimi-hint">保存注入、自定义模板、模型参数、重roll、美化、替换及快捷入口设置。
                不含 API 密钥池、标签修复和酒馆预设条目快照。读取成功后刷新页面生效。</p>
            <p class="profile-status kimi-hint" role="status" aria-live="polite"></p>
        </div>`;
    panel.querySelector('.kimi-ver-card')?.after(card);
    if (!card.isConnected) panel.prepend(card);
    const name = card.querySelector('.profile-name');
    const list = card.querySelector('.profile-list');
    const status = card.querySelector('.profile-status');
    let busy = false;
    function render(selected = list.value) {
        list.replaceChildren();
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = '请选择已保存的方案';
        list.append(empty);
        for (const profile of profiles()) {
            const option = document.createElement('option');
            option.value = profile.name;
            option.textContent = profile.name;
            list.append(option);
        }
        list.value = selected;
        card.querySelector('.profile-load').disabled = busy || !list.value;
        card.querySelector('.profile-delete').disabled = busy || !list.value;
    }
    list.addEventListener('change', () => {
        name.value = list.value;
        render();
    });
    async function act(action) {
        if (busy) return;
        busy = true;
        card.querySelectorAll('button,input,select').forEach(el => { el.disabled = true; });
        try {
            await action();
        } catch (error) {
            status.textContent = error.message || '操作失败，请重试。';
            console.error('[余温设置存档]', error);
        } finally {
            busy = false;
            card.querySelectorAll('button,input,select').forEach(el => { el.disabled = false; });
            render();
        }
    }
    async function saveProfiles(next) {
        const previous = extension_settings[PROFILES_KEY];
        extension_settings[PROFILES_KEY] = next;
        try { await persist(); }
        catch (error) {
            if (previous === undefined) delete extension_settings[PROFILES_KEY];
            else extension_settings[PROFILES_KEY] = previous;
            throw error;
        }
    }
    card.querySelector('.profile-save').addEventListener('click', () => act(async () => {
        const label = name.value.trim();
        if (!label) throw new Error('请先填写设置方案名称。');
        const settings = extension_settings[SETTINGS_KEY];
        if (!settings) throw new Error('工具箱尚未初始化，请稍后重试。');
        const next = profiles().slice();
        const index = next.findIndex(profile => profile.name === label);
        if (index >= 0 && !window.confirm('覆盖设置方案「' + label + '」？')) return;
        const profile = { name: label, settings: snapshot(settings) };
        if (index >= 0) next[index] = profile;
        else next.push(profile);
        await saveProfiles(next);
        render(label);
        status.textContent = '已保存「' + label + '」。';
    }));
    card.querySelector('.profile-delete').addEventListener('click', () => act(async () => {
        const label = list.value;
        if (!label || !window.confirm('删除设置方案「' + label + '」？不会修改当前设置。')) return;
        await saveProfiles(profiles().filter(profile => profile.name !== label));
        render('');
        status.textContent = '已删除「' + label + '」。';
    }));
    card.querySelector('.profile-load').addEventListener('click', () => act(async () => {
        const profile = profiles().find(item => item.name === list.value);
        if (!profile) throw new Error('请先选择设置方案。');
        const context = window.SillyTavern?.getContext?.();
        if (host.is_send_press || (typeof context?.isGenerating === 'function' && context.isGenerating())) {
            throw new Error('请等生成结束后再读取设置。');
        }
        if (!window.confirm('读取「' + profile.name + '」并刷新页面？未存档的工具箱设置会被替换。')) return;
        const settings = extension_settings[SETTINGS_KEY];
        const previous = snapshot(settings);
        restore(settings, profile.settings);
        try { await persist(); }
        catch (error) {
            // Restore missing keys too if a snapshot introduced one.
            for (const key of SETTING_KEYS) delete settings[key];
            restore(settings, previous);
            throw error;
        }
        window.location.reload();
    }));
    render();
}

function start() {
    mount();
    // Upstream rebuilds its settings panel on language changes.
    const container = document.getElementById('extensions_settings');
    if (container) new MutationObserver(mount).observe(container, { childList: true, subtree: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

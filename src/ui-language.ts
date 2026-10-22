/** UI language only; never translates saved source content or user metadata. */
export type UiLanguage = 'zh' | 'en';
function browserLanguage(): UiLanguage {
    const language = typeof chrome !== 'undefined' && chrome.i18n ? chrome.i18n.getUILanguage() : typeof navigator !== 'undefined' ? navigator.language : 'en';
    return language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
let language = browserLanguage();
export const uiLanguage = () => language;
export const tr = (zh: string, en: string) => language === 'zh' ? zh : en;
export function localizeBilingualPage(): void {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll<HTMLElement>('[data-zh][data-en]').forEach(node => {
        node.textContent = node.getAttribute(`data-${language}`) || '';
    });
    for (const attribute of ['placeholder', 'aria-label', 'title']) {
        document.querySelectorAll<HTMLElement>(`[data-zh-${attribute}]`).forEach(node => {
            node.setAttribute(attribute, node.getAttribute(`data-${language}-${attribute}`) || '');
        });
    }
}
export function initializeLanguage(onChange: () => void = () => {}): void {
    // The reader/help preference is separate from Chrome's popup and capture language.
    try {
        const saved = localStorage.getItem('gglknow-reader-language');
        if (saved === 'zh' || saved === 'en') language = saved;
    } catch { /* Language selection still works when storage is unavailable. */ }
    const select = document.getElementById('uiLanguage') as HTMLSelectElement | null;
    if (select) {
        select.value = language;
        select.addEventListener('change', () => {
            language = select.value === 'zh' ? 'zh' : 'en';
            try { localStorage.setItem('gglknow-reader-language', language); } catch { /* optional preference */ }
            localizeBilingualPage();
            onChange();
        });
    }
    localizeBilingualPage();
}

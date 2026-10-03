import {it,expect} from 'vitest';
import {detectInAppBrowser,isDismissed,externalBrowserUrl,browserInstructions,mayOfferInstall} from '../shared/in-app-browser';
it.each([
 ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/122 Mobile Instagram 320.0','Instagram'],
 ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Instagram 320.0','Instagram'],
 ['Mozilla/5.0 (Linux; Android 14) [FBAN/FB4A;FBAV/456.0]','Facebook'],
 ['Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/400.0]','Facebook'],
 ['Mozilla/5.0 (Linux; Android 14) Chrome/122.0 Mobile Safari/537.36',null],
 ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1',null]
])('detects %s', (ua,expected)=>{expect(detectInAppBrowser(ua)).toBe(expected);expect(mayOfferInstall(ua,false)).toBe(expected===null);});
it('dismissal persists with expiration and rejects garbage',()=>{const now=100000;expect(isDismissed(String(now+1000),now)).toBe(true);expect(isDismissed(String(now-1),now)).toBe(false);expect(isDismissed('NaN',now)).toBe(false);expect(isDismissed(null,now)).toBe(false);});
it('external fallback preserves slug and all query parameters',()=>{const url='https://fio.example/b/oliveira?utm_source=instagram&next=%2Fagenda#servicos';expect(externalBrowserUrl(url)).toBe(url);expect(()=>externalBrowserUrl('javascript:alert(1)')).toThrow();});
it('contextual fallback does not promise forced external opening',()=>{expect(browserInstructions('iPhone Instagram')).toContain('Safari');expect(browserInstructions('Android Instagram')).toContain('⋮');expect(mayOfferInstall('Chrome',true)).toBe(false);});
